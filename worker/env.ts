import type { NanocodeEnv } from "nanocode-cloudflare-durable";
import type { Wallet } from "./wallet.ts";

export interface Env extends NanocodeEnv {
  WALLETS: DurableObjectNamespace<Wallet>;
  KEY_SECRET: string;
  ASSETS: Fetcher;
}

export function wallet(env: Env, account: string) {
  return env.WALLETS.get(env.WALLETS.idFromName(account.toLowerCase()));
}

export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
