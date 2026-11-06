// AI-assisted: Used Claude for the shared fonts and metadata
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({ src: "./fonts/sans.woff2", weight: "400 700", variable: "--font-sans" });
const mono = localFont({ src: "./fonts/mono.woff2", weight: "400", variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Enigma AI",
  description: "AI that forgets you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
