import type { Config } from "nanocode-ts/client";
import type { Models } from "nanocode-ts/machines";
import type { Machine } from "nanocode-ts/machines/react";
import type { Skin } from "nanocode-ts/react";
import { useSyncExternalStore } from "react";

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

export function Suggestions(props: { machine: Machine; prefix: string; suggestions: readonly string[] }) {
  const { machine, ready, working } = { ...props.machine, machine: props.machine };

  return (
    <div className={props.prefix + "-suggestions"}>
      {props.suggestions.map(suggestion => <button disabled={working || !ready} key={suggestion} onClick={() => machine.submit(suggestion)} type="button">{suggestion}</button>)}
    </div>
  );
}

export function machineParts(prefix: string): NonNullable<Skin["parts"]> {
  const names = { account: "account", accountActions: "account-actions", accountAvatar: "account-avatar", accountLogin: "account-login", accountWho: "account-who", meter: "meter", meterBolt: "meter-bolt", meterDot: "meter-dot", meterEmpty: "meter-empty", meterHead: "meter-head", meterName: "meter-name", meterRows: "meter-rows", meterSpark: "meter-spark", prompt: "prompt", signIn: "signin", signInButton: "signin-button" } as const;
  return Object.fromEntries(Object.entries(names).map(([part, name]) => [part, () => ({ className: prefix + "-" + name })]));
}
