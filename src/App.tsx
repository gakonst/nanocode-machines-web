import { Demos, Header, Lead, Main, origin, Page, Title } from "nanocode-ts/react/site";
import { Terminal } from "./Terminal.tsx";

export function App() {
  return (
    <>
      <Header experiment={`${origin}/machines/`} />
      <Main>
        <Page>
          <Title subtitle="Agents that pay their own way.">nanocode machines</Title>
          <Demos current="machines" />
          <Lead>
            This agent is the nanocode SDK, and it pays for its own model and every service it calls from your Tempo Wallet in MACH: by the token for the model, by the request for Tempo&apos;s paid APIs, over MPP sessions. Type /login to approve a Tempo access key for it, with a spending limit, for a day. It then runs in the cloud, in a Cloudflare Durable Object with subagents, so you can refresh or close this tab and it keeps working; this page reconnects to it. Type /local to keep it, and the key, in your browser instead. Its source is <a href="https://github.com/gakonst/nanocode-machines-web">gakonst/nanocode-machines-web</a>.
          </Lead>
          <Terminal />
          <p><a href="https://nanocode.xyz/docs/guides/mpp-payments">Read how nanocode-machines pays →</a></p>
        </Page>
      </Main>
    </>
  );
}
