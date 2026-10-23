import type { Config, ToolCell as Cell, TurnBlock } from "nanocode-ts/client";
import { Code, useSend } from "nanocode-ts/react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Machine from "../machine.ts";
import type * as Machines from "../machines.ts";
import * as Payments from "../payments.ts";
import { type Source, useSpend } from "../Spend.tsx";
import * as Wallet from "../wallet.ts";
import { Chevron } from "./icons.tsx";

export type Block = TurnBlock | { kind: "tools"; cells: Cell[]; live: boolean };

type Saved = { picked?: string; bound: Record<string, string> };

export function createPicker(key: string, models: readonly Machines.Model[]) {
  const listeners = new Set<() => void>();
  const storageKey = key + ":models";
  let config: Config | undefined;
  let saved: Saved = { bound: {} };
  let version = 0;

  try {
    saved = { ...saved, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
  } catch {}

  const persist = () => {
    const ids = new Set(config?.getState().conversations.map(item => item.id));
    saved.bound = Object.fromEntries(Object.entries(saved.bound).filter(([id]) => ids.has(id)));
    localStorage.setItem(storageKey, JSON.stringify(saved));
    version++;
    for (const listener of listeners) listener();
  };

  const current = (): Machines.Model => {
    const conversation = config?.getState().conversation;
    const id = (conversation && saved.bound[conversation]) || saved.picked;
    return models.find(model => model.model === id) ?? models[0]!;
  };

  const take = (): Machines.Model => {
    const model = current();
    const conversation = config?.getState().conversation;
    if (conversation && !saved.bound[conversation]) {
      saved.bound[conversation] = model.model;
      persist();
    }
    return model;
  };

  const choose = (id: string) => {
    const conversation = config?.getState().conversation;
    saved.picked = id;
    if (conversation && saved.bound[conversation] && saved.bound[conversation] !== id) config?.create();
    persist();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const off = config?.subscribe(listener);
    return () => {
      listeners.delete(listener);
      off?.();
    };
  };

  const useModel = () => {
    useSyncExternalStore(subscribe, () => version + ":" + config?.getState().conversation);
    const conversation = config?.getState().conversation;
    return { bound: Boolean(conversation && saved.bound[conversation]), choose, model: current(), models };
  };

  return { attach: (next: Config) => { config = next; }, take, useModel };
}

export function grouped(blocks: readonly TurnBlock[]): Block[] {
  const result: Block[] = [];

  for (const block of blocks) {
    const last = result[result.length - 1];
    if (block.tool && last?.kind === "tools") {
      last.cells.push(block.tool);
      last.live ||= block.live;
    } else if (block.tool) result.push({ cells: [block.tool], kind: "tools", live: block.live });
    else result.push(block);
  }

  return result;
}

export function seconds(block: TurnBlock): number | undefined {
  return block.live || block.started_at === undefined || block.ended_at === undefined ? undefined : Math.max(1, Math.round((block.ended_at - block.started_at) / 1000));
}

export function useStick(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    if (stick.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dependency]);

  const onScroll = () => {
    const node = ref.current;
    if (node) stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
  };

  return { onScroll, pin: () => { stick.current = true; }, ref };
}

export function useComposer(options: { onSend?(): void; send(text: string): void }) {
  const { cancel, canCancel, isPending: busy } = useSend();
  const [prompt, setPrompt] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = Math.min(node.scrollHeight, 240) + "px";
  }, [prompt]);

  const submit = () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt("");
    options.onSend?.();
    options.send(text);
  };

  const textarea = {
    "aria-label": "Message",
    onChange: (event: { target: { value: string } }) => setPrompt(event.target.value),
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      submit();
    },
    ref: input,
    rows: 1,
    value: prompt,
  };

  return { busy, cancel, canCancel, empty: !prompt.trim(), focus: () => input.current?.focus(), submit, textarea };
}

export function CopyCode(props: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const code = props.code.replace(/\n$/, "");

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{props.language === "text" ? "" : props.language}</span>
        <button onClick={copy} type="button">{copied ? "Copied" : "Copy"}</button>
      </div>
      <Code code={code} framed language={props.language} />
    </div>
  );
}

export function greeting(): string {
  const hour = new Date().getHours();
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    addEventListener("pointerdown", pointer);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("pointerdown", pointer);
      removeEventListener("keydown", key);
    };
  }, [open]);

  return ref;
}

