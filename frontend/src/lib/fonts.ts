// AI-assisted: Used Claude to write this file.
import { IBM_Plex_Mono, IBM_Plex_Sans, Cinzel } from "next/font/google";

export const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Roman capitals for the hero wordmark only
export const cinzel = Cinzel({
  variable: "--font-title",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});
