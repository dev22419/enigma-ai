// AI-assisted: Used Claude to write this file.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "./site-nav";

const REPO = "https://github.com/dev22419/enigma-ai";

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
      { label: "GitHub", href: REPO },
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
      <section className="section text-center text-frost">
        <div className="shell">
          <h2 className="heading">Try it with a sample record</h2>
          <p className="lede">The app comes with fictional medical, legal and financial documents, so you don&rsquo;t need real data to see it work.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/chat">Open the app</Link>
            </Button>
            <Button asChild size="lg" variant="outline-frost">
              <a href={REPO}>Read the code</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="mono-theme bg-black text-frost">
        <div className="shell">
          <div className="grid gap-10 border-t border-frost/12 py-14 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div className="sm:col-span-3 lg:col-span-1">
              <Link href="/" aria-label="Enigma home" className="inline-block">
                <Logo />
              </Link>
              <p className="mt-4 max-w-[19rem] text-[14.5px] leading-relaxed text-frost-soft">Private AI for sensitive documents. The answer is destroyed on a timer you set.</p>
            </div>

            {COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h3 className="text-[13px] text-frost-soft">{column.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-[14.5px] text-frost/85 transition-colors hover:text-white">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-frost/12 py-6 text-[13px] text-frost-soft">
            <p>Built at ETHGlobal Mumbai 2026. Testnets only.</p>
            <a href="#hero" className="transition-colors hover:text-frost">
              Back to top
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
