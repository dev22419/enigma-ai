// AI-assisted: Used Claude to write this file.
import { ApiSection } from "@/components/landing/api-section";
import { Certificate } from "@/components/landing/certificate";
import { EyeLoader } from "@/components/landing/eye-loader";
import { Hero } from "@/components/landing/hero";
import { Route } from "@/components/landing/route";
import { SelfDestruct } from "@/components/landing/self-destruct";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";

export default function Home() {
  return (
    <>
      <EyeLoader />
      <SiteNav />
      <main className="bg-night">
        <Hero />
        <Route />
        <SelfDestruct />
        <Certificate />
        <ApiSection />
      </main>
      <SiteFooter />
    </>
  );
}
