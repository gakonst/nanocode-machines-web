import { createMachines, type MachinesEnv } from "nanocode-ts/machines/cloudflare";

const machines = createMachines({});

export const { AgentSession, Wallet } = machines;

export default { fetch: machines.fetch } satisfies ExportedHandler<MachinesEnv>;
