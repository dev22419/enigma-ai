// AI-assisted: Used Claude to write this file.
import { Geist, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

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

export const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});
