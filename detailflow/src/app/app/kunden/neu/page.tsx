import { Card, PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/customer-form";

export const metadata = { title: "Neuer Kunde" };

export default async function NewCustomer({ searchParams }: { searchParams: Promise<{ einrichtung?: string }> }) {
  const { einrichtung } = await searchParams;
  return (
    <div className="max-w-2xl">
      <PageHeader title="Neuer Kunde" description={einrichtung ? "Schritt 6 der Einrichtung: Danach legst du direkt das Fahrzeug an." : undefined} />
      <Card className="p-6"><CustomerForm onboarding={Boolean(einrichtung)} /></Card>
    </div>
  );
}
