import { Account, Meter, Prompts, SignIn, useMachine } from "nanocode-ts/machines/react";
import { Claude } from "nanocode-ts/react/clones";
import { createRoot } from "react-dom/client";
import "./clones/claude.css";
import { createPicker, machineParts, Suggestions } from "./clones/chat.tsx";
import * as Machines from "./machines.ts";

const picker = createPicker("nanocode.machines.claude", Machines.models.claude);

const setup = Machines.setup("nanocode.machines.claude", picker.take);

picker.attach(setup.config);

const parts = machineParts("cl");

const Chevron = () => <svg aria-hidden="true" fill="none" height={16} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={16}><path d="M6 9l6 6 6-6" /></svg>;

function App() {
  const { bound, choose, model, models } = picker.useModel();
  const machine = useMachine(setup.runtime, model, { greet: false });

  return (
    <Claude
      busy={machine.working}
      config={setup.config}
      footer={<><span className="nc-about">Claude-style nanocode machines: every model call and paid fetch is paid from your Tempo Wallet over MPP · <a href="./">nanocode machines</a></span><span className="nc-site"><a href="https://nanocode.xyz/" rel="noreferrer" target="_blank">nanocode.xyz →</a></span></>}
      heading={machine.connected ? undefined : "Sign in with Tempo"}
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
      suggestions={machine.connected ? <Suggestions machine={machine} prefix="cl" suggestions={Machines.suggestions} /> : null}
      title="Claude-style machines"
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
