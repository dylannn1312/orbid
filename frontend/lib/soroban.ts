import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
const PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
const READ_SOURCE = process.env.NEXT_PUBLIC_OWNER_ADDRESS!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const scAddress = (a: string) =>
  nativeToScVal(Address.fromString(a), { type: 'address' });
export const scU64 = (n: number | bigint) => nativeToScVal(BigInt(n), { type: 'u64' });
export const scU32 = (n: number) => nativeToScVal(n, { type: 'u32' });
export const scU128 = (n: bigint | string) => nativeToScVal(BigInt(n), { type: 'u128' });
export const scI128 = (n: bigint | string) => nativeToScVal(BigInt(n), { type: 'i128' });
export const scBytes = (b: Uint8Array) =>
  nativeToScVal(Buffer.from(b), { type: 'bytes' });

export async function readContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<unknown> {
  const srv = new rpc.Server(RPC_URL);
  const source = new Account(READ_SOURCE, '0');
  const c = new Contract(contractId);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(c.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await srv.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  const rv = sim.result?.retval;
  return rv ? scValToNative(rv) : null;
}

export async function writeContract(
  contractId: string,
  source: string,
  sign: (xdr: string) => Promise<string>,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<string> {
  const srv = new rpc.Server(RPC_URL);
  const account = await srv.getAccount(source);
  const c = new Contract(contractId);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(c.call(method, ...args))
    .setTimeout(300)
    .build();
  const prepared = await srv.prepareTransaction(built);
  const signed = await sign(prepared.toXDR());
  const tx = TransactionBuilder.fromXDR(signed, PASSPHRASE);
  const sent = await srv.sendTransaction(tx);
  if (sent.status === 'ERROR')
    throw new Error('submit failed: ' + JSON.stringify(sent.errorResult));
  let res = await srv.getTransaction(sent.hash);
  while (res.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await sleep(1000);
    res = await srv.getTransaction(sent.hash);
  }
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS)
    throw new Error('tx ' + sent.hash + ' failed: ' + res.status);
  return sent.hash;
}

// Like writeContract, but also returns the contract call's decoded return value.
export async function writeContractWithReturn(
  contractId: string,
  source: string,
  sign: (xdr: string) => Promise<string>,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<{ hash: string; returnValue: unknown }> {
  const srv = new rpc.Server(RPC_URL);
  const account = await srv.getAccount(source);
  const c = new Contract(contractId);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(c.call(method, ...args))
    .setTimeout(300)
    .build();
  const prepared = await srv.prepareTransaction(built);
  const signed = await sign(prepared.toXDR());
  const tx = TransactionBuilder.fromXDR(signed, PASSPHRASE);
  const sent = await srv.sendTransaction(tx);
  if (sent.status === 'ERROR')
    throw new Error('submit failed: ' + JSON.stringify(sent.errorResult));
  let res = await srv.getTransaction(sent.hash);
  while (res.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await sleep(1000);
    res = await srv.getTransaction(sent.hash);
  }
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS)
    throw new Error('tx ' + sent.hash + ' failed: ' + res.status);
  const rv = res.returnValue;
  return { hash: sent.hash, returnValue: rv ? scValToNative(rv) : null };
}
