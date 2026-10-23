import type { Config, ToolCell as Cell, TurnBlock } from "nanocode-ts/client";
import type { Models } from "nanocode-ts/machines";
import type { Machine } from "nanocode-ts/machines/react";
import { Code, type Skin, useSend } from "nanocode-ts/react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

export type Block = TurnBlock | { kind: "tools"; cells: Cell[]; live: boolean };

type Saved = { picked?: string; bound: Record<string, string> };

export function createPicker(key: string, models: readonly Models.Model[]) {
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

  const current = (): Models.Model => {
    const conversation = config?.getState().conversation;
    const id = (conversation && saved.bound[conversation]) || saved.picked;
    return models.find(model => model.model === id) ?? models[0]!;
  };

  const take = (): Models.Model => {
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

export function Suggestions(props: { machine: Machine; prefix: string; suggestions: readonly string[] }) {
  const { cloud, machine, ready, working } = { ...props.machine, machine: props.machine };

  return (
    <div className={props.prefix + "-suggestions"}>
      {props.suggestions.map(suggestion => <button disabled={working || (!ready && !cloud)} key={suggestion} onClick={() => machine.submit(suggestion)} type="button">{suggestion}</button>)}
    </div>
  );
}


export function machineParts(prefix: string): NonNullable<Skin["parts"]> {
  const names = { account: "account", accountActions: "account-actions", accountAvatar: "account-avatar", accountLogin: "account-login", accountWho: "account-who", meter: "meter", meterBolt: "meter-bolt", meterDot: "meter-dot", meterEmpty: "meter-empty", meterHead: "meter-head", meterName: "meter-name", meterRows: "meter-rows", meterSpark: "meter-spark", prompt: "prompt", signIn: "signin", signInButton: "signin-button" } as const;
  return Object.fromEntries(Object.entries(names).map(([part, name]) => [part, () => ({ className: prefix + "-" + name })]));
}
