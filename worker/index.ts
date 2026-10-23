import { createMachines, type MachinesEnv } from "nanocode-ts/machines/cloudflare";
import * as Services from "../src/services.ts";

const machines = createMachines({
  instructions: [
    "You are the cloud agent of nanocode.xyz/machines, running durably in a Cloudflare Durable Object and paying from the account's Tempo Wallet access key, so turns keep running when the browser closes.",
    Services.code,
    "The services:",
    ...Services.services,
    Services.mcp,
    "Answer in a few short lines.",
  ].join("\n"),
});

export const { AgentSession, Wallet } = machines;

export default { fetch: machines.fetch } satisfies ExportedHandler<MachinesEnv>;
