import { Link } from "react-router-dom";
import { LogoMark } from "@/components/dash/Logo";
import { LandingHeader, LandingHero, scrollTo } from "@/components/landing/Hero";
import { LandingHowItWorks, LandingSecurity } from "@/components/landing/Sections";
import { LandingContact } from "@/components/landing/Contact";
import { LandingFunctions } from "@/components/landing/Functions";

export default function Landing() {
  const beta = () => scrollTo("contatti");
  return (
    <div className="min-h-screen overflow-x-clip theme-page bg-[var(--bg)]" data-testid="landing-page">
      <LandingHeader />
      <main>
        <LandingHero onBeta={beta} />
        <LandingHowItWorks />
        <LandingFunctions />
        <LandingSecurity />
        <LandingContact />
      </main>
      <footer className="border-t border-[var(--hair)]" data-testid="landing-footer">
        <div className="mx-auto max-w-[1280px] space-y-4 px-5 py-10 text-sm text-[var(--fg2)] lg:px-10">
          <div className="flex items-center gap-3"><LogoMark size={28} light /><span data-testid="footer-copyright">© 2026 MantMed S.r.l.s. (in costituzione) · Milano</span></div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Link legali">
            <Link to="/privacy-policy" className="underline-offset-4 hover:text-[var(--ink)] hover:underline" data-testid="footer-privacy-policy-link">Privacy policy</Link>
            <Link to="/cookie-policy" className="underline-offset-4 hover:text-[var(--ink)] hover:underline" data-testid="footer-cookie-link">Cookie policy</Link>
            <Link to="/privacy" className="underline-offset-4 hover:text-[var(--ink)] hover:underline" data-testid="footer-privacy-link">Privacy e AI</Link>
            <Link to="/app" className="text-[var(--ink)] underline-offset-4 hover:underline" data-testid="footer-login-link">Area riservata medici</Link>
          </nav>
          <a href="mailto:mantmedicine@gmail.com" className="inline-block underline-offset-4 hover:text-[var(--ink)] hover:underline" data-testid="footer-email">mantmedicine@gmail.com</a>
        </div>
      </footer>
    </div>
  );
}
