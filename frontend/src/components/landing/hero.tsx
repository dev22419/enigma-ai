// AI-assisted: Used Claude to write this file.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FlutedGlass } from "./fluted-glass";
import { JobConsole } from "./job-console";

export function Hero() {
  return (
    <section id="hero" className="relative isolate overflow-hidden text-frost">
      <div className="aurora -z-10" aria-hidden="true" />
      <FlutedGlass className="-z-10" rib={58} exact />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 bg-[linear-gradient(180deg,rgb(2_7_10/0),var(--night))]" aria-hidden="true" />
      {/* Keeps the headline crisp over the brightest light */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_44%_26%_at_50%_36%,rgb(2_7_10/0.62),rgb(2_7_10/0)_78%)]"
        aria-hidden="true"
      />

      <div className="mx-auto flex max-w-[1280px] flex-col items-center px-4 pt-36 text-center sm:px-8 md:pt-44">
        <h1 className="display max-w-[15ch] text-[clamp(2.9rem,7.6vw,6.6rem)] text-balance">
          AI for documents that can&rsquo;t leak.
        </h1>
        <p className="mt-7 max-w-[40rem] text-[17px] leading-[1.6] text-balance text-frost sm:text-[18px]">
          Upload a medical record, a contract or a bank statement. 0G&rsquo;s model reads it inside a sealed
          enclave, your browser encrypts the answer with a key only it holds, and when your timer runs out the key
          is destroyed. Whitechain keeps a receipt that proves it.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/chat">Analyse a document</Link>
          </Button>
          <Button asChild size="lg" variant="outline-frost">
            <a href="#route">See how it works</a>
          </Button>
        </div>

        <div className="relative mt-20 w-full max-w-[880px] pb-20 text-left md:mt-24 md:pb-28">
          <JobConsole />
          <p className="mt-3 text-center font-mono text-[11px] text-frost/60">
            A sample job, replayed. Hover to pause, or click a stage.
          </p>
        </div>
      </div>
    </section>
  );
}
