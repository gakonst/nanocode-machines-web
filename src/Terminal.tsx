import { type Entry, liveEvent, Transcript } from "nanocode-ts/client";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Agent from "./agent.ts";
import * as Machines from "./machines.ts";
import * as Payments from "./payments.ts";
import { Reply } from "./Reply.tsx";
import { Spend } from "./Spend.tsx";
import * as Wallet from "./wallet.ts";

type Shown = Entry & { done: boolean };

const commands = [
  { detail: "connect Tempo Wallet and approve a key that pays for this agent", label: "/login" },
  { detail: "show your MACH and what the key may still spend", label: "/wallet" },
  { detail: "buy MACH in Tempo Wallet", label: "/fund" },
  { detail: "revoke the key in Tempo Wallet and forget it here", label: "/logout" },
  { detail: "list the commands", label: "/help" },
] as const;

const limits = `at most ${amount(Wallet.allowance)} MACH, plus ${amount(Wallet.feeAllowance)} ${Wallet.usdc.symbol} for fees, until it expires a day later`;

export function Terminal() {
  const [connected, setConnected] = useState<Wallet.Wallet>();
  const [entries, setEntries] = useState<readonly Shown[]>([]);
  const [live, setLive] = useState<Shown | undefined>();
  const [prompt, setPrompt] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [status, setStatus] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [device, setDevice] = useState<Wallet.Prompt>();
  const agent = useRef<Agent.Agent | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useMemo(() => new Transcript({
    add: entry => setEntries(entries => [...entries, { ...entry, done: true }]),
    live: entry => setLive(entry ? { ...entry, done: false } : undefined),
    revealMs: 0,
  }), []);
  const payments = useMemo(() => connected && Payments.create(connected), [connected]);

  function note(kind: Entry["kind"], text: string) {
    setEntries(entries => [...entries, { done: true, kind, text }]);
  }

  useEffect(() => Wallet.onPrompt(setDevice), []);

  useEffect(() => {
    const saved = Wallet.restore();
    if (!saved) return note("tool", `Not logged in. Type /login to connect your Tempo Wallet. It asks you to approve a key that this page keeps and pays with, ${limits}, and only for payments. The agent then pays for its own model and every service it calls.`);
    void Wallet.published(saved).then(onChain => {
      if (!onChain) return note("tool", "Tempo Wallet approved a key earlier, but it is not on Tempo yet. Type /login to publish it.");
      setConnected(saved);
      note("tool", `Logged in as ${Wallet.short(saved.address)} with key ${Wallet.short(saved.keyAddress)} until ${until(saved)}. Type /wallet to see your MACH.`);
    }, (error: unknown) => note("error", message(error)));
  }, []);

  useEffect(() => {
    if (!payments) return;
    let disposed = false;
    const { call, model } = Machines.agent(payments);
    setStatus("Loading nanocode-ts…");
    void import("./agent.ts")
      .then(module => module.create({ call, instructions: Machines.instructions, model, onEvent: entry => {
        const event = liveEvent(entry);
        if (event) transcript.push(event);
      }, tools: Machines.tools }))
      .then(created => {
        if (disposed) return void created.dispose();
        agent.current = created;
        setReady(true);
        setStatus(summary(created));
      }, (error: unknown) => setStatus(`The agent could not start: ${message(error)}`));
    return () => {
      disposed = true;
      setReady(false);
      void agent.current?.dispose();
      agent.current = undefined;
    };
  }, [payments, transcript]);

  useEffect(() => () => transcript.reset(), [transcript]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries, live]);

  useEffect(() => {
    if (!busy) return setTyping(false);
    const timer = setTimeout(() => setTyping(true), 500);
    return () => clearTimeout(timer);
  }, [busy]);

  async function login() {
    if (connected) return note("tool", `Already logged in as ${Wallet.short(connected.address)}. Type /logout first to use another wallet.`);
    let pending = Wallet.restore();
    if (!pending) {
      note("tool", Wallet.framed() ? "X's player cannot show Tempo Wallet, so Tempo Wallet gives you a code instead. Open the link below in a new tab or on your phone, and approve the key with your passkey." : "Opening Tempo Wallet. Approve the key with your passkey.");
      pending = await Wallet.connect();
      note("tool", `Tempo Wallet approved key ${Wallet.short(pending.keyAddress)} for ${Wallet.short(pending.address)}: ${limits}, at ${until(pending)}.`);
    }
    note("tool", `Publishing the key on Tempo. Its one transaction pays its fee in ${Wallet.usdc.symbol} from your wallet.`);
    const hash = await Wallet.publish(pending);
    note("tool", hash ? `The key is on Tempo (transaction ${Wallet.short(hash)}).` : "The key is already on Tempo.");
    setConnected(pending);
    const { balance } = await Wallet.balances(pending);
    note("tool", balance === 0n ? "Your wallet holds no MACH yet. Type /fund to buy some." : `Your wallet holds ${Wallet.format(balance)} MACH. Ask anything, or try "${Machines.suggestions[0]}".`);
  }

  async function logout() {
    const saved = connected ?? Wallet.restore();
    if (!saved) return note("tool", "Not logged in.");
    note("tool", "Opening Tempo Wallet to revoke the key.");
    try {
      await Wallet.revoke(saved);
      note("tool", "Tempo Wallet revoked the key.");
    } catch (error) {
      note("error", `Tempo Wallet did not revoke the key (${message(error)}). It stays valid until ${until(saved)} with what is left of its limit, but this page no longer keeps it.`);
    }
    Wallet.forget();
    setConnected(undefined);
  }

  async function wallet() {
    if (!connected) return note("tool", "Not logged in. Type /login.");
    const { balance, fees, remaining } = await Wallet.balances(connected);
    note("tool", `${Wallet.short(connected.address)} holds ${Wallet.format(balance)} MACH and ${Wallet.format(fees)} ${Wallet.usdc.symbol}. Key ${Wallet.short(connected.keyAddress)} may spend ${Wallet.format(remaining)} MACH more until ${until(connected)}${payments ? `, and this page has paid ${Wallet.format(payments.ledger().total)} MACH since it opened` : ""}.`);
  }

  async function fund() {
    const saved = connected ?? Wallet.restore();
    if (!saved) return note("tool", "Not logged in. Type /login first.");
    note("tool", "Opening MACH checkout in Tempo Wallet.");
    await Wallet.fund(saved);
  }

  async function command(text: string) {
    setPrompt("");
    setHighlight(0);
    note("user", text);
    const name = text.split(/\s/)[0];
    setWorking(true);
    try {
      if (name === "/login") await login();
      else if (name === "/logout") await logout();
      else if (name === "/wallet") await wallet();
      else if (name === "/fund") await fund();
      else note("tool", commands.map(entry => `${entry.label.padEnd(8)} ${entry.detail}`).join("\n"));
    } catch (error) {
      note("error", Machines.explain(error).message);
    }
    setDevice(undefined);
    setWorking(false);
  }

  async function ask(text: string) {
    if (!text) return;
    if (text.startsWith("/")) return command(text);
    const current = agent.current;
    setPrompt("");
    note("user", text);
    if (!connected) return note("error", "Log in first: type /login.");
    if (!current) return note("tool", "The agent is still loading.");
    if (busy) {
      try {
        if (await current.steer(text) === "steered") note("tool", "steered into the running turn");
      } catch (error) {
        note("error", message(error));
      }
      return;
    }
    setBusy(true);
    try {
      if (!(await current.ask(text))) throw new Error("The turn has no result.");
    } catch (error) {
      note("error", message(error));
    }
    setLive(undefined);
    setBusy(false);
    setStatus(summary(current));
  }

  const query = /^\/\S*$/.test(prompt) ? prompt : undefined;
  const choices = query === undefined ? [] : commands.filter(entry => entry.label.startsWith(query));
  const highlighted = Math.min(highlight, Math.max(0, choices.length - 1));
  const shown = live ? [...entries, live] : entries;
  return (
    <section
      aria-label="Agent"
      className="chat"
      onClick={event => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, textarea") || getSelection()?.toString()) return;
        input.current?.focus();
      }}
    >
      <div aria-live="polite" className="log" ref={log}>
        {shown.map((entry, index) => {
          const previous = shown[index - 1];
          const label = entry.kind === "user" ? "you" : !previous || previous.kind === "user" ? "agent" : undefined;
          return (
            <div className="turn" key={index}>
              {label && <p className={`speaker speaker-${label}`}><span aria-hidden="true">●</span> {label}</p>}
              <div className={`entry entry-${entry.kind}${entry.done ? "" : " entry-live"}`}>{entry.kind === "assistant" ? <Reply text={entry.text} /> : entry.kind === "reasoning" ? entry.text.replace(/\*\*(.+?)\*\*/g, "$1") : entry.text}</div>
            </div>
          );
        })}
      </div>

      <p aria-live="polite" className={typing || working ? "typing typing-visible" : "typing"}>
        {typing && <><span className="speaker speaker-agent">agent</span> {live?.kind === "reasoning" ? "is thinking" : "is typing"}</>}
        {working && !typing && <><span className="speaker speaker-agent">wallet</span> is working</>}
      </p>

      {device && (
        <p className="device">
          Approve in Tempo Wallet: <a href={device.verificationUriFull ?? device.verificationUri} rel="noreferrer" target="_blank">{(device.verificationUriFull ?? device.verificationUri).replace(/^https:\/\//, "")}</a> · code <b>{device.userCode}</b>
        </p>
      )}

      {payments && <Spend payments={payments} window={Payments.window} />}

      {choices.length > 0 && (
        <div aria-label="Commands" className="picker" role="listbox">
          {choices.map((entry, index) => (
            <button aria-selected={index === highlighted} className="picker-choice" key={entry.label} onClick={() => void ask(entry.label)} onMouseMove={() => setHighlight(index)} role="option" style={{ gridTemplateColumns: "2ch 8ch auto" }} type="button">
              <span className="picker-marker">{index === highlighted ? "›" : ""}</span>
              <span className="picker-label">{entry.label}</span>
              <span className="picker-detail">{entry.detail}</span>
            </button>
          ))}
        </div>
      )}

      <div className="row">
        <span aria-hidden="true" className="chevron">❯</span>
        <textarea
          aria-label="Prompt"
          className="input"
          onChange={event => {
            setPrompt(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={event => {
            if (choices.length > 0) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight(Math.min(Math.max(0, highlighted + (event.key === "ArrowDown" ? 1 : -1)), choices.length - 1));
                return;
              }
              if (event.key === "Tab") {
                event.preventDefault();
                setPrompt(choices[highlighted]!.label);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(choices[highlighted]!.label);
                return;
              }
            }
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            void ask(prompt.trim());
          }}
          placeholder={!connected ? "Type /login to connect your Tempo Wallet" : busy ? "Steer the running turn" : "Ask the agent, or type / for commands"}
          ref={input}
          rows={1}
          value={prompt}
        />
        <button className="send" onClick={() => void ask(prompt.trim())} type="button">
          <kbd className="key">ENTER</kbd>
        </button>
      </div>

      <div className="suggestions">
        {(connected ? Machines.suggestions : ["/login"]).map(suggestion => (
          <button className="suggestion" disabled={working || (!!connected && (!ready || busy))} key={suggestion} onClick={() => void ask(suggestion)} type="button">{suggestion}</button>
        ))}
      </div>

      <p className="status">
        <span>{connected ? `${status} · ${Wallet.short(connected.address)}` : "not logged in · /login"}</span>
        <a className="site" href="https://nanocode.xyz/" rel="noreferrer" target="_blank">nanocode.xyz →</a>
      </p>
    </section>
  );
}

function summary(agent: Agent.Agent) {
  const { requests, rows } = agent.stats();
  return `${agent.model} · ${requests} req · ${rows} rows`;
}

function until(wallet: Wallet.Wallet) {
  return new Date(wallet.expiry * 1000).toLocaleString(undefined, { day: "numeric", hour: "numeric", minute: "2-digit", month: "short" });
}

function amount(atomics: bigint) {
  return Wallet.format(atomics).replace(/\.?0+$/, "");
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
