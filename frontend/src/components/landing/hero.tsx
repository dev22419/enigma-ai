// AI-assisted: Used Claude to write this file.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { JobConsole } from "./job-console";
import { LightWaves } from "./light-waves";

/** Where the ribbons are cut, as a fraction of the stage height from the bottom. The wordmark sits on it. */
const APEX = 0.76;

export function Hero() {
  return (
    <section id="hero" className="mono-theme relative isolate bg-black text-frost">
      {/* The stage: Enigma far off, light pouring toward you */}
      <div className="relative isolate h-svh min-h-[620px] overflow-hidden bg-black">
        <LightWaves apex={APEX} />

        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center"
          style={{ top: `${(1 - APEX) * 100 - 2.4}%` }}
        >
          <h1 className="enigma-title" data-title>
            {"Enigma".split("").map((ch, i) => (
              <span key={i} data-letter>
                {ch}
              </span>
            ))}
          </h1>
        </div>

        {/* Falls into the black of the page below */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-[linear-gradient(180deg,rgb(0_0_0/0),rgb(0_0_0/0.78)_58%,#000)]"
          aria-hidden="true"
        />

        <div className="enigma-rise absolute inset-x-0 bottom-0 mx-auto w-full max-w-[1280px] px-5 pb-7 sm:px-8 sm:pb-9">
          <div className="flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
            <p className="display max-w-[16ch] text-[clamp(2rem,4.2vw,3.5rem)] text-balance [text-shadow:0_2px_30px_rgb(0_0_0/0.9)]">
              AI for documents that can&rsquo;t leak.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/chat">Analyse a document</Link>
              </Button>
              <Button asChild size="lg" variant="outline-frost">
                <a href="#route">See how it works</a>
              </Button>
            </div>
          </div>
          <div className="mt-7 flex items-center justify-between border-t border-frost/15 pt-4 font-mono text-[11px] tracking-[0.12em] text-frost/55 uppercase">
            <span>0G enclave · Whitechain receipt · Arkiv</span>
            <span className="flex items-center gap-2.5">
              Scroll
              <i className="enigma-tick" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>

      {/* What it does, shown running */}
      <div className="relative bg-black">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center px-4 pb-20 text-center sm:px-8 md:pb-28">
          <p className="max-w-[40rem] text-[17px] leading-[1.6] text-balance text-frost sm:text-[18px]">
            Upload a medical record, a contract or a bank statement. 0G&rsquo;s model reads it inside a sealed
            enclave, your browser encrypts the answer with a key only it holds, and when your timer runs out the key
            is destroyed. Whitechain keeps a receipt that proves it.
          </p>
          <div className="relative mt-14 w-full max-w-[880px] text-left md:mt-16">
            <JobConsole />
            <p className="mt-3 text-center font-mono text-[11px] text-frost/60">
              A sample job, replayed. Hover to pause, or click a stage.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
