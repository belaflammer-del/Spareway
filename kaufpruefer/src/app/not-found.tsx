import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-28 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Seite nicht gefunden</h1>
      <p className="mt-2 text-muted">Die Seite existiert nicht oder wurde gelöscht.</p>
      <Button asChild className="mt-6"><Link href="/">Zur Startseite</Link></Button>
    </div>
  );
}
