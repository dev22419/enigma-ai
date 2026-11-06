import { privateKeyFromEnv } from "./env";

// Check configuration before touching the chain, so a bad key cannot leave a
// locked payment behind.
export function configProblems(): string[] {
  const problems: string[] = [];
  for (const k of ["ORACLE_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"]) {
    try { privateKeyFromEnv(k); } catch (e) { problems.push(e instanceof Error ? e.message : String(e)); }
  }
  for (const k of ["CONTRACT_ADDRESS", "ZG_API_KEY"]) {
    if (!process.env[k]) problems.push(`${k} not configured`);
  }
  return problems;
}
