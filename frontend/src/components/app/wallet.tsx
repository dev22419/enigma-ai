// AI-assisted: Used Claude to write this file. The approve and deposit steps follow the flow on feat/app-pages.
"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { cn } from "@/lib/utils";
import { CHAIN_ID, ENIGMA_ADDRESS, SERVICE_PAID, USDT_ADDRESS, USDT_DECIMALS, enigmaAbi, usdtAbi } from "@/lib/client/chain";
import { getBalance, short } from "./jobs";

const subscribe = () => () => undefined;
/** False on the server and on first paint, true after: wallet state only exists in the browser. */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export interface Credit {
  balance: string | null;
  price: string | null;
  left: number | null;
  error: string | null;
}

/** The wallet's prepaid balance and the price of one message, from /api/balance. Refreshes after a deposit. */
export function useCredit(address: string | undefined): Credit {
  const [state, setState] = useState<{ address: string; balance: string; price: string; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let off = false;
    const load = () =>
      getBalance(address)
        .then((b) => {
          if (off) return;
          setState({ address, balance: b.balance, price: b.queryPrice, left: b.queriesRemaining });
          setError(null);
        })
        .catch((e: Error) => !off && setError(e.message));
    load();
    const id = setInterval(load, 20000);
    window.addEventListener("enigma:credit", load);
    return () => {
      off = true;
      clearInterval(id);
      window.removeEventListener("enigma:credit", load);
    };
  }, [address]);

  const mine = state && state.address === address ? state : null;
  return { balance: mine?.balance ?? null, price: mine?.price ?? null, left: mine?.left ?? null, error: address ? error : null };
}

export const refreshCredit = () => window.dispatchEvent(new Event("enigma:credit"));

/** What the composer should do about payment right now. */
export type Gate =
  | { kind: "ok"; address: string | null; price: string | null }
  | { kind: "connect" }
  | { kind: "checking" }
  | { kind: "credit"; balance: string; price: string }
  | { kind: "error"; message: string };

export function useGate(skip: boolean): { gate: Gate; credit: Credit; address: string | undefined } {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const credit = useCredit(isConnected ? address : undefined);
  if (skip || SERVICE_PAID) return { gate: { kind: "ok", address: null, price: null }, credit, address };
  if (!mounted || !isConnected || !address) return { gate: { kind: "connect" }, credit, address };
  if (credit.error) return { gate: { kind: "error", message: credit.error }, credit, address };
  if (credit.balance === null || credit.price === null) return { gate: { kind: "checking" }, credit, address };
  if (Number(credit.balance) < Number(credit.price)) return { gate: { kind: "credit", balance: credit.balance, price: credit.price }, credit, address };
  return { gate: { kind: "ok", address, price: credit.price }, credit, address };
}

/** A small "Connect wallet" button, used where the send button would be. */
export function ConnectPill({ className }: { className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button
          onClick={openConnectModal}
          disabled={!mounted}
          className={cn("rounded-full bg-melon px-4 py-2 text-[13px] font-semibold text-night transition-colors hover:bg-melon-lit disabled:opacity-40", className)}
        >
          Connect wallet
        </button>
      )}
    </ConnectButton.Custom>
  );
}

/** Bottom of the sidebar: who is connected, which network, and how much credit is left. */
export function WalletBox() {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const credit = useCredit(isConnected ? address : undefined);

  if (SERVICE_PAID)
    return (
      <p className="px-2 pt-2 text-[12px] leading-snug text-frost-soft/60 max-lg:hidden">
        Demo mode: the service wallet pays for jobs.
      </p>
    );

  if (!mounted || !isConnected || !address)
    return (
      <div className="px-2 pt-2 max-lg:hidden">
        <ConnectButton.Custom>
          {({ openConnectModal, mounted: ready }) => (
            <button onClick={openConnectModal} disabled={!ready} className="text-[13.5px] text-frost/80 underline decoration-frost/20 underline-offset-4 transition-colors hover:text-frost hover:decoration-melon disabled:opacity-40">
              Connect wallet
            </button>
          )}
        </ConnectButton.Custom>
        <p className="mt-1 text-[12px] text-frost-soft/60">Jobs are paid from your prepaid balance.</p>
      </div>
    );

  return (
    <div className="px-2 pt-2 max-lg:hidden">
      <ConnectButton.Custom>
        {({ openAccountModal }) => (
          <button onClick={openAccountModal} className="flex w-full items-center gap-2 text-left text-[13px] text-frost/85 transition-colors hover:text-frost">
            <span className={cn("size-1.5 rounded-full", chainId === CHAIN_ID ? "bg-volt-lit shadow-[0_0_8px_#5cc4ff]" : "bg-melon")} />
            <span className="font-mono text-[12px]">{short(address, 6, 4)}</span>
          </button>
        )}
      </ConnectButton.Custom>
      {chainId !== CHAIN_ID && <p className="mt-1 text-[12px] text-melon">Switch to Whitechain to add credit.</p>}
      <p className="mt-1 text-[12px] text-frost-soft/70">
        Credit: <span className="num text-frost/85">{credit.balance !== null ? `${Number(credit.balance).toFixed(2)} USDT` : "…"}</span>{" "}
        <Link href="/dashboard" className="underline decoration-frost/20 underline-offset-4 hover:text-frost">
          Add
        </Link>
      </p>
    </div>
  );
}

/* ================================================================== deposit */

const FAUCET = parseUnits("100", USDT_DECIMALS);

function oneLine(message: string) {
  const first = message.split("\n")[0];
  return /user rejected|denied/i.test(first) ? "You declined the request in your wallet." : first.slice(0, 160);
}

