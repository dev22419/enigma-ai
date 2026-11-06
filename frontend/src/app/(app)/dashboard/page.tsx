"use client";
// AI-assisted: Used Claude for the dashboard
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Countdown } from "@/components/countdown";
import { DepositFlow } from "@/components/deposit-flow";
import { KeyBadge } from "@/components/key-badge";
import { expiryOf, getBalance, getHistory, phaseOf, short, type BalanceView, type HistoryJob } from "@/lib/client/api";
import { SERVICE_WALLET } from "@/lib/client/chain";

const day = (unix: number) => new Date(unix * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function DashboardPage() {
  const { address } = useAccount();
  const [service, setService] = useState<BalanceView | null>(null);
  const [mine, setMine] = useState<BalanceView | null>(null);
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const addresses = address && address.toLowerCase() !== SERVICE_WALLET.toLowerCase() ? [SERVICE_WALLET, address] : [SERVICE_WALLET];
      const [serviceBalance, mineBalance, lists] = await Promise.all([
        getBalance(SERVICE_WALLET),
        address ? getBalance(address) : Promise.resolve(null),
        Promise.all(addresses.map(getHistory)),
      ]);
      setService(serviceBalance);
      setMine(mineBalance);
      setJobs(lists.flat().sort((a, b) => b.jobId - a.jobId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the dashboard");
    }
  }, [address]);

  useEffect(() => {
    const start = setTimeout(load, 0);
    const timer = setInterval(load, 15000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [load]);

  const active = (jobs ?? []).filter((j) => phaseOf(j) === "live");

  return (
    <main className="page">
      <header className="head">
        <h1>Dashboard</h1>
        <Link className="btn" href="/upload">New job</Link>
      </header>
      {error && <p className="err" role="alert">{error}</p>}

      <section className="stats" aria-label="Credit">
        <div>
          <b>{service ? service.queriesRemaining : "–"}</b>
          <span>Jobs left</span>
          <small>Service balance {service ? `${service.balance} USDT` : ""}</small>
        </div>
        <div>
          <b>{service ? service.queryPrice : "–"}</b>
          <span>USDT per job</span>
        </div>
        <div>
          <b>{mine ? mine.balance : "–"}</b>
          <span>Your deposited USDT</span>
          {/* Issue #18: the API creates jobs from the service wallet, so this balance is not spent yet. */}
          <small>{address ? "Not yet used by jobs" : "Connect a wallet"}</small>
        </div>
      </section>

      <div className="dash">
        <div>
          <h2>Active</h2>
          {active.length === 0 ? <p className="muted">No active jobs.</p> : (
            <ul className="active">
              {active.map((j) => (
                <li key={j.jobId}>
                  <Countdown expiresAt={expiryOf(j)!} totalSeconds={j.expirySeconds} size="sm" onExpire={load} />
                  <Link href={`/job/${j.jobId}`}>Job {j.jobId}</Link>
                </li>
              ))}
            </ul>
          )}

          <h2>History</h2>
          {jobs === null ? <p className="muted">Loading from Whitechain</p> : jobs.length === 0 ? <p className="muted">No jobs yet.</p> : (
            <table className="hist">
              <thead><tr><th>Job</th><th>Created</th><th>File hash</th><th>State</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.jobId}>
                    <td><Link href={`/job/${j.jobId}`}>{j.jobId}</Link></td>
                    <td>{day(j.createdAt)}</td>
                    <td><code>{short(j.fileHash)}</code></td>
                    <td><KeyBadge phase={phaseOf(j)} keyState={j.keyState} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside><DepositFlow onDeposited={load} /></aside>
      </div>
    </main>
  );
}
