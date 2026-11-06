// AI-assisted: Used Claude to write this file.
import { Archivo, JetBrains_Mono } from "next/font/google";

/** Variable width + weight, so display type can run expanded and labels condensed. */
export const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

export const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});
