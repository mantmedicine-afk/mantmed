import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function LegalPlaceholder({ title }) {
  return (
    <div className="min-h-screen theme-page bg-[var(--bg)]" data-testid="legal-page">
      <div className="mx-auto max-w-3xl px-5 py-16 lg:py-24">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--fg2)] hover:text-[var(--ink)]" data-testid="legal-back-link"><ArrowLeft size={15} /> Torna alla home</Link>
        <h1 className="mt-8 font-display text-4xl text-[var(--ink)] sm:text-5xl" data-testid="legal-title">{title}</h1>
        <p className="mt-6 text-base text-[var(--fg2)]" data-testid="legal-body">In aggiornamento.</p>
      </div>
    </div>
  );
}
