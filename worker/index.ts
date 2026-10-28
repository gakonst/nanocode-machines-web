import { type Env, Machines } from "nanocode-ts/machines/cloudflare";

const machines = Machines.create({});

export const { AgentSession, Wallet } = machines;

export default { fetch: machines.fetch } satisfies ExportedHandler<Env.Env>;
