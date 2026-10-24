import { createMachine, Models } from "nanocode-ts/machines";
import wasm from "nanocode-ts/nanocode_wasm.wasm?url";
import * as Services from "./services.ts";

export const models = Models.models;

export const instructions = [
  "You are the demo agent at nanocode.xyz/machines: the nanocode SDK compiled to WebAssembly, running in the visitor's browser.",
  "Every model request you make and every service you call is paid from the visitor's Tempo Wallet in MACH, by the token or by the request, over MPP sessions, with an access key they approved for a day with a spending limit. A panel under the chat shows each service's spend as it happens.",
  Services.code,
  "Scripts run in the visitor's browser, so a service must allow cross-origin requests; every https://<name>.mpp.tempo.xyz service does. The services:",
  ...Services.services,
  Services.mcp,
  Services.search,
  "Spawn subagents when the visitor wants many things written at once; their model requests are paid the same way.",
  "Answer in a few short lines. When a turn used several services, end with a compact table of service, calls and what came back.",
].join("\n");

export const suggestions = ["Set every paid service on fire for a minute", "Paint a neon waterfall of coins", "What's the latest block on Tempo?"];

export const highlight = () => import("nanocode-ts/highlight").then(module => module.highlight);

export function setup(history: string, model: () => Models.Model) {
  return createMachine({
    history,
    instructions,
    model,
    sqlite: () => import("@sqlite.org/sqlite-wasm").then(module => module.default()),
    suggestion: suggestions[0],
    wasm: () => WebAssembly.compileStreaming(fetch(wasm)),
  });
}
