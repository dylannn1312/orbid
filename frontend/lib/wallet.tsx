'use client';

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import {
  FreighterModule,
  FREIGHTER_ID,
} from '@creit.tech/stellar-wallets-kit/modules/freighter';

// The kit returns the message signature as a base64 string (Freighter signs the
// raw message bytes with the account's ed25519 key). Decode it to raw bytes.
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET;
const STORAGE_KEY = 'orbid:wallet';

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    network: PASSPHRASE as Networks,
    selectedWalletId: FREIGHTER_ID,
    modules: [new FreighterModule()],
  });
  initialized = true;
}

interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  signMessage: (message: string) => Promise<Uint8Array>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function StellarProvider({ children }: PropsWithChildren) {
  const [address, setAddress] = useState<string | null>(null);

  // Reconnect on reload from localStorage.
  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!saved) return;
    ensureInit();
    StellarWalletsKit.setWallet(saved);
    StellarWalletsKit.getAddress()
      .then(({ address }) => setAddress(address))
      .catch(() => window.localStorage.removeItem(STORAGE_KEY));
  }, []);

  const connect = useCallback(async () => {
    ensureInit();
    const { address } = await StellarWalletsKit.authModal();
    window.localStorage.setItem(STORAGE_KEY, FREIGHTER_ID);
    setAddress(address);
  }, []);

  const disconnect = useCallback(() => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    setAddress(null);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string) => {
      ensureInit();
      if (!address) throw new Error('Wallet not connected');
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase: PASSPHRASE,
      });
      return signedTxXdr;
    },
    [address],
  );

  const signMessage = useCallback(
    async (message: string) => {
      ensureInit();
      if (!address) throw new Error('Wallet not connected');
      const { signedMessage } = await StellarWalletsKit.signMessage(message, {
        address,
        networkPassphrase: PASSPHRASE,
      });
      return base64ToBytes(signedMessage);
    },
    [address],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      isConnected: !!address,
      connect,
      disconnect,
      signTransaction,
      signMessage,
    }),
    [address, connect, disconnect, signTransaction, signMessage],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useStellarWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useStellarWallet must be used within StellarProvider');
  return ctx;
}