/** Add prepaid credit: get test USDT, approve Enigma to take it, deposit. Each step is one wallet confirmation. */
export function DepositFlow() {
  const mounted = useMounted();
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [amount, setAmount] = useState("5");
  const [last, setLast] = useState<"mint" | "approve" | "deposit" | null>(null);

  const usdt = useReadContract({ address: USDT_ADDRESS, abi: usdtAbi, functionName: "balanceOf", args: address ? [address] : undefined, chainId: CHAIN_ID, query: { enabled: !!address } });
  const allowance = useReadContract({ address: USDT_ADDRESS, abi: usdtAbi, functionName: "allowance", args: address ? [address, ENIGMA_ADDRESS] : undefined, chainId: CHAIN_ID, query: { enabled: !!address } });
  const gas = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address } });
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId: CHAIN_ID });

  const { refetch: refetchUsdt } = usdt;
  const { refetch: refetchAllowance } = allowance;
  const { refetch: refetchGas } = gas;
  useEffect(() => {
    if (!receipt.isSuccess) return;
    refetchUsdt();
    refetchAllowance();
    refetchGas();
    if (last === "deposit") refreshCredit();
    // once per confirmed transaction
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  if (!mounted || !isConnected || !address) {
    return (
      <div className="rounded-[14px] border border-frost/10 bg-night-2/60 p-5">
        <p className="text-[15px] font-semibold">Add credit</p>
        <p className="mt-1 max-w-[34rem] text-[14px] leading-relaxed text-frost-soft">Connect a wallet to deposit test USDT. Each private message costs a fixed price from that balance.</p>
        <ConnectPill className="mt-4" />
      </div>
    );
  }

  let value = BigInt(0);
  try {
    value = amount ? parseUnits(amount, USDT_DECIMALS) : BigInt(0);
  } catch {
    value = BigInt(0);
  }
  const held = usdt.data ?? BigInt(0);
  const approved = allowance.data ?? BigInt(0);
  const busy = write.isPending || (!!write.data && receipt.isLoading);
  const noGas = gas.data !== undefined && gas.data.value === BigInt(0);
  const step = value === BigInt(0) ? 0 : held < value ? 1 : approved < value ? 2 : 3;
  const labels = ["Get test USDT", "Approve", "Deposit"];

  const send = (name: "mint" | "approve" | "deposit", config: Parameters<typeof write.writeContract>[0]) => {
    setLast(name);
    write.reset();
    write.writeContract(config);
  };

  return (
    <div className="rounded-[14px] border border-frost/10 bg-night-2/60 p-5">
      <p className="text-[15px] font-semibold">Add credit</p>
      <p className="mt-1 text-[13.5px] text-frost-soft">
        Wallet holds <span className="num text-frost/85">{formatUnits(held, USDT_DECIMALS)}</span> test USDT.
      </p>

      <label className="mt-4 flex w-44 items-center gap-2 rounded-[10px] border border-frost/15 bg-night px-3 py-2 focus-within:border-frost/30">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount in USDT"
          className="num w-full bg-transparent text-[15px] text-frost focus:outline-none"
        />
        <span className="font-mono text-[11px] text-frost-soft">USDT</span>
      </label>

      <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {labels.map((l, i) => (
          <li key={l} className={cn(step > i + 1 ? "text-frost/40 line-through" : step === i + 1 ? "text-frost" : "text-frost-soft/60")}>
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {noGas && (
        <p className="mt-3 max-w-[36rem] text-[13px] text-melon">This wallet has no WBT for network fees. Get a little test WBT from the Whitechain testnet faucet, then come back.</p>
      )}

      <div className="mt-4">
        {chainId !== CHAIN_ID ? (
          <button onClick={() => switchChain({ chainId: CHAIN_ID })} disabled={switching} className="rounded-full bg-melon px-4 py-2 text-[13px] font-semibold text-night hover:bg-melon-lit disabled:opacity-50">
            Switch to Whitechain
          </button>
        ) : step <= 1 ? (
          <button
            disabled={busy || value === BigInt(0)}
            onClick={() => send("mint", { address: USDT_ADDRESS, abi: usdtAbi, functionName: "mint", args: [address, FAUCET], chainId: CHAIN_ID })}
            className="rounded-full bg-frost px-4 py-2 text-[13px] font-semibold text-night hover:bg-melon disabled:opacity-40"
          >
            {busy ? "Confirming…" : "Get 100 test USDT"}
          </button>
        ) : step === 2 ? (
          <button
            disabled={busy}
            onClick={() => send("approve", { address: USDT_ADDRESS, abi: usdtAbi, functionName: "approve", args: [ENIGMA_ADDRESS, value], chainId: CHAIN_ID })}
            className="rounded-full bg-frost px-4 py-2 text-[13px] font-semibold text-night hover:bg-melon disabled:opacity-40"
          >
            {busy ? "Confirming…" : `Approve ${amount} USDT`}
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => send("deposit", { address: ENIGMA_ADDRESS, abi: enigmaAbi, functionName: "deposit", args: [value], chainId: CHAIN_ID })}
            className="rounded-full bg-melon px-4 py-2 text-[13px] font-semibold text-night hover:bg-melon-lit disabled:opacity-40"
          >
            {busy ? "Confirming…" : `Deposit ${amount} USDT`}
          </button>
        )}
      </div>

      {write.error && (
        <p role="alert" className="mt-3 text-[13px] text-melon">
          {oneLine(write.error.message)}
        </p>
      )}
      {receipt.isError && (
        <p role="alert" className="mt-3 text-[13px] text-melon">
          The transaction failed on-chain.
        </p>
      )}
      {receipt.isSuccess && last === "deposit" && <p className="mt-3 text-[13px] text-volt-lit">Deposited. Your credit is updated.</p>}
    </div>
  );
}
