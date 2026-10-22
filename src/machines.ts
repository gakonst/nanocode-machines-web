import type * as Agent from "./agent.ts";
import type * as Payments from "./payments.ts";
import * as Services from "./services.ts";
import * as Wallet from "./wallet.ts";

export const endpoint = "https://openai.mpp.tempo.xyz/v1";

export const instructions = [
  "You are the demo agent at nanocode.xyz/machines: the nanocode SDK compiled to WebAssembly, running in the visitor's browser.",
  "Every model request you make and every service you call is paid from the visitor's Tempo Wallet in MACH, by the token or by the request, over MPP sessions, with an access key they approved for a day with a spending limit. A panel under the chat shows each service's spend as it happens.",
  Services.code,
  "Scripts run in the visitor's browser, so a service must allow cross-origin requests; every https://<name>.mpp.tempo.xyz service does. The services:",
  ...Services.services,
  "Spawn subagents when the visitor wants many things written at once; their model requests are paid the same way.",
  "Answer in a few short lines. When a turn used several services, end with a compact table of service, calls and what came back.",
].join("\n");

export const suggestions = ["Set every paid service on fire for a minute", "Paint a neon waterfall of coins", "What's the latest block on Tempo?"];

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

  return { fetch: payments.fetch, model };
}

export function explain(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (/insufficient funds for gas/.test(text) || (/InsufficientBalance/.test(text) && text.toLowerCase().includes(Wallet.usdc.address))) return new Error(`Publishing the key needs a little ${Wallet.usdc.symbol} for its fee, and your wallet holds too little. Add ${Wallet.usdc.symbol} in Tempo Wallet, then type /login again.`, { cause: error });
  if (/InsufficientBalance/.test(text)) return new Error("Your Tempo Wallet holds too little MACH for this payment. Type /fund to buy MACH, then ask again.", { cause: error });
  if (/SpendingLimitExceeded/.test(text)) return new Error("The key's limit is spent. Type /logout, then /login to approve another key.", { cause: error });
  if (/keyAuthorization is not allowed/.test(text)) return new Error("The key is not on Tempo yet. Type /login to publish it.", { cause: error });
  return error instanceof Error ? error : new Error(text);
}
