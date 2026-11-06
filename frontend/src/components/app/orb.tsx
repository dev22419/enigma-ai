// AI-assisted: Used Claude to design and write this file.
"use client";

import { FlutedGlass } from "@/components/landing/fluted-glass";
import { cn } from "@/lib/utils";

/**
 * The enclave orb: the landing page's fluted glass, seen through a sphere.
 * A turning halo of blue and cantaloupe sits behind it, a glass highlight on top.
 */
export function EnclaveOrb({ className, live = true }: { className?: string; live?: boolean }) {
  return (
    <div className={cn("relative isolate size-44", className)} aria-hidden="true">
      {/* Halo */}
      <div className="spin-slow absolute -inset-6 -z-10 rounded-full bg-[conic-gradient(from_0deg,rgb(2_151_222/0.0),rgb(2_151_222/0.55),rgb(252_115_77/0.0),rgb(252_115_77/0.6),rgb(2_151_222/0.0))] opacity-70 blur-2xl" />
      <div className="absolute -inset-1 -z-10 rounded-full bg-[radial-gradient(circle,rgb(2_151_222/0.35),transparent_70%)] blur-md" />
      {/* Sphere */}
      <div className="relative size-full overflow-hidden rounded-full bg-night shadow-[0_0_0_1px_rgb(234_243_249/0.12),0_30px_80px_-20px_rgb(2_151_222/0.6)]">
        {live ? <FlutedGlass rib={12} focus={0} /> : <div className="aurora" />}
        {/* Curvature: dark rim, bright upper-left glint */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,transparent_45%,rgb(2_7_10/0.75)_100%)]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_24%,rgb(255_255_255/0.45),rgb(255_255_255/0)_28%)]" />
        <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_6px_rgb(255_255_255/0.25),inset_0_-10px_30px_rgb(2_7_10/0.7)]" />
      </div>
    </div>
  );
}

/** A small static orb for message avatars (no WebGL per message). */
export function OrbMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative size-8 shrink-0 overflow-hidden rounded-full bg-[conic-gradient(from_200deg_at_50%_50%,#0297de,#5cc4ff,#02070a,#fc734d,#0297de)] shadow-[0_0_0_1px_rgb(234_243_249/0.15),0_6px_20px_-6px_rgb(2_151_222/0.7)]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-[3px] rounded-full bg-[repeating-linear-gradient(90deg,rgb(2_7_10/0.35)_0_2px,transparent_2px_4px)]" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.6),transparent_35%)]" />
    </div>
  );
}
