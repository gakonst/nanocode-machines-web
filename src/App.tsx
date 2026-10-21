import { Terminal } from "./Terminal.tsx";

export function App() {
  return (
    <div className="page">
      <h1>nanocode machines<span className="dot">.</span><br />Agents that pay their own way.</h1>
      <p className="lead">
        This agent runs in your browser, the nanocode SDK compiled to WebAssembly, and pays for its own model and every service it calls from your Tempo Wallet in MACH: by the token for the model, by the request for Tempo&apos;s paid APIs, over MPP sessions. Type /login to approve a Tempo access key for it, as the nanocode-mpp CLI logs in with tempo wallet login. Each service keeps a small deposit in its payment channel, which counts against the key&apos;s limit; what a channel does not spend goes back to your wallet when it closes. Its source is <a href="https://github.com/gakonst/nanocode-machines-web">gakonst/nanocode-machines-web</a>.
      </p>
      <Terminal />
      <p><a href="https://nanocode.xyz/docs/guides/mpp-payments">Read how nanocode-machines pays →</a></p>
    </div>
  );
}
