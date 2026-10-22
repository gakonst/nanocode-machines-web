import { createNanocode } from "nanocode-cloudflare-durable";
import { type Address, isAddressEqual, isHex } from "viem";
import { Account, Actions, createClient, http } from "viem/tempo";
import { tempo } from "viem/tempo/chains";
import { machines } from "./egress.ts";
import { type Env, json, wallet } from "./env.ts";
import { machineTools } from "./tools.ts";
import { digest, type KeyRecord, RPC } from "./wallet.ts";

export { Wallet } from "./wallet.ts";

const TOKEN = /^(0x[0-9a-f]{40})\.[0-9a-f]{64}$/;
const SECRET_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;

async function principal(request: Request, env: Env) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : new URL(request.url).searchParams.get("token") ?? "";
  const match = TOKEN.exec(token);
  if (!match) return null;
  const expires = await wallet(env, match[1]!).authenticate(await digest(token));
  return expires ? { account: match[1]!, expires_at: expires } : null;
}

async function register(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => undefined) as { address?: string; key_type?: string; private_key?: string } | undefined;
  const address = body?.address;
  const key = body?.private_key;
  const keyType = body?.key_type === "p256" ? "p256" : body?.key_type === "secp256k1" ? "secp256k1" : undefined;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address) || !key || !isHex(key) || key.length !== 66 || !keyType) return json({ error: "send {address, key_type: secp256k1 | p256, private_key}" }, 400);
  const access = keyType === "p256" ? Account.fromP256(key, { access: address as Address }) : Account.fromSecp256k1(key, { access: address as Address });
  const keyAddress = access.accessKeyAddress;
  const metadata = await Actions.accessKey.getMetadata(createClient({ chain: tempo, transport: http(RPC) }), { account: address as Address, accessKey: keyAddress });
  if (!isAddressEqual(metadata.address, keyAddress) || metadata.isRevoked) return json({ error: `key ${keyAddress} is not an active access key of ${address} on Tempo; publish it first` }, 403);
  const expiry = Number(metadata.expiry);
  if (expiry * 1000 <= Date.now()) return json({ error: "the access key has expired" }, 403);
  const record: KeyRecord = { address: address.toLowerCase() as Address, keyAddress, keyType, key, expiry };
  const token = await wallet(env, address).register(record);
  return json({ token, address: record.address, key_address: keyAddress, expires_at: expiry * 1000, spend_policy: metadata.spendPolicy });
}

async function api(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/v1/keys" && request.method === "POST") return register(request, env);
  const caller = await principal(request, env);
  if (!caller) return json({ error: "send Authorization: Bearer <token> from POST /v1/keys" }, 401);
  const stub = wallet(env, caller.account);
  if (pathname === "/v1/me" && request.method === "GET") return json({ ...(await stub.status()), secrets: await stub.secretNames() });
  const secret = /^\/v1\/secrets\/([^/]+)$/.exec(pathname);
  if (secret) {
    const name = decodeURIComponent(secret[1]!);
    if (!SECRET_NAME.test(name)) return json({ error: "secret names are [A-Z_][A-Z0-9_]{0,63}" }, 400);
    if (request.method === "DELETE") return await stub.setSecret(name, null), json({ deleted: name });
    if (request.method !== "PUT") return json({ error: "PUT or DELETE" }, 405);
    const value = (await request.json().catch(() => undefined) as { value?: unknown } | undefined)?.value;
    if (typeof value !== "string" || !value || value.length > 8192) return json({ error: "send {value}" }, 400);
    await stub.setSecret(name, value);
    return json({ stored: name });
  }
  if (pathname === "/v1/files" && request.method === "GET") return json({ sessions: await stub.allFiles() });
  const file = /^\/v1\/files\/([^/]+)\/(.+)$/.exec(pathname);
  if (file && request.method === "GET") {
    const content = await stub.readFile(decodeURIComponent(file[1]!), decodeURIComponent(file[2]!));
    return content === undefined ? json({ error: "no such file" }, 404) : new Response(content, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return json({ error: "not_found" }, 404);
}

const nanocode = createNanocode<Env>({
  authenticate: principal,
  egress: machines,
  tools: machineTools,
  subagents: true,
  streamToolInput: true,
});

export const { AgentSession } = nanocode;

const DEVICE = "https://wallet.tempo.xyz/api/auth/device";

async function relay(request: Request, pathname: string): Promise<Response> {
  const response = await fetch(`${DEVICE}${pathname.slice("/api/device".length)}`, {
    body: await request.text(),
    headers: { accept: "application/json", "content-type": "application/json" },
    method: "POST",
  });
  return new Response(response.body, { headers: { "cache-control": "no-store", "content-type": response.headers.get("content-type") ?? "application/json" }, status: response.status });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && (pathname === "/api/device/register" || pathname === "/api/device/token")) return relay(request, pathname);
    if (pathname.startsWith("/v1/")) return api(request, env, pathname);
    if (pathname.startsWith("/sessions/") || pathname === "/health") return nanocode.fetch(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
