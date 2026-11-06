// AI-assisted: Used Claude for the wallet and chain configuration
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { defineChain, parseAbi } from "viem";

const RPC = "https://rpc.ankr.com/whitechain_testnet";

export const whitechainTestnet = defineChain({
  id: 1874,
  name: "Whitechain Testnet",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  testnet: true,
});

const env = (value: string | undefined, fallback: string) => (value || fallback) as `0x${string}`;

// Defaults are the public addresses from contracts/deployments/whitechain.json.
export const ENIGMA_ADDRESS = env(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS, "0x1CbD8308c5b76Ab724CE4143Fdc67811D44dFd5f");
export const USDT_ADDRESS = env(process.env.NEXT_PUBLIC_USDT_ADDRESS, "0x7103Cd54837A2E086A2e131617d5D249cc9B7044");
// The backend creates jobs from this wallet, so its balance is the one jobs spend.
export const SERVICE_WALLET = env(process.env.NEXT_PUBLIC_SERVICE_WALLET, "0x91EE9440981f3775ae734b023ecD034fd7274A99");

export const USDT_DECIMALS = 6;

export const enigmaAbi = parseAbi([
  "function balances(address) view returns (uint256)",
  "function deposit(uint256 amount)",
]);

export const usdtAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = connectorsForWallets(
  [{ groupName: "Wallets", wallets: projectId ? [injectedWallet, walletConnectWallet] : [injectedWallet] }],
  { appName: "Enigma AI", projectId: projectId || "not-configured" }
);

export const wagmiConfig = createConfig({
  chains: [whitechainTestnet],
  connectors,
  transports: { [whitechainTestnet.id]: http(RPC) },
  ssr: true,
});
