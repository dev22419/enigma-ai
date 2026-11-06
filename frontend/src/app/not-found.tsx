// AI-assisted: Used Claude to write this file.
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found · Enigma" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-5 text-center text-frost">
      <div>
        <p className="font-mono text-[12.5px] text-frost-soft">404</p>
        <h1 className="display mt-3 text-[clamp(2rem,5vw,3.25rem)]">This page doesn&rsquo;t exist</h1>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild variant="outline-frost">
            <Link href="/chat">Open the app</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
