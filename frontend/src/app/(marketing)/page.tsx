// AI-assisted: Used Claude to write this file.
import { ApiSection } from "@/components/landing/api-section";
import { Certificate } from "@/components/landing/certificate";
import { Hero } from "@/components/landing/hero";
import { Route } from "@/components/landing/route";
import { SelfDestruct } from "@/components/landing/self-destruct";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { UseCases } from "@/components/landing/use-cases";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Route />
        <SelfDestruct />
        <Certificate />
        <UseCases />
        <ApiSection />
      </main>
      <SiteFooter />
    </>
  );
}
