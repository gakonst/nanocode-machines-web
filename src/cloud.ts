import type { LoggedEvent } from "nanocode-ts";
import { serverEvents } from "nanocode-ts/client";
import type * as Wallet from "./wallet.ts";

const storageKey = "nanocode.machines.cloud";

const reconnectMs = 1000;

export type Cloud = { address: string; cursor: number; expiresAt: number; open?: string; session: string; token: string };

export type Handlers = { event: (logged: LoggedEvent) => void; interrupted: () => void };

export function restore(): Cloud | undefined {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return undefined;
  const parsed = JSON.parse(saved) as Cloud;
  if (parsed.expiresAt > Date.now()) return parsed;
  localStorage.removeItem(storageKey);
  return undefined;
}

function save(cloud: Cloud) {
  localStorage.setItem(storageKey, JSON.stringify(cloud));
}

export function forget() {
  localStorage.removeItem(storageKey);
}

function headers(cloud: Cloud, extra: Record<string, string> = {}) {
  return { ...extra, authorization: `Bearer ${cloud.token}` };
}

async function failure(response: Response) {
  const text = await response.text();
  try {
    return new Error((JSON.parse(text) as { error?: string }).error ?? text);
  } catch {
    return new Error(`${response.status} ${text}`);
  }
}

export async function enable(connected: Wallet.Wallet): Promise<Cloud> {
  const response = await fetch("v1/keys", { body: JSON.stringify({ address: connected.address, key_type: "secp256k1", private_key: connected.key }), headers: { "content-type": "application/json" }, method: "POST" });
  if (!response.ok) throw await failure(response);
  const body = await response.json() as { address: string; expires_at: number; token: string };
  const cloud: Cloud = { address: body.address, cursor: 0, expiresAt: body.expires_at, session: `web-${crypto.randomUUID()}`, token: body.token };
  save(cloud);
  return cloud;
}

export async function status(cloud: Cloud) {
  const response = await fetch("v1/me", { headers: headers(cloud) });
  if (!response.ok) throw await failure(response);
  return await response.json() as { spent: Record<string, string> };
}

async function follow(cloud: Cloud, response: Response, request: string, handlers: Handlers): Promise<boolean> {
  if (!response.ok || !response.body) throw await failure(response);
  try {
    for await (const message of serverEvents(response.body)) {
      if (message.id) {
        cloud.cursor = Number(message.id);
        save(cloud);
      }
      if (!message.data) continue;
      const logged = JSON.parse(message.data) as LoggedEvent & { event?: { source?: string; type?: string } };
      const body = logged.event ?? {};
      if (body.source === "agent") {
        handlers.event(logged);
        continue;
      }
      if (logged.request_id !== request) continue;
      if (body.type === "interrupted") handlers.interrupted();
      if (body.type === "retrying" || body.type === "result") handlers.event(logged);
      if (body.type === "result") return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function reconnect(cloud: Cloud, request: string, handlers: Handlers) {
  for (;;) {
    const response = await fetch(`sessions/${encodeURIComponent(cloud.session)}/events?after=${cloud.cursor}`, { headers: headers(cloud, { accept: "text/event-stream" }) }).catch(() => undefined);
    if (response?.status === 401 || response?.status === 403) throw await failure(response);
    if (response && await follow(cloud, response, request, handlers)) return;
    await new Promise(resolve => setTimeout(resolve, reconnectMs));
  }
}

export async function ask(cloud: Cloud, prompt: string, handlers: Handlers) {
  const request = `turn-${crypto.randomUUID()}`;
  cloud.open = request;
  save(cloud);
  try {
    const response = await fetch(`sessions/${encodeURIComponent(cloud.session)}/turns?after=${cloud.cursor}`, {
      body: JSON.stringify({ model: "gpt-6-luna", prompt, provider: "codex", request_id: request, thinking: "low" }),
      headers: headers(cloud, { accept: "text/event-stream", "content-type": "application/json" }),
      method: "POST",
    });
    if (!(await follow(cloud, response, request, handlers))) await reconnect(cloud, request, handlers);
  } finally {
    cloud.open = undefined;
    save(cloud);
  }
}

export async function resume(cloud: Cloud, handlers: Handlers) {
  const request = cloud.open;
  if (!request) return;
  try {
    await reconnect(cloud, request, handlers);
  } finally {
    cloud.open = undefined;
    save(cloud);
  }
}

export async function steer(cloud: Cloud, prompt: string): Promise<"queued" | "steered"> {
  const response = await fetch(`sessions/${encodeURIComponent(cloud.session)}/turns`, {
    body: JSON.stringify({ model: "gpt-6-luna", prompt, provider: "codex", request_id: `steer-${crypto.randomUUID()}`, steer: true }),
    headers: headers(cloud, { "content-type": "application/json" }),
    method: "POST",
  });
  if (response.ok) return "steered";
  if (response.status === 409) return "queued";
  throw await failure(response);
}
