import type { HostTool, HostToolCall } from "nanocode-cloudflare-durable";
import { type Env, wallet } from "./env.ts";

const PAID = /^https:\/\/([a-z0-9-]+\.mpp\.tempo\.xyz|gateway\.tempo-dev\.workers\.dev)(\/|$)/;
const PREVIEW = 4_000;
const FETCH_PREVIEW = 20_000;
const SECRET = /\{\{([A-Z_][A-Z0-9_]{0,63})\}\}/g;

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, properties, required });
const path = { type: "string", description: "A workspace path, such as notes/plan.md." };

const definitions: HostTool[] = [
  {
    name: "pay",
    description: "Sends HTTPS requests to Tempo's paid MPP services (https://<name>.mpp.tempo.xyz, and the Tempo gateway at https://gateway.tempo-dev.workers.dev), paid from the account's Tempo Wallet in MACH, and returns each response's status, type, time and the opening of its body. Requests in one call run at the same time. Services include rpc (Tempo JSON-RPC), openrouter (chat completions over many models), firecrawl (web scraping: POST /v1/scrape {url, formats:[\"markdown\"]}), storage, fal (images), and speech.",
    parameters: object({ requests: { type: "array", minItems: 1, items: object({ url: { type: "string" }, method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] }, body: { type: "string" }, content_type: { type: "string" } }, ["url", "method"]) } }, ["requests"]),
  },
  {
    name: "http",
    description: "Sends one unpaid HTTPS request and returns its status, type and up to 20,000 characters of its body. Header values may name the account's secrets as {{NAME}}; the list_secrets tool gives their names, never their values.",
    parameters: object({ url: { type: "string" }, method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, headers: { type: "object", additionalProperties: { type: "string" } }, body: { type: "string" } }, ["url", "method"]),
  },
  { name: "list_secrets", description: "The names of the secrets the account stored for the http tool.", parameters: object({}) },
  { name: "list_files", description: "Lists this session's workspace files. The workspace is durable: it outlives turns, restarts and the browser.", parameters: object({}) },
  { name: "read_file", description: "Reads a workspace file with line numbers. offset is the first line (1-based) and limit the number of lines.", parameters: object({ path, offset: { type: "integer" }, limit: { type: "integer" } }, ["path"]) },
  { name: "write_file", description: "Writes a whole workspace file.", parameters: object({ path, content: { type: "string" } }, ["path", "content"]) },
  { name: "edit_file", description: "Replaces old_string with new_string in a workspace file; old_string must occur once unless replace_all is true.", parameters: object({ path, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, ["path", "old_string", "new_string"]) },
  { name: "delete_file", description: "Deletes a workspace file.", parameters: object({ path }, ["path"]) },
  { name: "wallet", description: "The account's wallet: its address, its access key's expiry and what this deployment has paid each service so far, in MACH base units (6 decimals).", parameters: object({}) },
];

