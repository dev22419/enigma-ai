// AI-assisted: Used Claude to write this file.
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

type Stop = { name: string; does: string; reads: string; sealed?: boolean };

/** In job order, mirroring POST /api/jobs: who touches the document, and what they can read. */
const STOPS: Stop[] = [
  { name: "Your browser", does: "Encrypts the file and holds the only key", reads: "Everything" },
  { name: "Whitechain", does: "Locks the payment, then records the receipt", reads: "Hashes" },
  { name: "0G Storage", does: "Keeps the encrypted copy", reads: "Ciphertext" },
  { name: "0G Compute", does: "Runs the model inside a sealed enclave", reads: "The document, sealed", sealed: true },
  { name: "Arkiv", does: "Stores the encrypted answer until it expires", reads: "Ciphertext" },
];

export function Route() {
  return (
    <section id="route" className="section text-frost">
      <Reveal className="shell">
        <div className="text-center">
          <h2 className="heading">Where your document goes</h2>
          <p className="lede">Each system gets only what its part needs. Everything stored is encrypted.</p>
        </div>

        <div className="relative mt-20 md:mt-28">
          <div
            className="absolute top-2 bottom-2 left-[5px] w-px overflow-hidden bg-frost/15 md:top-[5px] md:right-[10%] md:bottom-auto md:left-[10%] md:h-px md:w-auto"
            aria-hidden="true"
          >
            <span className="route-pulse" />
          </div>

          <ol className="relative grid gap-10 md:grid-cols-5 md:gap-6">
            {STOPS.map((s) => (
              <li key={s.name} className="relative pl-8 md:pl-0 md:text-center">
                <span
                  className={cn(
                    "absolute top-0 left-0 block size-[11px] rounded-full md:relative md:mx-auto",
                    s.sealed ? "bg-volt-lit" : "bg-frost",
                  )}
                  aria-hidden="true"
                />
                <p className="text-[18px] leading-tight font-semibold md:mt-7">{s.name}</p>
                <p className="mt-2 text-[14.5px] leading-snug text-frost-soft md:mx-auto md:max-w-[12.5rem]">{s.does}</p>
                <p className={cn("mt-3 font-mono text-[11.5px]", s.sealed ? "text-volt-lit" : "text-frost/60")}>
                  can read: {s.reads}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>
    </section>
  );
}
