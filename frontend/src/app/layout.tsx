// AI-assisted: Used Claude to write this file.
import type { Metadata } from "next";

import { cinzel, plexMono, plexSans } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enigma: private AI for sensitive documents",
  description:
    "Run AI on medical, legal and financial documents inside a sealed enclave. The answer is destroyed on a timer you set, and a receipt on Whitechain proves it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${cinzel.variable}`}>
      <body className="min-h-dvh" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
