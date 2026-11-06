// AI-assisted: Used Claude to write this file. HalftoneWordmarkFooter is from 21st.dev.
"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import HalftoneWordmarkFooter from "@/components/ui/halftone-wordmark-footer";
import { archivo, jetbrains } from "@/lib/fonts";
import { FlutedGlass } from "./fluted-glass";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#route" },
      { label: "Lifespan", href: "/#lifespan" },
      { label: "Receipts", href: "/#certificate" },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "API", href: "/#api" },
      { label: "GitHub", href: "https://github.com/dev22419/enigma-ai" },
      { label: "Open the app", href: "/chat" },
    ],
  },
  {
    title: "Runs on",
    links: [
      { label: "0G Compute and Storage", href: "https://0g.ai" },
      { label: "Arkiv", href: "https://arkiv.network" },
      { label: "Whitechain", href: "https://whitechain.io" },
    ],
  },
];

export function SiteFooter() {
  return (
    <>
      <section className="relative isolate overflow-hidden text-frost">
        <div className="aurora -z-10" aria-hidden="true" />
        <FlutedGlass className="-z-10" rib={40} />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_55%_at_50%_45%,rgb(2_7_10/0.8),rgb(2_7_10/0.2)_70%,rgb(2_7_10/0)_90%)]" aria-hidden="true" />
        <div className="mx-auto flex max-w-[1280px] flex-col items-center px-4 pt-28 pb-24 text-center sm:px-8 md:pt-36">
          <h2 className="display max-w-[16ch] text-[clamp(2.4rem,6vw,5.2rem)] text-balance">Try it with a sample record</h2>
          <p className="mt-5 max-w-[32rem] text-[17px] text-frost/80">
            The app comes with fictional medical, legal and financial documents, so you don&rsquo;t need real data to see it work.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/chat">Open the app</Link>
            </Button>
            <Button asChild size="lg" variant="outline-frost">
              <a href="https://github.com/dev22419/enigma-ai">Read the code</a>
            </Button>
          </div>
        </div>
      </section>
      <HalftoneWordmarkFooter
        wordmark="enigma"
        label="Enigma"
        meta="Built at ETHGlobal Mumbai 2026. Testnets only."
        columns={COLUMNS}
        palette={{ background: "#02070a", ink: "#cfe4f2", warm: "#fc734d" }}
        fontFamily={archivo.style.fontFamily}
        fontWeight={900}
        monoFamily={jetbrains.style.fontFamily}
        crop={0.22}
        height="clamp(420px, 46vw, 620px)"
      />
    </>
  );
}
