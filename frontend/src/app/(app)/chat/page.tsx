// AI-assisted: Used Claude to write this file.
import { Suspense } from "react";

import { Chat } from "@/components/app/chat";
import { loadSamples } from "../samples";

export const metadata = { title: "Chat · Enigma" };

export default async function ChatPage() {
  const samples = await loadSamples();
  return (
    <Suspense fallback={<p className="p-12 font-mono text-[12px] text-frost-soft">Opening chat…</p>}>
      <Chat samples={samples} />
    </Suspense>
  );
}
