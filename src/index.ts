import { Context, Hono } from 'hono';
import { z } from 'zod';
import { validator } from 'hono/validator';
import { ApplicationBindings, OpenAIRequest, OpenAIResponse, OpenAIStreamResponse } from './types';
import { SSEStreamingApi, streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36",
  "Accept": "text/event-stream",
  "Accept-Language": "de,en-US;q=0.7,en;q=0.3",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": "https://duckduckgo.com/?q=DuckDuckGo&ia=chat",
  "Content-Type": "application/json",
  "Origin": "https://duckduckgo.com",
  "Connection": "keep-alive",
  "Cookie": "dcm=1; bg=-1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "Pragma": "no-cache",
  "TE": "trailers",
  "x-vqd-accept": "1",
  "cache-control": "no-store"
};

const statusURL = 'https://duckduckgo.com/duckchat/v1/status';
const chatURL = 'https://duckduckgo.com/duckchat/v1/chat';
const schema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string()
  })),
  stream: z.boolean().optional()
})


const models = [
  "gpt-3.5-turbo-0125",
  "claude-3-haiku-20240307",
  "meta-llama/Llama-3-70b-chat-hf",
  "mistralai/Mixtral-8x7B-Instruct-v0.1"
]

type AppContext = Context<{ Bindings: ApplicationBindings }>;
const app = new Hono()

// Handle CORS preflight request
app.use('/*', cors({
  origin: '*',
}));

/**
 * Fetches new x-vqd-4 conversation id from the status api header.
 * @returns {Promise<string | null>} The x-vqd-4 header value or null if not found.
 */
async function createNewConversationId(): Promise<string | null> {
  const res = await fetch(statusURL, {
    method: 'GET',
    headers: headers,
  });
  return res.headers.get('x-vqd-4');
}

/**
 * Handles the status route.
 * @param {Context} c The Hono context object.
 * @returns {Response} A response with the text 'Hi there!'.
 */
function handleStatusRoute(c: AppContext): Response {
  return c.text('Hi there!');
}

/**
 * Handles the /v1/models route.
 * @param {Context} c The Hono context object.
 * @returns {Response} A JSON response with the list of models.
 */
function handleModelsRoute(c: AppContext): Response {
  const list = models.map(model => ({
    id: model,
    object: 'model',
    created: 1686935002,
    owned_by: 'duckduckgo-ai',
  }));
  return c.json({
    object: 'list',
    data: list,
  });
}


// Validates the body of chat completions requests.
// @param {Context} c The Hono context object.
// @returns {OpenAIRequest | Response} The parsed OpenAI format request data or a 400 response if invalid.
const validateChatCompletionsRequest = validator('json', (value, c) => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0].message }, 400);
  }
  return parsed.data;
});

/**
 * Handles the OpenAI format /v1/chat/completions route.
 * @param {Context} c The Hono context object.
 * @returns {Promise<Response>} A JSON response with the chat completion or an error response.
 */
async function handleChatCompletionsRoute(c: AppContext): Promise<Response | undefined> {
  // Try authorization if API_KEY was set
  const { API_KEY } = c.env;
  if (API_KEY) {
    const authorization = c.req.header('Authorization');
    if (!authorization || `Bearer ${API_KEY}` !== authorization) {
      return c.json({ error: 'authorization error' }, 401);
    }
  }

  const params = await c.req.json<OpenAIRequest>();
  const requestParams = {
    model: params.model,
    messages: params.messages.map(({ role, content }) => ({ role: role === 'system' ? 'user' : role, content })),
  };

  // Provided in request or create a new one
  let conversationId: string | undefined;
  // Returned from DuckDuckGo response, used to continue conversation
  let newConversationId: string | undefined;

  try {
    conversationId = c.req.header('x-vqd-4');

    if (!conversationId) {
      conversationId = await createNewConversationId() || '';

      // API doesn not return new conversation id, we might been blocked
      if (!conversationId || conversationId === '') {
        return c.json({ error: 'x-xqd-4 get error' }, 400);
      }
    }

    const chatResponse = await fetch(chatURL, {
      method: 'POST',
      headers: { 'x-vqd-4': conversationId, ...headers },
      body: JSON.stringify(requestParams),
    });

    if (!chatResponse.ok) {
      return c.json({ error: 'api request error', message: await chatResponse.text() }, 400);
    }


    newConversationId = chatResponse.headers.get('x-vqd-4') ?? undefined;
    c.header('x-vqd-4', newConversationId ?? '');

    // Stream response or normal response
    const isStream = params.stream;
    const body = chatResponse.body;

    if (isStream && body) {
      return createStreamResponse(c, params.model, body);
    } else if (body) {
      return createNormalResponse(c, params.model, body);
    } else {
      return c.json({ error: 'Unable to parse response' }, 500);
    }
  } catch (e) {
    console.error('Error reading from SSE stream:', e);
    return c.json({ error: e }, 400);
  }
}

async function createStreamResponse(c: AppContext, model: string, aiResponse: ReadableStream<Uint8Array>) {
  return streamSSE(c, async (stream) => {
    const reader = aiResponse.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (let part of parts) {
          part = part.substring(6);
          await handleOpenAIStreamResponsePart(stream, part, model);
        }
      }
    } finally {
      reader.releaseLock();
    }
  });
}

async function createNormalResponse(c: AppContext, model: string, aiResponse: ReadableStream<Uint8Array>): Promise<Response> {
  async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += new TextDecoder().decode(value);
      }
    } finally {
      reader.releaseLock();
    }
    return buffer;
  }

  const buffer = await readStream(aiResponse);
  const parts = buffer.split('\n');

  let responseContent = '';

  for (let part of parts) {
    part = part.substring(6);
    try {
      const parseJson = JSON.parse(part);
      if (parseJson['message']) {
        responseContent += parseJson['message'];
      }
    } catch {
      console.log('parse error');
    }
  }

  const openAIResponse: OpenAIResponse = {
    id: 'chatcmpl-duckduck-ai',
    object: 'chat.completion',
    created: (new Date()).getTime() / 1000,
    model,
    system_fingerprint: 'fp_44709d6fcb',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent,
        },
        logprobs: null,
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };

  return c.json(openAIResponse);
}

async function handleOpenAIStreamResponsePart(destinationStream: SSEStreamingApi, part: string, model: string) {
  part = part.substring(6);

  try {
    const response = JSON.parse(part);

    const openAIResponse: OpenAIStreamResponse = {
      id: 'chatcmpl-duckduck-ai',
      object: 'chat.completion',
      created: (new Date()).getTime() / 1000,
      model,
      system_fingerprint: 'fp_44709d6fcb',
      choices: [],
    };

    if (response['message']) {
      openAIResponse.choices.push({
        index: 0,
        delta: {
          role: response['role'],
          content: response['message'],
        },
        finish_reason: null,
        content_filter_results: null,
      });

      await destinationStream.writeSSE({ data: JSON.stringify(openAIResponse) });

      return;
    } else if (part === '[DONE]') {
      openAIResponse.choices.push({
        index: 0,
        finish_reason: 'stop',
        content_filter_results: null,
        delta: undefined,
      });

      await destinationStream.writeSSE({ data: JSON.stringify(openAIResponse) });
      await destinationStream.writeSSE({ data: '[DONE]' });
    } else {
      throw new Error('Unknown stream response part');
    }
  } catch (error) {
    console.error('Response parse error', error);
  }
}

// Register routes
app.get('/status', handleStatusRoute);
app.get('/v1/models', handleModelsRoute);
app.post('/v1/chat/completions', validateChatCompletionsRequest, handleChatCompletionsRoute);

export default app;