// AI-assisted: Used Claude to write this file. Wallet setup follows the approach on feat/app-pages.
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { defineChain, parseAbi } from "viem";

const RPC = process.env.NEXT_PUBLIC_WHITECHAIN_RPC || "https://rpc.ankr.com/whitechain_testnet";

export const whitechainTestnet = defineChain({
  id: 1874,
  name: "Whitechain Testnet",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  testnet: true,
});

const addr = (value: string | undefined, fallback: string) => (value || fallback) as `0x${string}`;

// Defaults are the public addresses in contracts/deployments/whitechain.json.
export const ENIGMA_ADDRESS = addr(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS, "0xB4491c1eBE47447661B0e1266e19f3B2D32A226f");
export const USDT_ADDRESS = addr(process.env.NEXT_PUBLIC_USDT_ADDRESS, "0x377326408765f7CE5ab2757F0F0529B4c785cc47");
export const CHAIN_ID = whitechainTestnet.id;
export const USDT_DECIMALS = 6;

/** When true the service wallet pays for jobs and no wallet is needed. A demo mode: it must also be on in the server. */
export const SERVICE_PAID = process.env.NEXT_PUBLIC_SERVICE_PAID === "true";

export const enigmaAbi = parseAbi(["function deposit(uint256 amount)"]);

export const usdtAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  // MockUSDT on the testnet is open to everyone, which is how a new wallet gets test credit.
  "function mint(address to, uint256 amount)",
]);

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = connectorsForWallets(
  [{ groupName: "Wallets", wallets: projectId ? [injectedWallet, walletConnectWallet] : [injectedWallet] }],
  { appName: "Enigma", projectId: projectId || "not-configured" },
);

export const wagmiConfig = createConfig({
  chains: [whitechainTestnet],
  connectors,
  transports: { [whitechainTestnet.id]: http(RPC) },
  ssr: true,
});
