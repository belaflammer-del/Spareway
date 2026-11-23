import Link from "next/link";

/** Logo: Lupe mit Haken – „geprüft“. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#f0dc1c" />
      <circle cx="14" cy="14" r="7.6" fill="none" stroke="#121211" strokeWidth="3" />
      <path d="M19.6 19.6 25 25" stroke="#121211" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M10.6 14.2l2.5 2.5 4.6-5" fill="none" stroke="#121211" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
