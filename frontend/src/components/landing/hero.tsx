// AI-assisted: Used Claude to write this file.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FlutedGlass } from "./fluted-glass";
import { JobConsole } from "./job-console";

export function Hero() {
  return (
    <section id="hero" className="relative isolate flex min-h-svh items-center overflow-hidden text-frost">
      <div className="aurora -z-10" aria-hidden="true" />
      <FlutedGlass className="-z-10" rib={72} />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(2_7_10/0.92)_0%,rgb(2_7_10/0.7)_42%,rgb(2_7_10/0)_78%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-[linear-gradient(180deg,rgb(2_7_10/0),var(--night))]" aria-hidden="true" />

      <div className="shell grid w-full items-center gap-12 pt-28 pb-16 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:gap-14">
        <div>
          <h1 className="display text-[clamp(2.6rem,5vw,4.5rem)] text-balance">AI that forgets by design.</h1>
          <p className="mt-5 max-w-[30rem] text-[18px] leading-[1.5] text-frost/75">
            Read in a sealed enclave. Encrypted with a key only your browser holds. Gone when your timer ends.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/chat">Analyse a document</Link>
            </Button>
            <Button asChild size="lg" variant="outline-frost">
              <a href="#route">See how it works</a>
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <JobConsole />
          <p className="mt-3 font-mono text-[11.5px] text-frost/55">A sample job, replayed.</p>
        </div>
      </div>
    </section>
  );
}
