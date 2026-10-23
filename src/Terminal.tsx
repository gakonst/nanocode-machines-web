import { createConfig, type Entry, liveEvent } from "nanocode-ts/client";
import { Chat, NanocodeProvider, useConfig, useConversations, useSend } from "nanocode-ts/react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import type * as Agent from "./agent.ts";
import * as Cloud from "./cloud.ts";
import * as Machines from "./machines.ts";
import * as Payments from "./payments.ts";
import { Spend } from "./Spend.tsx";
import * as styles from "./styles.ts";
import * as Wallet from "./wallet.ts";

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

const localKey = "nanocode.machines.local";

const highlight = () => import("nanocode-ts/highlight").then(module => module.highlight);

const limits = `at most ${amount(Wallet.allowance)} MACH, plus ${amount(Wallet.feeAllowance)} ${Wallet.usdc.symbol} for fees, until it expires a day later`;

type Runtime = { agent?: Agent.Agent; cloud?: Cloud.Cloud };

export function Terminal() {
  const [setup] = useState(() => {
    const runtime: Runtime = { cloud: Cloud.restore() };
    const config = createConfig({
      history: { key: "nanocode.machines" },
      keep: 300,
      revealMs: 0,
      transport: {
        async send({ prompt, push, note }) {
          if (runtime.cloud) return Cloud.ask(runtime.cloud, prompt, handlers(push, note));
          if (!runtime.agent) throw new Error("The agent is still loading.");
          if (!(await runtime.agent.ask(prompt))) throw new Error("The turn has no result.");
        },
        async steer({ prompt, note }) {
          if (runtime.cloud) {
            if (await Cloud.steer(runtime.cloud, prompt) === "steered") return true;
            note("tool", "The turn is finishing; ask again in a moment.");
            return false;
          }
          return await runtime.agent?.steer(prompt) === "steered";
        },
        async resume({ push, note }) {
          const saved = Cloud.restore();
          if (!saved?.open) return;
          note("tool", "Reconnecting to the turn that kept running in the cloud while this tab was closed.");
          await Cloud.resume(saved, handlers(push, note));
        },
        restore(saved) {
          if (runtime.cloud) Cloud.adopt(runtime.cloud, saved);
        },
        snapshot: () => runtime.cloud && Cloud.snapshot(runtime.cloud),
      },
    });
    return { config, runtime };
  });

  return (
    <NanocodeProvider config={setup.config} highlight={highlight}>
      <Terminal.Agent runtime={setup.runtime} />
    </NanocodeProvider>
  );
}

function handlers(push: (event: NonNullable<ReturnType<typeof liveEvent>>) => void, note: (kind: Entry["kind"], text: string) => void): Cloud.Handlers {
  return {
    event: logged => {
      const event = liveEvent(logged);
      if (event) push(event);
    },
    interrupted: () => note("tool", "The session's Durable Object reset. Its alarm started it again, and the turn continues from its checkpoint."),
  };
}

Terminal.Agent = function Agent(props: { runtime: Runtime }) {
  const { runtime } = props;
  const config = useConfig();
  const { send, isPending: busy } = useSend();
  const { current: conversation } = useConversations();
  const note = config.note;
  const [connected, setConnected] = useState<Wallet.Wallet>();
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [device, setDevice] = useState<Wallet.Prompt>();
  const [checkout, setCheckout] = useState<{ address: string; url: string }>();
  const [cloud, setCloudState] = useState<Cloud.Cloud | undefined>(runtime.cloud);
  const payments = useMemo(() => connected && Payments.create(connected), [connected]);
  const metered = useMemo(() => cloud && Cloud.meter(cloud), [cloud?.token]);

  function setCloud(next: Cloud.Cloud | undefined) {
    runtime.cloud = next;
    setCloudState(next);
  }

  useEffect(() => Wallet.onPrompt(setDevice), []);

  useEffect(() => {
    void config.resume();
  }, [conversation]);

  useEffect(() => {
    const restored = config.getState().entries.length > 0;
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
    const { fetch: pay, model } = Machines.agent(payments);
    setStatus("Loading nanocode-ts…");
    void import("./agent.ts")
      .then(module => module.create({ fetch: pay, instructions: Machines.instructions, model, onEvent: logged => {
        const event = liveEvent(logged);
        if (event) config.push(event);
      } }))
      .then(created => {
        if (disposed) return void created.dispose();
        runtime.agent = created;
        setReady(true);
        setStatus(summary(created));
      }, (error: unknown) => setStatus(`The agent could not start: ${message(error)}`));
    return () => {
      disposed = true;
      setReady(false);
      void runtime.agent?.dispose();
      runtime.agent = undefined;
    };
  }, [payments]);

  useEffect(() => {
    if (!busy && runtime.agent) setStatus(summary(runtime.agent));
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
    setCloud(await Cloud.enable(account));
    note("tool", "The agent runs in the cloud, in a Durable Object with subagents and a workspace, paid from your key within its limit until it expires: this site's Worker keeps the key encrypted. Refresh or close the tab whenever you like; the turn keeps going and this page reconnects to it. Type /local to run in this tab instead, or /logout to revoke the key everywhere.");
  }

  function clear() {
    config.clear();
    if (cloud) {
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

  function submit(text: string) {
    if (text.startsWith("/")) return void command(text);
    if (!connected) {
      note("user", text);
      return note("error", "Log in first: type /login.");
    }
    if (!cloud && !runtime.agent) {
      note("user", text);
      return note("tool", "The agent is still loading.");
    }
    void send(text);
  }

  return (
    <Chat
      activity={working && !busy ? { who: "wallet", text: "is working" } : undefined}
      commands={commands}
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
        {metered ? <Spend payments={metered} window={Payments.window} /> : payments && <Spend payments={payments} window={Payments.window} />}
      </>}
      link={{ href: "https://nanocode.xyz/", label: "nanocode.xyz →" }}
      onSubmit={submit}
      placeholder={!connected ? "Type /login to connect your Tempo Wallet" : undefined}
      status={connected ? `${cloud ? "cloud · gpt-6-luna" : status} · ${Wallet.short(connected.address)}` : "not logged in · /login"}
      suggestions={(connected ? Machines.suggestions : ["/login"]).map(suggestion => ({ label: suggestion, onClick: () => submit(suggestion), disabled: working || (!!connected && ((!ready && !cloud) || busy)) }))}
    />
  );
};

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
