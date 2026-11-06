"use client";
// AI-assisted: Used Claude for the countdown timer
import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatLeft(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${pad(h)}h`;
  return h ? `${pad(h)}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Green above half the time, amber above a fifth, then red. */
export function countdownTone(fraction: number) {
  return fraction > 0.5 ? "green" : fraction > 0.2 ? "amber" : "red";
}

interface Props {
  expiresAt: number; // unix seconds
  totalSeconds: number;
  size?: "lg" | "sm";
  onExpire?: () => void;
}

export function Countdown({ expiresAt, totalSeconds, size = "lg", onExpire }: Props) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const remaining = expiresAt - Date.now() / 1000;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0 && !fired) { fired = true; onExpire?.(); }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const fraction = left === null ? 1 : Math.min(1, left / Math.max(1, totalSeconds));
  const r = size === "lg" ? 86 : 15, box = (r + 7) * 2, c = 2 * Math.PI * r;

  return (
    <div className={`count count-${size}`} data-tone={countdownTone(fraction)} role="timer">
      <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} aria-hidden="true">
        <circle className="count-track" cx={box / 2} cy={box / 2} r={r} />
        <circle className="count-arc" cx={box / 2} cy={box / 2} r={r} strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} transform={`rotate(-90 ${box / 2} ${box / 2})`} />
      </svg>
      <span>{left === null ? "--:--" : formatLeft(left)}</span>
    </div>
  );
}
