// NUR lokale Vorschau – Beispieldaten ohne Datenbank (nicht committen)
import { DEFAULT_PRICING_CONFIG } from "@/lib/domain";
import type { PricedPackage, PricedService } from "@/lib/pricing";

const s = (id: string, name: string, category: string, base_price: number, duration_minutes: number, extra: Partial<PricedService> = {}) =>
  ({ id, name, category, base_price, duration_minutes, pricing_type: "fixed" as const, material_cost: Math.round(duration_minutes * 0.08 * 100) / 100, min_price: null, size_surcharges: {}, applies_vehicle_class: true, applies_soiling: true, tax_rate: null, ...extra });

export const services = [
  s("s1", "Handwäsche", "Außenreinigung", 39, 45), s("s2", "Schaumwäsche / Snow Foam", "Außenreinigung", 20, 20), s("s3", "Felgentiefenreinigung", "Außenreinigung", 59, 60),
  s("s4", "Insektenentfernung", "Außenreinigung", 20, 20), s("s5", "Flugrostentfernung", "Außenreinigung", 45, 45), s("s6", "Motorraumreinigung", "Außenreinigung", 49, 45),
  s("s7", "Innenraum saugen", "Innenraumaufbereitung", 29, 30), s("s8", "Sprühextraktion", "Innenraumaufbereitung", 89, 90), s("s9", "Tierhaarentfernung", "Innenraumaufbereitung", 49, 45),
  s("s10", "Kunststoffpflege innen", "Innenraumaufbereitung", 20, 20), s("s11", "Ozonbehandlung", "Innenraumaufbereitung", 69, 60), s("s12", "Lederreinigung", "Lederpflege und Lederaufbereitung", 59, 45),
  s("s13", "Lederpflege", "Lederpflege und Lederaufbereitung", 39, 30), s("s14", "Lackdickenmessung", "Lackaufbereitung", 29, 20, { applies_soiling: false, applies_vehicle_class: false }),
  s("s15", "Reinigungsknete", "Lackaufbereitung", 45, 45), s("s16", "Einstufige Politur", "Lackaufbereitung", 249, 240), s("s17", "Zweistufige Politur", "Lackaufbereitung", 449, 420),
  s("s18", "Scheinwerferaufbereitung", "Lackaufbereitung", 79, 60, { applies_vehicle_class: false }), s("s19", "Polymer-Versiegelung", "Versiegelungen und Schutz", 89, 60),
  s("s20", "Keramikversiegelung", "Versiegelungen und Schutz", 399, 240), s("s21", "Mehrschicht-Keramikversiegelung", "Versiegelungen und Schutz", 799, 420),
  s("s22", "Felgenversiegelung", "Versiegelungen und Schutz", 79, 60), s("s23", "Verkaufsaufbereitung", "Spezialleistungen", 299, 300), s("s24", "Leasingrückgabe-Aufbereitung", "Spezialleistungen", 279, 300),
];

export const packages: PricedPackage[] = [
  { id: "p1", name: "Basic Außen", description: "Gründliche Handwäsche inkl. Felgen.", price_mode: "discount", discount_percent: 0, service_ids: ["s1", "s3"] },
  { id: "p2", name: "Premium Innen", description: "Tiefenreinigung inkl. Polster und Pflege.", price_mode: "discount", discount_percent: 5, service_ids: ["s7", "s8", "s10"] },
  { id: "p3", name: "Komplettaufbereitung", description: "Innen und außen.", price_mode: "discount", discount_percent: 10, service_ids: ["s2", "s1", "s3", "s15", "s16", "s19", "s7", "s8", "s10"] },
  { id: "p4", name: "Keramik Premium", description: "Lackkorrektur und Mehrschicht-Keramik.", price_mode: "discount", discount_percent: 8, service_ids: ["s14", "s15", "s17", "s21", "s22"] },
];

export const config = DEFAULT_PRICING_CONFIG;
export const tax = { default_tax_rate: 19, small_business: false };

export const customers = [
  { id: "c1", name: "Lena Schmitz" }, { id: "c2", name: "Jonas Becker" }, { id: "c3", name: "Autohaus Rheinblick GmbH" },
  { id: "c4", name: "Aylin Yilmaz" }, { id: "c5", name: "Thomas Hoffmann" }, { id: "c6", name: "Taxi Köln-Mitte eG" },
];
export const vehicles = [
  { id: "v1", customer_id: "c1", name: "BMW M3 Competition (K-LS 330)", vehicle_class: "limousine" as const },
  { id: "v2", customer_id: "c2", name: "Porsche 911 Carrera S (K-JB 911)", vehicle_class: "sportwagen" as const },
  { id: "v3", customer_id: "c3", name: "Mercedes-Benz GLC 300e (K-RB 1001)", vehicle_class: "suv" as const },
  { id: "v4", customer_id: "c4", name: "VW Golf GTI (K-AY 2024)", vehicle_class: "kompaktwagen" as const },
  { id: "v5", customer_id: "c5", name: "Volvo XC90 B5 (K-TH 90)", vehicle_class: "suv" as const },
  { id: "v6", customer_id: "c6", name: "Toyota Camry Hybrid (K-TX 123)", vehicle_class: "limousine" as const },
];

export const orders = [
  { id: "o1", number: "AU-2026-0001", vehicle: "BMW M3 Competition", customer: "Lena Schmitz", title: "Innenraumaufbereitung", status: "in_bearbeitung", time: "10:00", total: 321.3 },
  { id: "o2", number: "AU-2026-0002", vehicle: "Porsche 911 Carrera S", customer: "Jonas Becker", title: "Keramik Premium", status: "geplant", time: "14:00", total: 1283.77 },
  { id: "o3", number: "AU-2026-0003", vehicle: "Mercedes-Benz GLC 300e", customer: "Autohaus Rheinblick GmbH", title: "Komplettaufbereitung", status: "abholbereit", time: null, total: 749.7 },
  { id: "o4", number: "AU-2026-0004", vehicle: "VW Golf GTI", customer: "Aylin Yilmaz", title: "Tierhaarentfernung + Sprühextraktion", status: "fahrzeug_angenommen", time: "08:30", total: 213.49 },
  { id: "o5", number: "AU-2026-0005", vehicle: "Volvo XC90 B5", customer: "Thomas Hoffmann", title: "Leasingrückgabe", status: "bestaetigt", time: null, total: 392.7 },
  { id: "o6", number: "AU-2026-0006", vehicle: "Toyota Camry Hybrid", customer: "Taxi Köln-Mitte eG", title: "Basic Außen + Innen", status: "qualitaetskontrolle", time: null, total: 178.5 },
  { id: "o7", number: "AU-2026-0007", vehicle: "Audi RS6 Avant", customer: "Dr. Marc Richter", title: "Zweistufige Politur", status: "anfrage", time: null, total: 0 },
] as const;
