# DuckDuckGo AI API

> This is a heavily modified fork of [duckduckgo-ai](https://github.com/anhao/duckduckgo-ai).

Yet another DuckDuckGo AI reverse engineering API running on Cloudflare Worker.

DuckDuckGo AI: https://duckduckgo.com/?q=DuckDuckGo&ia=chat

## Deployment

1. Clone the repo.
2. Install dependencies by running `npm i`, configure KV storage and API_KEY to protect this deployment.
3. Deploy to Cloudflare Worker by running `npm run deploy`.
4. Open the worker URL in the browser and enjoy!

**Warning: If API_KEY is not set, your API will be publicly accessible.**

Configure API_KEY and KV storage:
1. Open `wrangler.toml` with your editor.
2. Fill in your own API_KEY (Actually a password), for example: sk-my-private-api-do-not-use.
3. Fill in your own KV storage ID, create and find it in your Cloudflare console.

## Supported Models

- gpt-3.5-turbo-0125
- claude-3-haiku-20240307
- meta-llama/Llama-3-70b-chat-hf
- mistralai/Mixtral-8x7B-Instruct-v0.1

## Usage

Replace **worker_url** with your own:

Create conversation:
```shell
curl https://worker_url/v1/chat/completions \
-H "Authorization: Bearer $MY_WORKER_APIKEY" \
-H "Content-Type: application/json" \
-d '{
  "model": "meta-llama/Llama-3-70b-chat-hf",
  "messages": [
    {
      "role": "user",
      "content": "Yo"
    }
  ]
}'
```

Response:
> Note: The worker will attempt to save and restore the x-vqd-4 header by hashing your chat history, but it's not guaranteed to work.
> You should manually obtain it from the response header and pass it in the next request to ensure continuous chat functionality.

```HTTP
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Vary: Accept-Encoding
x-vqd-4: 4-974561083254981360721938476051293847215
Server: cloudflare

{
  "id": "chatcmpl-duckduckgo-ai",
  "object": "chat.completion",
  "created": 1718720705,
  "model": "meta-llama/Llama-3-70b-chat-hf",
  "system_fingerprint": "fp_e7692cea7",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Yo! What's up?"
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

## Known Limits

### Conversation with more than one prompt message

DuckDuckGo AI requires the x-vqd-4 header to continue your conversation from the last response. The worker will try to save and restore it by hashing your messages, but this might cause issues when multiple persons send exactly the same message or your client application does not bring all history messages.
You should obtain the x-vqd-4 header from the response header and pass it when you need to continue the conversation.