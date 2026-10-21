import { Mach, Mount, Provider, tempoWallet } from "accounts";
import { KeyAuthorization } from "ox/tempo";
import { type Address, type Hex, toHex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { Account, Actions, createClient, http, KeyAuthorizationManager } from "viem/tempo";
import { tempo } from "viem/tempo/chains";

export const mach = Mach.token;

export const allowance = 2_000_000n;

export const lifetime = 86_400;

export const rpc = "https://rpc.tempo.xyz";

const escrow: Address = "0x4d50500000000000000000000000000000000000";

const swapper: Address = "0xF72E5107c32C655ffA7539a3C8e97B7C3cE16A3F";

const selectors = {
  approve: "0x095ea7b3",
  open: "0xedc53b00",
  requestClose: "0x675402e5",
  swapTo: "0x34189fed",
  topUp: "0xdc48471e",
  transferWithMemo: "0x95777d59",
  withdraw: "0x41e2c664",
} as const;

const storageKey = "nanocode.machines.wallet";

export type Wallet = {
  address: Address;
  authorization: KeyAuthorization.Rpc;
  expiry: number;
  key: Hex;
  keyAddress: Address;
};

let provider: ReturnType<typeof Provider.create> | undefined;

function wallet() {
  provider ??= Provider.create({ adapter: tempoWallet({ mount: Mount.popup() }) });
  return provider;
}

export function reader() {
  return createClient({ chain: tempo, transport: http(rpc) });
}

export function restore(): Wallet | undefined {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return undefined;
  const parsed = JSON.parse(saved) as Wallet;
  if (parsed.expiry * 1000 > Date.now()) return parsed;
  localStorage.removeItem(storageKey);
  return undefined;
}

export async function connect(): Promise<Wallet> {
  const key = generatePrivateKey();
  const access = Account.fromSecp256k1(key);
  const expiry = Math.floor(Date.now() / 1000) + lifetime;
  const request = {
    address: access.address,
    chainId: toHex(tempo.id),
    expiry,
    keyType: "secp256k1",
    limits: [{ limit: toHex(allowance), token: mach.address }],
    publicKey: access.publicKey,
    scopes: [
      { address: mach.address, selector: selectors.transferWithMemo },
      { address: mach.address, recipients: [swapper], selector: selectors.approve },
      { address: swapper, selector: selectors.swapTo },
      ...[selectors.open, selectors.topUp, selectors.requestClose, selectors.withdraw].map(selector => ({ address: escrow, selector })),
    ],
  };
  const result = (await wallet().request({ method: "wallet_connect", params: [{ capabilities: { authorizeAccessKey: request }, chainId: tempo.id }] } as never)) as {
    accounts: readonly { address: Address; capabilities?: { keyAuthorization?: KeyAuthorization.Rpc } }[];
  };
  const account = result.accounts[0];
  const authorization = account?.capabilities?.keyAuthorization;
  if (!account || !authorization) throw new Error("Tempo Wallet returned no approval.");
  const connected: Wallet = { address: account.address, authorization, expiry, key, keyAddress: access.address };
  localStorage.setItem(storageKey, JSON.stringify(connected));
  return connected;
}

export function forget() {
  localStorage.removeItem(storageKey);
}

export function fund(connected: Wallet) {
  return Mach.fund(wallet(), { address: connected.address, displayName: "nanocode machines" });
}

export async function signer(connected: Wallet) {
  const keyAuthorizationManager = KeyAuthorizationManager.memory();
  await keyAuthorizationManager.set({ accessKey: connected.keyAddress, address: connected.address, chainId: tempo.id }, KeyAuthorization.fromRpc(connected.authorization));
  return Account.fromSecp256k1(connected.key, { access: connected.address, keyAuthorizationManager });
}

export async function balances(connected: Wallet) {
  const client = reader();
  const [balance, remaining] = await Promise.all([
    Actions.token.getBalance(client, { account: connected.address, token: mach.address }),
    Actions.accessKey.getMetadata(client, { accessKey: connected.keyAddress, account: connected.address }).then(
      metadata => metadata.isRevoked || metadata.expiry === 0n ? allowance : Actions.accessKey.getRemainingLimit(client, { accessKey: connected.keyAddress, account: connected.address, token: mach.address }).then(limit => limit.remaining),
      () => allowance,
    ),
  ]);
  return { balance: balance.amount, remaining };
}

export function format(atomics: bigint) {
  return `${atomics / 1_000_000n}.${(atomics % 1_000_000n).toString().padStart(6, "0")}`;
}
