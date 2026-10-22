import { type Entry, liveEvent, Transcript } from "nanocode-ts/client";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type * as Agent from "./agent.ts";
import * as Cloud from "./cloud.ts";
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
  { detail: "run the agent in the cloud: turns keep going after you close the tab", label: "/cloud" },
  { detail: "run the agent in this tab again", label: "/local" },
  { detail: "clear the conversation and start a new session", label: "/clear" },
  { detail: "revoke the key in Tempo Wallet and forget it here", label: "/logout" },
  { detail: "list the commands", label: "/help" },
] as const;

const entriesKey = "nanocode.machines.entries";

const localKey = "nanocode.machines.local";

function saved(): Shown[] {
  try {
    return JSON.parse(localStorage.getItem(entriesKey) ?? "[]") as Shown[];
  } catch {
    return [];
  }
}

const limits = `at most ${amount(Wallet.allowance)} MACH, plus ${amount(Wallet.feeAllowance)} ${Wallet.usdc.symbol} for fees, until it expires a day later`;

export function Terminal() {
  const [connected, setConnected] = useState<Wallet.Wallet>();
  const [entries, setEntries] = useState<readonly Shown[]>(saved);
  const [live, setLive] = useState<Shown | undefined>();
  const [prompt, setPrompt] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [status, setStatus] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [device, setDevice] = useState<Wallet.Prompt>();
  const [checkout, setCheckout] = useState<{ address: string; url: string }>();
  const [cloud, setCloud] = useState<Cloud.Cloud | undefined>(() => Cloud.restore());
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
    localStorage.setItem(entriesKey, JSON.stringify(entries.slice(-300)));
  }, [entries]);

  useEffect(() => {
    const restored = entries.length > 0;
    const saved = Wallet.restore();
    if (!saved) return note("tool", `Not logged in. Type /login to connect your Tempo Wallet. It asks you to approve a key that this page keeps and pays with, ${limits}, and only for payments. The agent then pays for its own model and every service it calls.`);
    void Wallet.published(saved).then(onChain => {
      if (!onChain) return note("tool", "Tempo Wallet approved a key earlier, but it is not on Tempo yet. Type /login to publish it.");
      setConnected(saved);
      if (!restored) note("tool", `Logged in as ${Wallet.short(saved.address)} with key ${Wallet.short(saved.keyAddress)} until ${until(saved)}. Type /wallet to see your MACH.`);
      if (!Cloud.restore() && localStorage.getItem(localKey) !== "1") void enableCloud(saved).catch((error: unknown) => note("error", message(error)));
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

  const handlers: Cloud.Handlers = {
    event: logged => {
      const event = liveEvent(logged);
      if (event) transcript.push(event);
    },
    interrupted: () => note("tool", "The session's Durable Object reset. Its alarm started it again, and the turn continues from its checkpoint."),
  };

  useEffect(() => {
    const saved = Cloud.restore();
    if (!saved?.open) return;
    note("tool", "Reconnecting to the turn that kept running in the cloud while this tab was closed.");
    setBusy(true);
    void Cloud.resume(saved, handlers).catch((error: unknown) => note("error", message(error))).finally(() => {
      setLive(undefined);
      setBusy(false);
    });
  }, []);

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
      note("tool", Wallet.framed() ? "X's player cannot show Tempo Wallet, so Tempo Wallet gives you a code instead. ⌘-click the link below (Ctrl-click on Windows) to open it in a normal tab, or open it on your phone, and approve the key with your passkey." : "Opening Tempo Wallet. Approve the key with your passkey.");
      pending = await Wallet.connect();
      note("tool", `Tempo Wallet approved key ${Wallet.short(pending.keyAddress)} for ${Wallet.short(pending.address)}: ${limits}, at ${until(pending)}.`);
    }
    note("tool", `Publishing the key on Tempo. Its one transaction pays its fee in ${Wallet.usdc.symbol} from your wallet.`);
    const hash = await Wallet.publish(pending);
    note("tool", hash ? `The key is on Tempo (transaction ${Wallet.short(hash)}).` : "The key is already on Tempo.");
    setConnected(pending);
    if (!cloud && localStorage.getItem(localKey) !== "1") await enableCloud(pending);
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
    Cloud.forget();
    setCloud(undefined);
    setConnected(undefined);
  }

  async function enableCloud(account = connected) {
    if (!account) return note("tool", "Not logged in. Type /login first.");
    localStorage.removeItem(localKey);
    const current = Cloud.restore();
    if (current) return note("tool", `Running in the cloud as session ${current.session}. Type /local to run in this tab.`);
    const enabled = await Cloud.enable(account);
    setCloud(enabled);
    note("tool", "The agent runs in the cloud, in a Durable Object with subagents and a workspace, paid from your key within its limit until it expires: this site's Worker keeps the key encrypted. Refresh or close the tab whenever you like; the turn keeps going and this page reconnects to it. Type /local to run in this tab instead, or /logout to revoke the key everywhere.");
  }

  function clear() {
    transcript.reset();
    setLive(undefined);
    setEntries([]);
    if (cloud) {
      const next = Cloud.renew(cloud);
      setCloud(next);
      note("tool", "New session. The previous one's files stay in the cloud.");
    } else note("tool", "Cleared.");
  }

  function disableCloud() {
    if (!cloud) return note("tool", "Already running in this tab.");
    Cloud.forget();
    localStorage.setItem(localKey, "1");
    setCloud(undefined);
    note("tool", "Running in this tab again. The cloud keeps the key until it expires; type /logout to revoke it.");
  }

  async function wallet() {
    if (!connected) return note("tool", "Not logged in. Type /login.");
    const { balance, fees, remaining } = await Wallet.balances(connected);
    note("tool", `${Wallet.short(connected.address)} holds ${Wallet.format(balance)} MACH and ${Wallet.format(fees)} ${Wallet.usdc.symbol}. Key ${Wallet.short(connected.keyAddress)} may spend ${Wallet.format(remaining)} MACH more until ${until(connected)}${payments ? `, and this page has paid ${Wallet.format(payments.ledger().total)} MACH since it opened` : ""}.`);
    if (cloud) {
      const { spent } = await Cloud.status(cloud);
      const total = Object.values(spent).reduce((sum, value) => sum + BigInt(value), 0n);
      note("tool", `The cloud has paid ${Wallet.format(total)} MACH: ${Object.entries(spent).map(([host, value]) => `${host.split(".")[0]} ${Wallet.format(BigInt(value))}`).join(", ") || "nothing yet"}.`);
    }
  }

  async function fund() {
    const saved = connected ?? Wallet.restore();
    if (!saved) return note("tool", "Not logged in. Type /login first.");
    if (Wallet.framed()) {
      note("tool", "X's player cannot show Tempo Wallet. ⌘-click the link below (Ctrl-click on Windows) to buy MACH in a normal tab, then type /wallet to see your balance.");
      return setCheckout({ address: saved.address, url: Wallet.fundingUrl(saved) });
    }
    note("tool", "Opening MACH checkout in Tempo Wallet.");
    await Wallet.fund(saved);
  }

  function open(event: MouseEvent<HTMLAnchorElement>) {
    const pointer = (event.nativeEvent as PointerEvent).pointerType;
    const mouse = pointer ? pointer === "mouse" : matchMedia("(pointer: fine)").matches;
    if (!mouse || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!Wallet.framed() || !Wallet.sandboxed()) return;
    event.preventDefault();
    note("tool", "That link would open in a tab that keeps X's sandbox, where Tempo Wallet cannot sign you in. ⌘-click it (Ctrl-click on Windows) to open a normal tab, or open it on your phone.");
  }

  async function command(text: string) {
    setCheckout(undefined);
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
      else if (name === "/cloud") await enableCloud();
      else if (name === "/local") disableCloud();
      else if (name === "/clear") clear();
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
    if (cloud) {
      if (busy) {
        try {
          note("tool", await Cloud.steer(cloud, text) === "steered" ? "steered into the running turn" : "The turn is finishing; ask again in a moment.");
        } catch (error) {
          note("error", message(error));
        }
        return;
      }
      setBusy(true);
      try {
        await Cloud.ask(cloud, text, handlers);
      } catch (error) {
        note("error", message(error));
      }
      setLive(undefined);
      setBusy(false);
      return;
    }
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
          Approve in Tempo Wallet: <a href={device.verificationUriFull ?? device.verificationUri} onClick={open} rel="noreferrer" target="_blank">{(device.verificationUriFull ?? device.verificationUri).replace(/^https:\/\//, "")}</a> · code <b>{device.userCode}</b>
        </p>
      )}

      {checkout && (
        <p className="device">
          Buy MACH in Tempo Wallet: <a href={checkout.url} onClick={open} rel="noreferrer" target="_blank">checkout for {Wallet.short(checkout.address)}</a>
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
          <button className="suggestion" disabled={working || (!!connected && ((!ready && !cloud) || busy))} key={suggestion} onClick={() => void ask(suggestion)} type="button">{suggestion}</button>
        ))}
      </div>

      <p className="status">
        <span>{connected ? `${cloud ? "cloud · gpt-6-luna" : status} · ${Wallet.short(connected.address)}` : "not logged in · /login"}</span>
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
