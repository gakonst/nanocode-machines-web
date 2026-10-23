import { NanocodeProvider, Chat } from "nanocode-ts/react";
import { skin } from "nanocode-ts/react/skin";
import { useState } from "react";
import * as Machine from "./machine.ts";
import * as Machines from "./machines.ts";
import * as Payments from "./payments.ts";
import { Spend } from "./Spend.tsx";
import * as styles from "./styles.ts";
import * as Wallet from "./wallet.ts";

const model = () => Machines.luna;

export function Terminal() {
  const [setup] = useState(() => Machine.create({ history: "nanocode.machines", model }));

  return (
    <NanocodeProvider config={setup.config} highlight={Machine.highlight} skin={skin}>
      <Terminal.Agent runtime={setup.runtime} />
    </NanocodeProvider>
  );
}

Terminal.Agent = function Agent(props: { runtime: Machine.Runtime }) {
  const { busy, checkout, cloud, connected, device, open, ready, spend, status, submit, working } = Machine.useMachine(props.runtime, model());

  return (
    <Chat
      activity={working && !busy ? { who: "wallet", text: "is working" } : undefined}
      commands={Machine.commands}
      extras={<>
        {device && (
          <p {...styles.device()}>
            Approve in Tempo Wallet: <a href={device.verificationUriFull ?? device.verificationUri} onClick={open} rel="noreferrer" target="_blank">{(device.verificationUriFull ?? device.verificationUri).replace(/^https:\/\//, "")}</a> · code <b>{device.userCode}</b>
          </p>
        )}
        {checkout && (
          <p {...styles.device()}>
            Buy MACH in Tempo Wallet: <a href={checkout.url} onClick={open} rel="noreferrer" target="_blank">checkout for {Wallet.short(checkout.address)}</a>
          </p>
        )}
        {spend && <Spend payments={spend} window={Payments.window} />}
      </>}
      link={{ href: "https://nanocode.xyz/", label: "nanocode.xyz →" }}
      onSubmit={submit}
      placeholder={!connected ? "Type /login to connect your Tempo Wallet" : undefined}
      status={status}
      suggestions={(connected ? Machines.suggestions : ["/login"]).map(suggestion => ({ label: suggestion, onClick: () => submit(suggestion), disabled: working || (!!connected && !ready && !cloud) }))}
    />
  );
};
