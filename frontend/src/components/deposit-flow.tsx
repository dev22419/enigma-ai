"use client";
// AI-assisted: Used Claude for the USDT approve and deposit flow
import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ENIGMA_ADDRESS, enigmaAbi, USDT_ADDRESS, usdtAbi, USDT_DECIMALS, whitechainTestnet } from "@/lib/client/chain";

const CHAIN = whitechainTestnet.id;
const FAUCET_AMOUNT = parseUnits("100", USDT_DECIMALS);

export function DepositFlow({ onDeposited }: { onDeposited?: () => void }) {
  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const [amount, setAmount] = useState("5");
  const [label, setLabel] = useState("");

  const wallet = useReadContract({ address: USDT_ADDRESS, abi: usdtAbi, functionName: "balanceOf", args: address ? [address] : undefined, chainId: CHAIN, query: { enabled: !!address } });
  const allowance = useReadContract({ address: USDT_ADDRESS, abi: usdtAbi, functionName: "allowance", args: address ? [address, ENIGMA_ADDRESS] : undefined, chainId: CHAIN, query: { enabled: !!address } });
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId: CHAIN });

  const { refetch: refetchWallet } = wallet, { refetch: refetchAllowance } = allowance;
  useEffect(() => {
    if (!receipt.isSuccess) return;
    refetchWallet();
    refetchAllowance();
    if (label === "deposit") onDeposited?.();
    // Runs once per confirmed transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  let value = BigInt(0);
  try { value = amount ? parseUnits(amount, USDT_DECIMALS) : BigInt(0); } catch { value = BigInt(0); }

  const held = wallet.data ?? BigInt(0), approved = allowance.data ?? BigInt(0);
  const busy = write.isPending || (!!write.data && receipt.isLoading);
  const step = value === BigInt(0) ? 0 : held < value ? 1 : approved < value ? 2 : 3;

  const send = (name: string, config: Parameters<typeof write.writeContract>[0]) => {
    setLabel(name);
    write.writeContract(config);
  };

  if (!address) {
    return (
      <div className="dep">
        <h2>Add credit</h2>
        <button type="button" className="btn" onClick={openConnectModal}>Connect wallet</button>
      </div>
    );
  }

  return (
    <div className="dep">
      <h2>Add credit</h2>
      <label className="dep-amount">
        <span>USDT</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in USDT" />
      </label>
      <p className="dep-held">Wallet holds {formatUnits(held, USDT_DECIMALS)} test USDT</p>

      <ol className="dep-steps">
        <li data-state={step > 1 ? "done" : step === 1 ? "now" : "next"}>Get test USDT</li>
        <li data-state={step > 2 ? "done" : step === 2 ? "now" : "next"}>Approve</li>
        <li data-state={step === 3 ? "now" : "next"}>Deposit</li>
      </ol>

      {chainId !== CHAIN ? (
        <button type="button" className="btn btn-warn" onClick={() => switchChain({ chainId: CHAIN })}>Switch to Whitechain</button>
      ) : step <= 1 ? (
        <button type="button" className="btn" disabled={busy} onClick={() => send("mint", { address: USDT_ADDRESS, abi: usdtAbi, functionName: "mint", args: [address, FAUCET_AMOUNT], chainId: CHAIN })}>
          {busy ? "Confirming" : "Mint 100 test USDT"}
        </button>
      ) : step === 2 ? (
        <button type="button" className="btn" disabled={busy} onClick={() => send("approve", { address: USDT_ADDRESS, abi: usdtAbi, functionName: "approve", args: [ENIGMA_ADDRESS, value], chainId: CHAIN })}>
          {busy ? "Confirming" : `Approve ${amount} USDT`}
        </button>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => send("deposit", { address: ENIGMA_ADDRESS, abi: enigmaAbi, functionName: "deposit", args: [value], chainId: CHAIN })}>
          {busy ? "Confirming" : `Deposit ${amount} USDT`}
        </button>
      )}
      {write.error && <p className="err" role="alert">{write.error.message.split("\n")[0]}</p>}
      {receipt.isError && <p className="err" role="alert">The transaction failed on-chain.</p>}
    </div>
  );
}
