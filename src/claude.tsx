import type { TurnBlock } from "nanocode-ts/client";
import { Markdown, NanocodeProvider, type Skin, ToolCell, useActivity, useConversations, useTurns } from "nanocode-ts/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./clones/claude.css";
import { Account, type Block, CopyCode, createPicker, greeting, grouped, Meter, Prompts, seconds, SignIn, Suggestions, useComposer, useDismiss, useSidebar, useStick } from "./clones/chat.tsx";
import { ArrowUp, Check, Chevron, Plus, Sidebar, Stop, Trash } from "./clones/icons.tsx";
import * as Machine from "./machine.ts";
import * as Machines from "./machines.ts";

const picker = createPicker("nanocode.machines.claude", Machines.models.claude);

const setup = Machine.create({ history: "nanocode.machines.claude", model: picker.take });

picker.attach(setup.config);

const skin: Skin = {
  icons: { cancelled: "–", completed: "✓", failed: "!", running: "", yielded: "↻" },
  parts: {
    body: () => ({ className: "cl-cell-body" }),
    children: () => ({ className: "cl-cell-children" }),
    code: () => ({ className: "cl-pre" }),
    header: () => ({ className: "cl-cell-head" }),
    heading: () => ({ className: "md-heading" }),
    icon: () => ({ className: "cl-cell-icon" }),
    inline: () => ({ className: "cl-inline" }),
    meta: () => ({ className: "cl-cell-meta" }),
    more: () => ({ className: "cl-cell-more" }),
    name: () => ({ className: "cl-cell-name" }),
    section: () => ({ className: "cl-cell-section" }),
    title: () => ({ className: "cl-cell-title" }),
    table: () => ({ className: "md-table" }),
    tool: () => ({ className: "cl-cell" }),
  },
};

function ModelMenu() {
  const { bound, choose, model, models } = picker.useModel();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div className="cl-model" ref={ref}>
      <button aria-expanded={open} aria-haspopup="menu" className="cl-model-button" onClick={() => setOpen(value => !value)} type="button">
        {model.label}<Chevron />
      </button>
      {open && (
        <div className="cl-menu" role="menu">
          {models.map(item => (
            <button aria-checked={item.model === model.model} className="cl-menu-item" key={item.model} onClick={() => { choose(item.model); setOpen(false); }} role="menuitemradio" type="button">
              <span><strong>{item.label}</strong><small>{item.about}</small></span>
              {item.model === model.model && <Check />}
            </button>
          ))}
          {bound && <p className="cl-menu-note">This chat keeps its model. Another model starts a new chat.</p>}
        </div>
      )}
    </div>
  );
}

function Thinking(props: { block: TurnBlock }) {
  const [open, setOpen] = useState(false);
  const done = !props.block.live;
  const took = seconds(props.block);
  const label = !done ? "Thinking…" : took ? "Thought for " + took + "s" : "Thought process";

  return (
    <div className="cl-thinking" data-done={done} data-open={open}>
      <button aria-expanded={open} onClick={() => setOpen(!open)} type="button"><span>{label}</span><Chevron /></button>
      {(open || !done) && <div className="cl-thinking-text">{props.block.text.replace(/\*\*(.+?)\*\*/g, "$1")}</div>}
    </div>
  );
}

function BlockView(props: { block: Block }) {
  const block = props.block;
  if (block.kind === "tools") return <div className="cl-tools">{block.cells.map(cell => <ToolCell cell={cell} collapsed key={cell.call_id} live={block.live} />)}</div>;
  if (block.kind === "assistant") return <div className="cl-md"><Markdown code={(language, code) => <CopyCode code={code} language={language} />} text={block.text} /></div>;
  if (block.kind === "reasoning") return <Thinking block={block} />;
  return <p className="cl-note" data-error={block.kind === "error"}>{block.text}</p>;
}

function Composer(props: { machine: Machine.Machine; onSend(): void }) {
  const composer = useComposer({ onSend: props.onSend, send: props.machine.submit });

  return (
    <form className="cl-composer" onSubmit={event => { event.preventDefault(); composer.submit(); }}>
      <textarea placeholder={composer.busy ? "Add to the response…" : "How can I help you today?"} {...composer.textarea} />
      <div className="cl-composer-row">
        <ModelMenu />
        {composer.canCancel && composer.empty
          ? <button aria-label="Stop" className="cl-send" onClick={() => void composer.cancel()} type="button"><Stop /></button>
          : <button aria-label="Send" className="cl-send" disabled={composer.empty} type="submit"><ArrowUp /></button>}
      </div>
    </form>
  );
}

