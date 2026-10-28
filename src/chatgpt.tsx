import { Account, Meter, Prompts, SignIn, useMachine } from "nanocode-ts/machines/react";
import { NanocodeProvider } from "nanocode-ts/react";
import { ChatGpt } from "nanocode-ts/react/clones";
import { createRoot } from "react-dom/client";
import "./clones/chatgpt.css";
import { createPicker, machineParts, Suggestions } from "./clones/chat.tsx";
import * as Machines from "./machines.ts";

const picker = createPicker("nanocode.machines.chatgpt", Machines.models.codex);

const setup = Machines.setup("nanocode.machines.chatgpt", picker.take);

picker.attach(setup.config);

const parts = machineParts("gpt");

const Chevron = () => <svg aria-hidden="true" fill="none" height={16} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={16}><path d="M6 9l6 6 6-6" /></svg>;

function App() {
  const { bound, choose, model, models } = picker.useModel();
  const machine = useMachine(setup.runtime, { greet: false, model });

  return (
    <ChatGpt
      busy={machine.working}
      config={setup.config}
      footer={<><span className="nc-about">ChatGPT-style nanocode machines: every model call and paid fetch is paid from your Tempo Wallet over MPP · <a href="./">nanocode machines</a></span><span className="nc-site"><a href="https://nanocode.xyz/" rel="noreferrer" target="_blank">nanocode.xyz →</a></span></>}
      heading={machine.connected ? "What can I help with?" : "Sign in with Tempo to start"}
      highlight={Machines.highlight}
      input={composer => (
        <>
          <Prompts machine={machine} />
          {machine.connected ? composer : <SignIn machine={machine} />}
          {machine.spend && <Meter chevron={<Chevron />} source={machine.spend} />}
        </>
      )}
      parts={parts}
      picker={{ bound, choose, current: model.model, models: models.map(item => ({ detail: item.about, id: item.model, label: item.label })) }}
      send={machine.submit}
      sidebar={<Account machine={machine} />}
      suggestions={machine.connected ? <Suggestions machine={machine} prefix="gpt" suggestions={Machines.suggestions} /> : null}
      title="ChatGPT-style machines"
    />
  );
}

// useMachine reads the config, so App renders inside a provider too.
createRoot(document.getElementById("root")!).render(<NanocodeProvider config={setup.config}><App /></NanocodeProvider>);
