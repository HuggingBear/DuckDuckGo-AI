type ApplicationBindings = {
  API_KEY: string
}

export interface OpenAIRequest {
  model: string
  messages: {
    role: string,
    content: string
  }[],
  stream: boolean,
}

interface OpenAIResponseChoice {
  "index": number,
  "message"?: {
    "role": string,
    "content": string,
  },
  "logprobs"?: null,
  "finish_reason"?: string
}
export interface OpenAIResponse {
  "id": string,
  "object": string,
  "created": number,
  "model": string,
  "system_fingerprint": string,
  "choices": OpenAIResponseChoice[],
  "usage": {
    "prompt_tokens": number,
    "completion_tokens": number,
    "total_tokens": number
  }
}

interface OpenAIStreamResponseChoice {
  index: number,
  delta?: {
    role: string,
    content: string
  },
  finish_reason?: string | null,
  content_filter_results?: null,
}

export interface OpenAIStreamResponse {
  id: string,
  object: string,
  created: number,
  model: string,
  system_fingerprint: string,
  choices: OpenAIStreamResponseChoice[]
}