function Footer() {
  return <p className="cl-foot">Claude-style nanocode machines: every model call and paid fetch is paid from your Tempo Wallet over MPP · <a href="./">nanocode machines</a></p>;
}

function App() {
  const thread = useTurns();
  const threads = useConversations();
  const sidebar = useSidebar();
  const log = useStick(thread);
  const activity = useActivity();
  const { model } = picker.useModel();
  const machine = Machine.useMachine(setup.runtime, model, { greet: false });
  const busy = activity.busy || machine.working;
  const title = threads.conversations.find(item => item.id === threads.current)?.title;

  const streaming = activity.phase === "writing" || activity.phase === "thinking";
  const newChat = () => { threads.create(); sidebar.close(); };
  const input = (
    <>
      <Prompts machine={machine} prefix="cl" />
      {machine.connected ? <Composer machine={machine} onSend={log.pin} /> : <SignIn machine={machine} prefix="cl" />}
      {machine.spend && <Meter prefix="cl" source={machine.spend} />}
    </>
  );

  return (
    <div className="cl" data-sidebar={sidebar.open}>
      <aside className="cl-sidebar">
        <div className="cl-sidebar-top">
          <button aria-label="Close sidebar" className="cl-icon" onClick={sidebar.toggle} type="button"><Sidebar /></button>
          <span className="cl-brand">Claude-style machines</span>
        </div>
        <button className="cl-new" disabled={!threads.canCreate} onClick={newChat} type="button"><span className="cl-new-icon"><Plus /></span>New chat</button>
        <p className="cl-section">Recents</p>
        <nav className="cl-chats">
          {threads.conversations.map(item => (
            <div className="cl-chat" data-current={item.id === threads.current} key={item.id}>
              <button disabled={!threads.canSelect} onClick={() => { threads.select(item.id); sidebar.close(); }} type="button">{item.title || "New chat"}</button>
              <button aria-label="Delete chat" className="cl-chat-remove" onClick={() => threads.remove(item.id)} type="button"><Trash /></button>
            </div>
          ))}
        </nav>
        <Account machine={machine} prefix="cl" />
      </aside>
      <div className="cl-scrim" onClick={sidebar.toggle} />
      <main className="cl-main">
        <header className="cl-top">
          <button aria-label="Open sidebar" className="cl-icon cl-open" onClick={sidebar.toggle} type="button"><Sidebar /></button>
          <span className="cl-title">{thread.length ? title || "New chat" : ""}</span>
          <button aria-label="New chat" className="cl-icon cl-top-new" disabled={!threads.canCreate} onClick={newChat} type="button"><Plus /></button>
        </header>
        {thread.length === 0 ? (
          <div className="cl-hero">
            <h1><span aria-hidden="true" className="cl-spark">✻</span>{machine.connected ? greeting() : "Sign in with Tempo"}</h1>
            {input}
            {machine.connected && <Suggestions machine={machine} prefix="cl" suggestions={Machines.suggestions} />}
            <Footer />
          </div>
        ) : (
          <>
            <div aria-live="polite" className="cl-log" onScroll={log.onScroll} ref={log.ref}>
              <div className="cl-thread">
                {thread.map((turn, index) => (
                  <section className="cl-turn" key={turn.id}>
                    {turn.prompt && <div className="cl-user"><span aria-hidden="true" className="cl-avatar">{machine.connected ? machine.connected.address.slice(2, 3).toUpperCase() : "Y"}</span><div>{turn.prompt.text}</div></div>}
                    <div className="cl-assistant">
                      {grouped(turn.blocks).map((block, position) => <BlockView block={block} key={position} />)}
                      {index === thread.length - 1 && <span aria-label={busy ? "Responding" : undefined} className="cl-spark cl-status" data-busy={busy} data-streaming={streaming}>✻</span>}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <div className="cl-bottom">
              {input}
              <Footer />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <NanocodeProvider config={setup.config} highlight={Machine.highlight} skin={skin}>
    <App />
  </NanocodeProvider>,
);
