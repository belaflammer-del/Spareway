"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-28 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Etwas ist schiefgelaufen</h1>
      <p className="mt-2 text-muted">Bitte versuche es erneut. Falls eine Analyse betroffen war, wurde kein Token verbraucht.</p>
      <Button className="mt-6" onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}
