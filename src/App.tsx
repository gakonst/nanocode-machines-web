import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Chat } from "./Chat.tsx";
import * as Machines from "./machines.ts";
import * as Payments from "./payments.ts";
import { Spend } from "./Spend.tsx";
import * as Wallet from "./wallet.ts";

export function App() {
  const [connected, setConnected] = useState<Wallet.Wallet | undefined>(() => Wallet.restore());
  const [payments, setPayments] = useState<Payments.Payments>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!connected) return setPayments(undefined);
    let live = true;
    void Payments.create(connected).then(next => live && setPayments(next), (failure: unknown) => setError(message(failure)));
    return () => { live = false; };
  }, [connected]);

  const agent = useMemo(() => payments && Machines.agent(payments), [payments]);

  async function connect() {
    setBusy(true);
    setError(undefined);
    try {
      setConnected(await Wallet.connect());
    } catch (failure) {
      setError(message(failure));
    }
    setBusy(false);
  }

  function forget() {
    Wallet.forget();
    setConnected(undefined);
  }

  return (
    <div className="page">
      <h1>nanocode machines<span className="dot">.</span><br />Agents that pay their own way.</h1>
      <p className="lead">
        This agent runs in your browser, the nanocode SDK compiled to WebAssembly, and pays for its own model and every service it calls from your Tempo Wallet in MACH: by the token for the model, by the request for Tempo&apos;s paid APIs, over MPP sessions. Connect your wallet and approve a key that can spend at most {Wallet.format(Wallet.allowance).replace(/\.?0+$/, "")} MACH in the next day, only on payments. Each service keeps a small deposit in its payment channel, which counts against that limit; what a channel does not spend goes back to your wallet when it closes. Its source is <a href="https://github.com/gakonst/nanocode-machines-web">gakonst/nanocode-machines-web</a>.
      </p>

      {connected && <Account connected={connected} forget={forget} payments={payments} />}

      {agent && payments ? (
        <Chat call={agent.call} instructions={Machines.instructions} model={agent.model} panel={<Spend payments={payments} window={Payments.window} />} suggestions={Machines.suggestions} tools={Machines.tools} />
      ) : (
        <section aria-label="Connect" className="connect">
          <p>Connect your Tempo Wallet to start. Tempo Wallet opens in a popup and asks you to approve the key with your passkey.</p>
          <p><button className="suggestion" disabled={busy || !!connected} onClick={() => void connect()} type="button">{busy ? "Waiting for Tempo Wallet…" : connected ? "Opening the agent…" : "Connect Tempo Wallet"}</button></p>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <p><a href="https://nanocode.xyz/docs/guides/mpp-payments">Read how nanocode-machines pays →</a></p>
    </div>
  );
}

function Account(props: { connected: Wallet.Wallet; forget: () => void; payments: Payments.Payments | undefined }) {
  const { connected, forget, payments } = props;
  const [balances, setBalances] = useState<{ balance: bigint; remaining: bigint }>();
  const total = useSyncExternalStore(payments?.subscribe ?? (() => () => {}), () => payments?.ledger().total ?? 0n);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => void Wallet.balances(connected).then(next => live && setBalances(next), () => {}), total === 0n ? 0 : 3000);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [connected, total]);

  const until = new Date(connected.expiry * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <p className="account">
      <span>
        <code title={connected.address}>{`${connected.address.slice(0, 6)}…${connected.address.slice(-4)}`}</code>
        {balances && ` · ${Wallet.format(balances.balance)} MACH · the key may spend ${Wallet.format(balances.remaining)} more until ${until}`}
      </span>
      <span className="actions">
        <button className="suggestion" onClick={() => void Wallet.fund(connected).catch(() => {})} type="button">Add MACH</button>
        <button className="suggestion" onClick={forget} type="button">Forget key</button>
      </span>
    </p>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
