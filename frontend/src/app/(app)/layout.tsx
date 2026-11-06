// AI-assisted: Used Claude for the app shell
import { Suspense, type ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { Providers } from "@/components/providers";
import "./app.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <Suspense fallback={<div className="nav-gap" />}><AppNav /></Suspense>
      <Suspense>{children}</Suspense>
    </Providers>
  );
}
