import type { NanocodeEnv } from "nanocode-ts/cloudflare";
import type { Wallet } from "./wallet.ts";

export interface Env extends NanocodeEnv {
  WALLETS: DurableObjectNamespace<Wallet>;
  KEY_SECRET: string;
  ASSETS: Fetcher;
}

export function wallet(env: Env, account: string) {
  return env.WALLETS.get(env.WALLETS.idFromName(account.toLowerCase()));
}

export function paying(env: Env, account: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body = request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
    return wallet(env, account).fetch(new Request("https://wallet.internal/pay", { method: "POST", body, signal: request.signal, headers: { "x-target": request.url, "x-method": request.method, "x-headers": JSON.stringify([...request.headers]) } }));
  };
}

export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
