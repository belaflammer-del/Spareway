export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 15c3-6 6-9 9-9s6 3 9 9" />
          <path d="M7 15h10" />
        </svg>
      </span>
      DetailFlow
    </span>
  );
}
