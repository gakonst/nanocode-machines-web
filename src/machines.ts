import { createMachine, Models } from "nanocode-ts/machines";
import wasm from "nanocode-ts/nanocode_wasm.wasm?url";

export const models = Models.models;

export const suggestions = ["Call every paid service once in parallel, spending at most $0.05 in total", "Paint a neon waterfall of coins", "What's the latest block on Tempo?"];

export const highlight = () => import("nanocode-ts/highlight").then(module => module.highlight);

export function setup(history: string, model: () => Models.Model) {
  return createMachine({
    history,
    model,
    sqlite: () => import("@sqlite.org/sqlite-wasm").then(module => module.default()),
    suggestion: suggestions[0],
    wasm: () => WebAssembly.compileStreaming(fetch(wasm)),
  });
}
