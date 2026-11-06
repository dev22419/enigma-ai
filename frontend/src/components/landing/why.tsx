// AI-assisted: Used Claude to write this file.
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { LiveCanvas, noise, type Paint } from "./live-canvas";
import { Reveal } from "./reveal";

const FROST = "238,238,238";
const PETAL = "242,200,248";
const ORCHID = "229,156,244";

/** A readable page turning into noise as the encryption sweep passes over it. */
const encrypt: Paint = (ctx, w, h, t) => {
  const gap = 8;
  const cols = Math.floor(w / gap);
  const rows = Math.floor(h / gap);
  const sweep = ((t * 0.22) % 1.35) * cols;
  for (let y = 0; y < rows; y++) {
    const len = cols * (0.45 + noise(1, y) * 0.5);
    for (let x = 0; x < cols; x++) {
      const crypt = x < sweep;
      const n = noise(x, y);
      const on = crypt ? 0.12 + 0.75 * Math.max(0, Math.sin(t * 2 + n * 40)) * n : y % 2 === 0 && x < len && n > 0.14 ? 0.8 : 0.05;
      ctx.fillStyle = `rgba(${crypt ? PETAL : FROST},${on})`;
      ctx.fillRect(x * gap + 1, y * gap + 1, 3.5, 3.5);
    }
    if (sweep < cols) {
      ctx.fillStyle = `rgba(${ORCHID},0.85)`;
      ctx.fillRect(sweep * gap, y * gap + 1, 3.5, 3.5);
    }
  }
};

/** A column of dots draining away as the timer runs out, on a loop. */
const countdown: Paint = (ctx, w, h, t) => {
  const gap = 9;
  const cols = Math.floor(w / gap);
  const rows = Math.floor(h / gap);
  const left = 1 - ((t * 0.13) % 1);
  for (let x = 0; x < cols; x++) {
    const peak = (0.35 + 0.65 * noise(x, 3)) * left * rows;
    for (let y = 0; y < rows; y++) {
      const lit = rows - y < peak;
      ctx.fillStyle = lit ? `rgba(${left < 0.3 ? ORCHID : PETAL},${0.35 + (0.6 * (rows - y)) / rows})` : `rgba(${FROST},0.06)`;
      ctx.beginPath();
      ctx.arc(x * gap + 4, y * gap + 4, 2, 0, 6.3);
      ctx.fill();
    }
  }
};

/** Data passing straight through the server, which holds on to nothing. */
const passThrough: Paint = (ctx, w, h, t) => {
  const mid = w / 2;
  ctx.strokeStyle = `rgba(${FROST},0.25)`;
  ctx.strokeRect(mid - 34, h * 0.14, 68, h * 0.72);
  for (let i = 0; i < 46; i++) {
    const p = (t * (0.1 + noise(i, 1) * 0.1) + noise(i, 2)) % 1;
    const x = p * w;
    const y = h * (0.26 + noise(i, 3) * 0.48);
    const inside = Math.abs(x - mid) < 34;
    ctx.fillStyle = `rgba(${inside ? ORCHID : PETAL},${inside ? 1 : 0.75})`;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, 6.3);
    ctx.fill();
  }
};

function Enclave() {
  const layer = (y: number) => `130,${y - 44} 224,${y} 130,${y + 44} 36,${y}`;
  return (
    <svg viewBox="0 0 260 200" className="size-full" aria-hidden="true">
      <g className="float-up">
        <polygon points={layer(58)} fill="rgb(20 20 20)" stroke="rgb(238 238 238 / 0.32)" />
      </g>
      <polygon points={layer(100)} fill="rgb(229 156 244)" className="chip-glow" />
      <polygon points={layer(100)} fill="none" stroke="rgb(242 200 248)" />
      <g className="float-down">
        <polygon points={layer(142)} fill="rgb(20 20 20)" stroke="rgb(238 238 238 / 0.32)" />
      </g>
    </svg>
  );
}

