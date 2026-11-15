import { PageHeader } from "@/components/ui";
import { Calculator } from "@/components/calculator";
import { config, customers, packages, services, tax, vehicles } from "../demo";

export default function PreviewCalc() {
  return (
    <>
      <PageHeader title="Neues Angebot" description="Wähle Fahrzeug und Leistungen – der Preis wird live nach deinen Preisregeln berechnet." />
      <Calculator customers={customers} vehicles={vehicles} services={services} packages={packages} config={config} tax={tax} canEditPrices defaults={{ customerId: "c2", vehicleId: "v2" }} />
    </>
  );
}
