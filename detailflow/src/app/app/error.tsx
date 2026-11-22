"use client";
import { Button } from "@/components/ui";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-xl font-semibold">Da ist etwas schiefgelaufen</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message.includes("Berechtigung") ? error.message : "Bitte versuche es erneut. Wenn das Problem bleibt, melde dich beim Support."}</p>
      {error.digest && <p className="mt-1 text-xs text-muted-foreground">Fehler-ID: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}
