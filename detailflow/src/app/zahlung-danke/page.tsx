import { CheckCircle2 } from "lucide-react";
export const metadata = { title: "Zahlung", robots: { index: false } };
export default async function Thanks({ searchParams }: { searchParams: Promise<{ abgebrochen?: string }> }) {
  const { abgebrochen } = await searchParams;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      {!abgebrochen && <CheckCircle2 className="size-12 text-accent" />}
      <h1 className="text-xl font-semibold">{abgebrochen ? "Zahlung abgebrochen" : "Vielen Dank für Ihre Zahlung!"}</h1>
      <p className="text-sm text-muted-foreground">{abgebrochen ? "Es wurde nichts belastet." : "Sie können dieses Fenster jetzt schließen."}</p>
    </div>
  );
}
