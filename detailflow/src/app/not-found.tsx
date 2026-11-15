import Link from "next/link";
import { buttonClass } from "@/components/ui";
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Diese Seite gibt es nicht – oder du hast keinen Zugriff.</h1>
      <Link href="/app" className={buttonClass("secondary")}>Zur Übersicht</Link>
    </div>
  );
}