function KeyOrbit() {
  return (
    <svg viewBox="0 0 260 200" className="size-full" aria-hidden="true">
      {[84, 58].map((r, i) => (
        <circle key={r} cx="130" cy="100" r={r} fill="none" stroke="rgb(238 238 238 / 0.14)" strokeDasharray={i ? "3 6" : undefined} />
      ))}
      <g className="orbit">
        <circle cx="214" cy="100" r="4" fill="rgb(238 238 238 / 0.4)" />
        <circle cx="46" cy="100" r="4" fill="rgb(238 238 238 / 0.4)" />
      </g>
      <g className="orbit-back">
        <circle cx="130" cy="42" r="3.5" fill="rgb(242 200 248)" />
      </g>
      <circle cx="130" cy="100" r="24" fill="rgb(229 156 244 / 0.16)" className="key-pulse" />
      <circle cx="123" cy="100" r="7" fill="none" stroke="rgb(229 156 244)" strokeWidth="2.5" />
      <path d="M130 100h18M142 100v6M148 100v6" fill="none" stroke="rgb(229 156 244)" strokeWidth="2.5" />
    </svg>
  );
}

function Chain() {
  return (
    <svg viewBox="0 0 260 200" className="size-full" aria-hidden="true">
      <line x1="16" y1="100" x2="244" y2="100" stroke="rgb(238 238 238 / 0.16)" />
      <line x1="16" y1="100" x2="244" y2="100" stroke="rgb(242 200 248)" strokeWidth="1.5" className="chain-run" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className="chain-block" style={{ animationDelay: `${i * 0.5}s` }}>
          <rect x={22 + i * 58} y="76" width="48" height="48" rx="6" fill="rgb(14 14 14)" stroke="rgb(242 200 248 / 0.65)" />
          <path d={`M${36 + i * 58} 94h20M${36 + i * 58} 103h14`} stroke="rgb(238 238 238 / 0.55)" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

const CARDS: { title: string; text: string; art: ReactNode; wide?: boolean; full?: boolean }[] = [
  {
    title: "Encrypted before it leaves",
    text: "AES-256-GCM runs in your browser, so the file is unreadable before any network request.",
    art: <LiveCanvas paint={encrypt} />,
    wide: true,
  },
  {
    title: "Read in a sealed enclave",
    text: "The model runs in 0G's TEE, away from the operator.",
    art: <Enclave />,
  },
  {
    title: "Only you hold the key",
    text: "The key is made in your browser and never reaches our server.",
    art: <KeyOrbit />,
  },
  {
    title: "Gone on your timer",
    text: "Pick one minute to 30 days. At zero, the answer becomes unreadable.",
    art: <LiveCanvas paint={countdown} />,
  },
  {
    title: "Nothing readable stays",
    text: "The document passes through our proxy in transit, and is never stored or logged.",
    art: <LiveCanvas paint={passThrough} />,
  },
  {
    title: "Proof on-chain",
    text: "Whitechain keeps hashes and a receipt, never the content.",
    art: <Chain />,
    full: true,
  },
];

export function Why() {
  return (
    <section id="why" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <p className="eyebrow">01 Why Enigma</p>
          <h2 className="heading">Sensitive files need more than a promise</h2>
          <p className="lede">Most AI tools ask you to trust them with what you upload. Enigma is built so it can&rsquo;t read or keep yours.</p>
        </div>

        <div className="mt-14 grid gap-3 md:mt-20 md:grid-cols-3">
          {CARDS.map((c) => (
            <article key={c.title} className={cn("panel flex flex-col overflow-hidden", c.wide && "md:col-span-2", c.full && "md:col-span-3")}>
              <div className="h-[190px] overflow-hidden">{c.art}</div>
              <div className="p-6 pt-5">
                <h3 className="text-[18px] font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-snug text-frost-soft">{c.text}</p>
              </div>
            </article>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
