// AI-assisted: Used Claude to write this file.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#route", label: "How it works" },
  { href: "#lifespan", label: "Lifespan" },
  { href: "#certificate", label: "Receipts" },
  { href: "#api", label: "API" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* A rotor: three offset rings, after the cipher machine the name comes from */}
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
        <circle cx="11" cy="11" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.8" />
        <circle cx="11" cy="11" r="2" fill="var(--melon)" />
      </svg>
      <span className="display text-[19px] tracking-[-0.03em]">enigma</span>
    </span>
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 text-frost transition-[background-color,border-color] duration-300",
        scrolled ? "border-b border-night-line bg-night/80 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1280px] items-center gap-10 px-4 sm:px-8">
        <Link href="/" aria-label="Enigma home">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-7 text-[14.5px] font-medium md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-frost-soft transition-colors hover:text-frost">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-3">
          <a href="https://github.com/dev22419/enigma-ai" className="hidden text-[14.5px] font-medium text-frost-soft hover:text-frost sm:block">
            GitHub
          </a>
          <Button asChild size="sm">
            <Link href="/chat">Open the app</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
