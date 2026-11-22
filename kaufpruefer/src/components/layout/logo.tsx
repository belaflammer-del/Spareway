import Link from "next/link";

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <path d="M9.5 16.5l4.2 4.2L22.5 11.8" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-background" />
      <circle cx="23.5" cy="23" r="2.2" className="fill-accent" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="DEAL-NIVO Startseite">
      <LogoMark />
      <span className="text-[17px] font-bold tracking-tight">DEAL<span className="text-accent">-NIVO</span></span>
    </Link>
  );
}
