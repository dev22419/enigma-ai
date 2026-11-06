import { ethers } from "ethers";
import { privateKeyFromEnv } from "./env";

// Check configuration before touching the chain, so a bad key cannot leave a
// locked payment behind.
export function configProblems(): string[] {
  const problems: string[] = [];
  for (const k of ["ORACLE_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"]) {
    try { privateKeyFromEnv(k); } catch (e) { problems.push(e instanceof Error ? e.message : String(e)); }
  }
  if (!process.env.ZG_API_KEY) problems.push("ZG_API_KEY not configured");
  if (!ethers.isAddress(process.env.CONTRACT_ADDRESS ?? "")) {
    problems.push("CONTRACT_ADDRESS is not a deployed contract address");
  }
  return problems;
}
