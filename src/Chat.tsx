import { type Entry, liveEvent, Transcript } from "nanocode-ts/client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type * as Agent from "./agent.ts";
import { Reply } from "./Reply.tsx";

type Shown = Entry & { done: boolean };

export function Chat(props: { call: Agent.Options["call"]; instructions: string; model: Agent.Model; panel: ReactNode; suggestions: readonly string[]; tools: Agent.Options["tools"] }) {
  const { call, instructions, model, panel, suggestions, tools } = props;
  const [entries, setEntries] = useState<readonly Shown[]>([]);
  const [live, setLive] = useState<Shown | undefined>();
  const [prompt, setPrompt] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [status, setStatus] = useState("Loading nanocode-ts…");
  const agent = useRef<Agent.Agent | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let disposed = false;
    const transcript = new Transcript({
      add: entry => setEntries(entries => [...entries, { ...entry, done: true }]),
      live: entry => setLive(entry ? { ...entry, done: false } : undefined),
      revealMs: 0,
    });
    void import("./agent.ts")
      .then(module => module.create({ call, instructions, model, onEvent: entry => {
        const event = liveEvent(entry);
        if (event) transcript.push(event);
      }, tools }))
      .then(created => {
        if (disposed) return void created.dispose();
        agent.current = created;
        setReady(true);
        setStatus(summary(created));
      }, (error: unknown) => setStatus(`The agent could not start: ${message(error)}`));
    return () => {
      disposed = true;
      transcript.reset();
      void agent.current?.dispose();
      agent.current = undefined;
    };
  }, [call, instructions, model, tools]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries, live]);

  useEffect(() => {
    if (!busy) return setTyping(false);
    const timer = setTimeout(() => setTyping(true), 500);
    return () => clearTimeout(timer);
  }, [busy]);

  async function ask(text: string) {
    const current = agent.current;
    if (!current || !text) return;
    setPrompt("");
    setEntries(entries => [...entries, { done: true, kind: "user", text }]);
    if (busy) {
      try {
        if (await current.steer(text) === "steered") setEntries(entries => [...entries, { done: true, kind: "tool", text: "steered into the running turn" }]);
      } catch (error) {
        setEntries(entries => [...entries, { done: true, kind: "error", text: message(error) }]);
      }
      return;
    }
    setBusy(true);
    try {
      const report = await current.ask(text);
      if (!report) throw new Error("The turn has no result.");
    } catch (error) {
      setEntries(entries => [...entries, { done: true, kind: "error", text: message(error) }]);
    }
    setLive(undefined);
    setBusy(false);
    setStatus(summary(current));
  }

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
        {shown.length === 0 && <p className="entry entry-tool">Ask a question to start a turn.</p>}
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

      <p aria-live="polite" className={typing ? "typing typing-visible" : "typing"}>
        {typing && <><span className="speaker speaker-agent">agent</span> {live?.kind === "reasoning" ? "is thinking" : "is typing"}</>}
      </p>

      {panel}

      <div className="row">
        <span aria-hidden="true" className="chevron">❯</span>
        <textarea
          aria-label="Prompt"
          className="input"
          disabled={!ready}
          onChange={event => setPrompt(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            void ask(prompt.trim());
          }}
          placeholder={busy ? "Steer the running turn" : "Ask the agent"}
          ref={input}
          rows={1}
          value={prompt}
        />
        <button className="send" disabled={!ready} onClick={() => void ask(prompt.trim())} type="button">
          <kbd className="key">ENTER</kbd>
        </button>
      </div>

      <div className="suggestions">
        {suggestions.map(suggestion => (
          <button className="suggestion" disabled={!ready || busy} key={suggestion} onClick={() => void ask(suggestion)} type="button">{suggestion}</button>
        ))}
      </div>

      <p className="status"><span>{status}</span></p>
    </section>
  );
}

function summary(agent: Agent.Agent) {
  const { requests, rows } = agent.stats();
  return `${agent.model} · ${requests} req · ${rows} rows`;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
