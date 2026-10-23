import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import { AgentRuntime, type LoggedEvent, sessionUuid, type SqlHost, type SqlValue, type TurnReport } from "nanocode-ts";
import { Bash, SqlFileSystem } from "nanocode-ts/bash";
import wasm from "nanocode-ts/nanocode_wasm.wasm?url";

const scope = "machines";

let compiled: Promise<WebAssembly.Module> | undefined;

export type Model = {
  dispatch: (request: { body: Uint8Array; endpoint: string; headers: [string, string][] }, signal: AbortSignal) => Promise<Response>;
  endpoint: string;
  model: string;
  provider: "claude" | "codex";
  subagents: boolean;
  thinking: "high" | "low" | "medium" | "none";
};

export type Options = {
  fetch: typeof fetch;
  instructions: string;
  model: Model;
  onEvent: (event: LoggedEvent) => void;
};

export type Agent = {
  ask: (prompt: string) => Promise<TurnReport | undefined>;
  dispose: () => Promise<void>;
  model: string;
  stats: () => { requests: number; rows: number };
  steer: (prompt: string) => Promise<"queued" | "steered">;
};

export async function create(options: Options): Promise<Agent> {
  const { instructions, model, onEvent } = options;
  compiled ??= WebAssembly.compileStreaming(fetch(wasm));
  const [module, sqlite3] = await Promise.all([compiled, sqlite3InitModule()]);
  const database = new sqlite3.oo1.DB(":memory:", "c");
  const host = sql(database);
  // The model's shell and file tools and the cells' bash share files kept in the session's database.
  const shell = await Bash.create({ cwd: "/workspace", fs: new SqlFileSystem(host, scope) });
  const runtime = await AgentRuntime.instantiate(module, host, {
    published: events => {
      for (const entry of events) onEvent(entry);
    },
  });
  await runtime.open(
    {
      code_mode: true,
      endpoint: model.endpoint,
      event_coalesce_ms: 50,
      instructions,
      model: model.model,
      provider: model.provider,
      scope,
      session_id: sessionUuid(),
      subagents: model.subagents,
      subscription: false,
      thinking: model.thinking,
      workspace: shell.cwd,
    },
    { dispatch: (request, signal) => model.dispatch(request, signal), fetch: options.fetch, workspace: shell.workspace() },
  );

  async function submit(prompt: string) {
    const request = crypto.randomUUID();
    const submitted = await runtime.submit(scope, { metadata: {}, prompt, request_id: request });
    if (submitted.submitted !== "accepted") throw new Error(`The session refused the prompt (${submitted.submitted}).`);
    return request;
  }

  let draining: Promise<void> | undefined;
  function drain() {
    draining ??= (async () => {
      try {
        for (;;) {
          const next = (await runtime.pending(scope))[0];
          if (!next) break;
          const driven = await runtime.drive(next.report.request_id);
          if (driven.retry) throw new Error("The session must reopen. Reload the page to start again.");
          if (driven.waiting) await new Promise(resolve => setTimeout(resolve, 500));
        }
      } finally {
        draining = undefined;
      }
    })();
    return draining;
  }

  return {
    async ask(prompt) {
      const request = await submit(prompt);
      await drain();
      return (await runtime.turn(scope, request))?.report;
    },
    dispose: () => runtime.dispose(),
    model: model.model,
    stats: () => ({
      requests: runtime.metrics.model_requests,
      rows: (() => {
        try {
          return Number(database.selectValue("SELECT (SELECT count(*) FROM events) + (SELECT count(*) FROM blobs)") ?? 0);
        } catch {
          return 0;
        }
      })(),
    }),
    async steer(prompt) {
      if (await runtime.steer(crypto.randomUUID(), prompt)) return "steered";
      await submit(prompt);
      void drain();
      return "queued";
    },
  };
}

function sql(database: Database): SqlHost {
  return {
    transaction(_kind, _operation, statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const rows = statements.map(([query, ...bind]) => database.exec({ bind: bind as never, returnValue: "resultRows", rowMode: "array", sql: query }) as SqlValue[][]);
        database.exec("COMMIT");
        return rows;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