export function useSidebar() {
  const wide = () => matchMedia("(min-width: 768px)").matches;
  const [open, setOpen] = useState(wide);

  useEffect(() => {
    const media = matchMedia("(min-width: 768px)");
    const change = () => setOpen(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  return { close: () => { if (!wide()) setOpen(false); }, open, toggle: () => setOpen(value => !value) };
}

export function SignIn(props: { machine: Machine.Machine; prefix: string }) {
  const { machine, prefix } = props;

  return (
    <div className={prefix + "-signin"}>
      <p>This chat is a nanocode agent in Code Mode. It pays for its model and every service its scripts call from your Tempo Wallet, in MACH over MPP. Sign in to approve a key that may spend {Machine.limits}.</p>
      <button className={prefix + "-signin-button"} disabled={machine.working} onClick={() => void machine.command("/login", false)} type="button">{machine.working ? "Waiting for Tempo Wallet…" : "Sign in with Tempo"}</button>
    </div>
  );
}

export function Prompts(props: { machine: Machine.Machine; prefix: string }) {
  const { checkout, device, open } = props.machine;
  const link = device && (device.verificationUriFull ?? device.verificationUri);

  return (
    <>
      {device && link && <p className={props.prefix + "-prompt"}>Approve in Tempo Wallet: <a href={link} onClick={open} rel="noreferrer" target="_blank">{link.replace(/^https:\/\//, "")}</a> · code <b>{device.userCode}</b></p>}
      {checkout && <p className={props.prefix + "-prompt"}>Buy MACH in Tempo Wallet: <a href={checkout.url} onClick={open} rel="noreferrer" target="_blank">checkout for {Wallet.short(checkout.address)}</a></p>}
    </>
  );
}

export function Suggestions(props: { machine: Machine.Machine; prefix: string; suggestions: readonly string[] }) {
  const { busy, cloud, machine, ready, working } = { ...props.machine, machine: props.machine };

  return (
    <div className={props.prefix + "-suggestions"}>
      {props.suggestions.map(suggestion => <button disabled={working || busy || (!ready && !cloud)} key={suggestion} onClick={() => machine.submit(suggestion)} type="button">{suggestion}</button>)}
    </div>
  );
}

export function Account(props: { machine: Machine.Machine; prefix: string }) {
  const { machine, prefix } = props;
  const connected = machine.connected;

  if (!connected) {
    return (
      <div className={prefix + "-account"}>
        <button className={prefix + "-account-login"} disabled={machine.working} onClick={() => void machine.command("/login", false)} type="button">Sign in with Tempo</button>
      </div>
    );
  }

  return (
    <div className={prefix + "-account"}>
      <div className={prefix + "-account-who"}>
        <span aria-hidden="true" className={prefix + "-account-avatar"}>{connected.address.slice(2, 4).toUpperCase()}</span>
        <span><strong>{Wallet.short(connected.address)}</strong><small>{machine.detail}</small></span>
      </div>
      <div className={prefix + "-account-actions"}>
        <button disabled={machine.working} onClick={() => void machine.command("/wallet", false)} type="button">Balance</button>
        <button disabled={machine.working} onClick={() => void machine.command("/fund", false)} type="button">Add MACH</button>
        <button disabled={machine.working} onClick={() => void machine.command("/logout", false)} type="button">Log out</button>
      </div>
    </div>
  );
}

export function Meter(props: { prefix: string; source: Source }) {
  const { ledger, rate, services } = useSpend(props.source, Payments.window);
  const [open, setOpen] = useState(false);
  const prefix = props.prefix;

  return (
    <div aria-label="Spend" className={prefix + "-meter"} data-open={open}>
      <button aria-expanded={open} className={prefix + "-meter-head"} onClick={() => setOpen(!open)} type="button">
        <span className={prefix + "-meter-bolt"}>⚡</span>
        <span>{Wallet.format(ledger.total)} MACH · {ledger.calls} paid calls · {services.length} services · {Wallet.format(rate)} MACH/min</span>
        <Chevron />
      </button>
      {open && (
        <div className={prefix + "-meter-rows"}>
          {services.length === 0 && <p className={prefix + "-meter-empty"}>Nothing paid yet. Each service shows up here as it charges.</p>}
          {services.map(service => (
            <p data-live={service.live} key={service.name}>
              <span className={prefix + "-meter-dot"}>●</span>
              <span className={prefix + "-meter-name"}>{service.name}</span>
              <span className={prefix + "-meter-spark"}>{service.spark}</span>
              <span>{Wallet.format(service.spent)} MACH</span>
              <small>{service.calls} calls</small>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
