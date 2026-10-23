import { Chat, NanocodeProvider } from "nanocode-ts/react";
import { skin } from "nanocode-ts/react/skin";
import { commands, Models } from "nanocode-ts/machines";
import { Prompts, Spend, useMachine } from "nanocode-ts/machines/react";
import { useState } from "react";
import * as Machines from "./machines.ts";

const model = () => Models.luna;

export function Terminal() {
  const [setup] = useState(() => Machines.setup("nanocode.machines", model));

  return (
    <NanocodeProvider config={setup.config} highlight={Machines.highlight} skin={skin}>
      <Terminal.Agent runtime={setup.runtime} />
    </NanocodeProvider>
  );
}

Terminal.Agent = function Agent(props: { runtime: ReturnType<typeof Machines.setup>["runtime"] }) {
  const machine = useMachine(props.runtime, model());
  const { busy, cloud, connected, ready, spend, status, submit, working } = machine;

  return (
    <Chat
      activity={working && !busy ? { who: "wallet", text: "is working" } : undefined}
      commands={commands}
      extras={<>
        <Prompts machine={machine} />
        {spend && <Spend source={spend} />}
      </>}
      link={{ href: "https://nanocode.xyz/", label: "nanocode.xyz →" }}
      onSubmit={submit}
      placeholder={!connected ? "Type /login to connect your Tempo Wallet" : undefined}
      status={status}
      suggestions={(connected ? Machines.suggestions : ["/login"]).map(suggestion => ({ label: suggestion, onClick: () => submit(suggestion), disabled: working || (!!connected && !ready && !cloud) }))}
    />
  );
};
