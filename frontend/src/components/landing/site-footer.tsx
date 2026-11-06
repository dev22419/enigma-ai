// AI-assisted: Used Claude to write this file. HalftoneWordmarkFooter is from 21st.dev.
"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import HalftoneWordmarkFooter from "@/components/ui/halftone-wordmark-footer";
import { plexMono, plexSans } from "@/lib/fonts";

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
      <section className="section bg-night text-frost">
        <div className="shell flex flex-wrap items-end justify-between gap-8">
          <div>
            <h2 className="heading max-w-[18ch]">Try it with a sample record</h2>
            <p className="mt-3 text-[17px] text-frost-soft">Fictional documents are built in.</p>
          </div>
          <div className="flex flex-wrap gap-3">
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
        fontFamily={plexSans.style.fontFamily}
        fontWeight={600}
        monoFamily={plexMono.style.fontFamily}
        crop={0.52}
        height="clamp(320px, 30vw, 420px)"
      />
    </>
  );
}
