export const services = [
  "- rpc: POST https://rpc.mpp.tempo.xyz/ with a JSON-RPC body for Tempo mainnet, such as eth_blockNumber, eth_gasPrice, eth_chainId, net_version or eth_getBlockByNumber [\"latest\", false].",
  "- openrouter: POST https://openrouter.mpp.tempo.xyz/v1/chat/completions with {\"model\":\"meta-llama/llama-3.1-8b-instruct\",\"max_tokens\":60,\"messages\":[...]}.",
  "- kicksdb: GET https://kicksdb.mpp.tempo.xyz/v3/stockx/products?limit=2&query=<sneaker>.",
  "- storage: PUT https://storage.mpp.tempo.xyz/<key> with a small text body, and GET https://storage.mpp.tempo.xyz/ to list the bucket.",
  "- firecrawl: POST https://firecrawl.mpp.tempo.xyz/v1/scrape with {\"url\":\"https://...\",\"formats\":[\"markdown\"]}.",
  "- speech: POST https://microsoft-ai.mpp.tempo.xyz/v1/audio/speech with {\"model\":\"microsoft/mai-voice-2.1-flash\",\"voice\":\"en-US-AvaNeural\",\"input\":\"...\",\"response_format\":\"mp3\"}, or https://elevenlabs.mpp.tempo.xyz/v1/audio/speech with {\"model\":\"elevenlabs/eleven-flash-v2.5\",\"voice\":\"21m00Tcm4TlvDq8ikWAM\",\"input\":\"...\",\"response_format\":\"mp3\"}.",
  "- fal: POST https://fal.mpp.tempo.xyz/fal-ai/flux/schnell with {\"prompt\":\"...\",\"image_size\":\"square\"}, which answers with image URLs. Show an image in your reply as Markdown, ![description](url).",
  "- goflightlabs: GET https://goflightlabs.mpp.tempo.xyz/flights?limit=1.",
  "- gateway: the Tempo gateway at https://gateway.tempo-dev.workers.dev gives the wallet a private key/value store, object storage and inference: POST /v1/kv/set {key, value, ttl?} and /v1/kv/get {key} with headers content-type: application/json and gateway-app: nanocode; GET /v1/capabilities lists the rest.",
];

export const code = "You work in Code Mode: exec runs JavaScript, and its global fetch pays any MPP service it calls in MACH from the wallet, over MPP sessions or per request, so call services with fetch and never ask for payment details. A 402 that still comes back means the wallet could not pay. Run independent requests in one exec with Promise.all, and text() only the parts of each response you need, since the wallet pays for every token you read back.";
