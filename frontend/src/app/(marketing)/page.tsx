// AI-assisted: Used Claude to write this file.
import { ApiSection } from "@/components/landing/api-section";
import { Certificate } from "@/components/landing/certificate";
import { Hero } from "@/components/landing/hero";
import { Route } from "@/components/landing/route";
import { Seam } from "@/components/landing/seam";
import { SelfDestruct } from "@/components/landing/self-destruct";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { UseCases } from "@/components/landing/use-cases";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="relative isolate overflow-hidden bg-night">
        <Hero />
        {/* One continuous night below the hero: light pools alternate blue and cantaloupe down the page */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
            <div className="absolute top-[4%] left-[-10%] h-[700px] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgb(2_151_222/0.16),transparent)]" />
            <div className="absolute top-[24%] right-[-12%] h-[700px] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgb(252_115_77/0.12),transparent)]" />
            <div className="absolute top-[46%] left-[-8%] h-[800px] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgb(2_151_222/0.14),transparent)]" />
            <div className="absolute top-[70%] right-[-10%] h-[700px] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgb(252_115_77/0.1),transparent)]" />
            <div className="absolute inset-0 bg-[radial-gradient(rgb(234_243_249/0.035)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(180deg,transparent,#000_10%,#000_90%,transparent)]" />
          </div>
          <Seam />
          <Route />
          <Seam />
          <SelfDestruct />
          <Seam tone="melon" />
          <Certificate />
          <Seam />
          <UseCases />
          <Seam />
          <ApiSection />
          <Seam tone="melon" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
