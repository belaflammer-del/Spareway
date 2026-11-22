import Link from "next/link";

/** Logo: Wasserwaage mit Libelle – die Blase steht mittig = „fairer Deal“. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#f0dc1c" />
      {/* Wasserwaagen-Körper */}
      <rect x="3.5" y="12" width="25" height="8" rx="2.5" fill="#121211" />
      {/* Libelle mit mittiger Blase */}
      <rect x="10" y="13.6" width="12" height="4.8" rx="2.4" fill="#f0dc1c" />
      <ellipse cx="16" cy="16" rx="2.6" ry="1.6" fill="#fffbe0" />
      <path d="M13.2 13.6v4.8M18.8 13.6v4.8" stroke="#121211" strokeWidth="0.9" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="DEAL-NIVO Startseite">
      <LogoMark />
      <span className="text-[17px] font-extrabold tracking-tight">
        DEAL<span className="text-accent">-NIVO</span>
      </span>
    </Link>
  );
}
