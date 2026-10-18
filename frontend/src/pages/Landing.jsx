import { useState } from "react";
import { Link } from "react-router-dom";
import { LogoMark } from "@/components/dash/Logo";
import { LandingHeader, LandingHero, RegisterBand, scrollTo } from "@/components/landing/Hero";
import { LandingFeatures, LandingSecurity } from "@/components/landing/Sections";
import { LandingContact } from "@/components/landing/Contact";

export default function Landing() {
  const [kind, setKind] = useState("beta");
  const beta = () => { setKind("beta"); scrollTo("contatti"); };
  return (
    <div className="min-h-screen overflow-x-clip bg-[#0A192F]" data-testid="landing-page">
      <LandingHeader />
      <main>
        <LandingHero onBeta={beta} />
        <RegisterBand />
        <LandingFeatures />
        <LandingSecurity />
        <LandingContact kind={kind} setKind={setKind} />
      </main>
      <footer className="border-t border-[#C9CCD3]/15" data-testid="landing-footer">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 py-10 text-sm text-[#C9CCD3] sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <div className="flex items-center gap-3"><LogoMark size={28} light /><span>© {new Date().getFullYear()} MantMed · Workspace clinico per lo specialista</span></div>
          <Link to="/app" className="text-white underline-offset-4 hover:underline" data-testid="footer-login-link">Area riservata medici</Link>
        </div>
      </footer>
    </div>
  );
}
