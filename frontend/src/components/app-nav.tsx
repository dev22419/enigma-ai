"use client";
// AI-assisted: Used Claude for the app navigation and wallet button
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const LINKS = [
  { href: "/upload", label: "New job" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/demo", label: "Demo" },
];

export function AppNav() {
  const path = usePathname();
  return (
    <header className="nav">
      {/* A plain link: / is the static landing page, not a client route. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="nav-mark" href="/">Enigma</a>
      <nav aria-label="App">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <ConnectButton.Custom>
        {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
          if (!mounted) return <span className="nav-wallet" aria-hidden="true" />;
          if (!account) return <button type="button" className="btn btn-sm" onClick={openConnectModal}>Connect wallet</button>;
          if (chain?.unsupported) return <button type="button" className="btn btn-sm btn-warn" onClick={openChainModal}>Wrong network</button>;
          return <button type="button" className="btn btn-sm btn-ghost" onClick={openAccountModal}>{account.displayName}</button>;
        }}
      </ConnectButton.Custom>
    </header>
  );
}