function file(value: unknown): string {
  const key = String(value ?? "").replace(/^\.?\/+/, "");
  if (!key || key.includes("..") || key.length > 512) throw new Error(`not a workspace path: ${String(value)}`);
  return key;
}

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}… (${text.length} characters)` : text;
}

async function read(response: Response, limit: number) {
  const type = response.headers.get("content-type") ?? "";
  if (/json|text|xml|javascript|html|csv|yaml|markdown/.test(type) || type === "") return { type, body: cut(await response.text(), limit) };
  return { type, bytes: (await response.arrayBuffer()).byteLength };
}

type Request = { url?: string; method?: string; body?: string; content_type?: string };

async function pay(env: Env, account: string, request: Request, signal: AbortSignal) {
  const { url = "", method = "GET", body, content_type } = request;
  if (!PAID.test(url)) return { url, error: "pay only reaches https://<name>.mpp.tempo.xyz and the Tempo gateway" };
  const started = Date.now();
  const headers: [string, string][] = body === undefined ? [] : [["content-type", content_type ?? "application/json"]];
  try {
    const response = await wallet(env, account).fetch(new Request("https://wallet.internal/pay", { method: "POST", body: body ?? null, signal, headers: { "x-target": url, "x-method": method, "x-headers": JSON.stringify(headers) } }));
    return { url, status: response.status, ms: Date.now() - started, ...(await read(response, PREVIEW)) };
  } catch (error) {
    return { url, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

async function http(env: Env, account: string, input: { url?: string; method?: string; headers?: Record<string, string>; body?: string }, signal: AbortSignal) {
  const url = new URL(String(input.url ?? ""));
  if (url.protocol !== "https:") return { error: "http only sends https requests" };
  const names = new Set<string>();
  for (const value of Object.values(input.headers ?? {})) for (const match of value.matchAll(SECRET)) names.add(match[1]!);
  const secrets: Record<string, string> = names.size ? await wallet(env, account).secrets([...names]) : {};
  const missing = [...names].filter(name => !(name in secrets));
  if (missing.length) return { error: `no secret named ${missing.join(", ")}` };
  const headers = Object.fromEntries(Object.entries(input.headers ?? {}).map(([name, value]) => [name, value.replace(SECRET, (_, secret: string) => secrets[secret]!)]));
  const started = Date.now();
  const response = await fetch(url, { method: input.method ?? "GET", headers, body: input.body, signal, redirect: "follow" });
  const result = { status: response.status, ms: Date.now() - started, ...(await read(response, FETCH_PREVIEW)) };
  const values = Object.values(secrets).filter(value => value.length >= 6);
  return values.length ? JSON.parse(values.reduce((text: string, value: string) => text.split(value).join("[secret]"), JSON.stringify(result))) : result;
}

async function call(call: HostToolCall, env: Env, signal: AbortSignal): Promise<unknown> {
  const account = call.authority.account_id;
  const session = call.authority.session_id;
  const input = (call.input ?? {}) as Record<string, unknown>;
  const stub = wallet(env, account);
  try {
    switch (call.name) {
      case "pay": {
        const requests = input.requests;
        if (!Array.isArray(requests) || requests.length === 0) return { error: "requests must list at least one request" };
        return { responses: await Promise.all(requests.map(request => pay(env, account, request as Request, signal))) };
      }
      case "http": return await http(env, account, input, signal);
      case "list_secrets": return { names: await stub.secretNames() };
      case "list_files": return { files: await stub.files(session) };
      case "read_file": {
        const key = file(input.path);
        const content = await stub.readFile(session, key);
        if (content === undefined) return { error: `no file ${key}` };
        const lines = content.split("\n");
        const offset = Math.max(1, Number(input.offset ?? 1));
        const limit = Math.max(1, Number(input.limit ?? 2000));
        return { path: key, lines: lines.length, content: lines.slice(offset - 1, offset - 1 + limit).map((line, index) => `${String(offset + index).padStart(5)}  ${line}`).join("\n") };
      }
      case "write_file": {
        const key = file(input.path);
        await stub.writeFile(session, key, String(input.content ?? ""));
        return { path: key, chars: String(input.content ?? "").length };
      }
      case "edit_file": {
        const key = file(input.path);
        const content = await stub.readFile(session, key);
        if (content === undefined) return { error: `no file ${key}` };
        const before = String(input.old_string ?? "");
        const after = String(input.new_string ?? "");
        const count = before ? content.split(before).length - 1 : 0;
        if (count === 0) return { error: "old_string was not found" };
        if (count > 1 && !input.replace_all) return { error: `old_string occurs ${count} times; add context or set replace_all` };
        await stub.writeFile(session, key, input.replace_all ? content.split(before).join(after) : content.replace(before, () => after));
        return { path: key, replaced: input.replace_all ? count : 1 };
      }
      case "delete_file": return { deleted: await stub.deleteFile(session, file(input.path)) };
      case "wallet": return await stub.status();
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  throw new Error(`no host tool is named ${call.name}`);
}

export const machineTools = { definitions, call };
