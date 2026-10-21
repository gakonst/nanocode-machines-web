import type { HostTool } from "nanocode-ts";
import type * as Agent from "./agent.ts";
import type * as Payments from "./payments.ts";
import * as Wallet from "./wallet.ts";

export const endpoint = "https://openai.mpp.tempo.xyz/v1";

const allowed = /^https:\/\/[a-z0-9-]+\.mpp\.tempo\.xyz(\/|$)/;

const preview = 1_000;

export const instructions = [
  "You are the demo agent at nanocode.xyz/machines: the nanocode SDK compiled to WebAssembly, running in the visitor's browser.",
  "Every model request you make and every service you call is paid from the visitor's Tempo Wallet in MACH, by the token or by the request, over MPP sessions, with an access key they approved for a day with a spending limit. A panel under the chat shows each service's spend as it happens.",
  "Call services with the pay tool. Requests in one pay call run at the same time, so put many in one call when the visitor wants a lot at once.",
  "The services, all on https://<name>.mpp.tempo.xyz:",
  "- rpc: POST https://rpc.mpp.tempo.xyz/ with a JSON-RPC body for Tempo mainnet, such as eth_blockNumber, eth_gasPrice, eth_chainId, net_version or eth_getBlockByNumber [\"latest\", false].",
  "- openrouter: POST https://openrouter.mpp.tempo.xyz/v1/chat/completions with {\"model\":\"meta-llama/llama-3.1-8b-instruct\",\"max_tokens\":60,\"messages\":[...]}.",
  "- kicksdb: GET https://kicksdb.mpp.tempo.xyz/v3/stockx/products?limit=2&query=<sneaker>.",
  "- storage: PUT https://storage.mpp.tempo.xyz/<key> with a small text body, and GET https://storage.mpp.tempo.xyz/ to list the bucket.",
  "- firecrawl: POST https://firecrawl.mpp.tempo.xyz/v1/scrape with {\"url\":\"https://...\",\"formats\":[\"markdown\"]}.",
  "- speech: POST https://microsoft-ai.mpp.tempo.xyz/v1/audio/speech with {\"model\":\"microsoft/mai-voice-2.1-flash\",\"voice\":\"en-US-AvaNeural\",\"input\":\"...\",\"response_format\":\"mp3\"}, or https://elevenlabs.mpp.tempo.xyz/v1/audio/speech with {\"model\":\"elevenlabs/eleven-flash-v2.5\",\"voice\":\"21m00Tcm4TlvDq8ikWAM\",\"input\":\"...\",\"response_format\":\"mp3\"}.",
  "- fal: POST https://fal.mpp.tempo.xyz/fal-ai/flux/schnell with {\"prompt\":\"...\",\"image_size\":\"square\"}, which answers with image URLs. Show an image in your reply as Markdown, ![description](url).",
  "- goflightlabs: GET https://goflightlabs.mpp.tempo.xyz/flights?limit=1.",
  "Spawn subagents when the visitor wants many things written at once; their model requests are paid the same way.",
  "Answer in a few short lines. When a turn used several services, end with a compact table of service, calls and what came back.",
].join("\n");

export const suggestions = ["Set every paid service on fire for a minute", "Paint a neon waterfall of coins", "What's the latest block on Tempo?"];

export const tools: readonly HostTool[] = [
  {
    description: "Sends HTTPS requests to Tempo's paid MPP services (https://<name>.mpp.tempo.xyz), paid from the visitor's Tempo Wallet in MACH, and returns each response's status, content type, time and the opening of its body. Requests in one call run at the same time.",
    name: "pay",
    parameters: {
      additionalProperties: false,
      properties: {
        requests: {
          items: {
            additionalProperties: false,
            properties: {
              body: { description: "A JSON or text body.", type: "string" },
              content_type: { description: "Defaults to application/json when there is a body.", type: "string" },
              method: { enum: ["DELETE", "GET", "POST", "PUT"], type: "string" },
              url: { description: "An https://<name>.mpp.tempo.xyz URL.", type: "string" },
            },
            required: ["url", "method"],
            type: "object",
          },
          minItems: 1,
          type: "array",
        },
      },
      required: ["requests"],
      type: "object",
    },
  },
];

type Request = { body?: string; content_type?: string; method?: string; url?: string };

export function agent(payments: Payments.Payments) {
  const model: Agent.Model = {
    dispatch: (request, signal) => payments.fetch(request.endpoint, { body: request.body as Uint8Array<ArrayBuffer>, headers: request.headers, method: "POST", signal }).catch((error: unknown) => {
      throw explain(error);
    }),
    endpoint,
    model: "gpt-6-luna",
    provider: "codex",
    subagents: true,
    thinking: "low",
  };

  async function call(name: string, input: unknown) {
    if (name !== "pay") throw new Error(`No tool is named ${name}.`);
    const requests = (input as { requests?: unknown } | null)?.requests;
    if (!Array.isArray(requests) || requests.length === 0) throw new Error("requests must list at least one request");
    return { responses: await Promise.all(requests.map((request: Request) => send(request))) };
  }

  async function send(request: Request) {
    const { body, content_type, method = "GET", url = "" } = request;
    if (!allowed.test(url)) return { error: "pay only reaches https://<name>.mpp.tempo.xyz URLs", url };
    const started = performance.now();
    try {
      const response = await payments.fetch(url, { body: body ?? null, headers: body === undefined ? {} : { "content-type": content_type ?? "application/json" }, method });
      const type = response.headers.get("content-type") ?? "";
      const textual = /json|text|xml/.test(type);
      const bytes = textual ? undefined : (await response.arrayBuffer()).byteLength;
      const text = textual ? await response.text() : undefined;
      return {
        ms: Math.round(performance.now() - started),
        status: response.status,
        type,
        url,
        ...(bytes === undefined ? {} : { bytes }),
        ...(text === undefined ? {} : { body: text.length > preview ? `${text.slice(0, preview)}… (${text.length} characters)` : text }),
      };
    } catch (error) {
      return { error: explain(error).message, ms: Math.round(performance.now() - started), url };
    }
  }

  return { call, model };
}

export function explain(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (/insufficient funds for gas/.test(text) || (/InsufficientBalance/.test(text) && text.toLowerCase().includes(Wallet.usdc.address))) return new Error(`Publishing the key needs a little ${Wallet.usdc.symbol} for its fee, and your wallet holds too little. Add ${Wallet.usdc.symbol} in Tempo Wallet, then type /login again.`, { cause: error });
  if (/InsufficientBalance/.test(text)) return new Error("Your Tempo Wallet holds too little MACH for this payment. Type /fund to buy MACH, then ask again.", { cause: error });
  if (/SpendingLimitExceeded/.test(text)) return new Error("The key's limit is spent. Type /logout, then /login to approve another key.", { cause: error });
  if (/keyAuthorization is not allowed/.test(text)) return new Error("The key is not on Tempo yet. Type /login to publish it.", { cause: error });
  return error instanceof Error ? error : new Error(text);
}
