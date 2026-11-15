import { z } from "zod";
import { ORDER_STATUSES, QUOTE_STATUSES, ROLES, SOILING_LEVELS, VEHICLE_CLASSES } from "./domain";

const opt = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optInt = (min: number, max: number) =>
  z.union([z.string(), z.number()]).optional().nullable()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), { message: `Bitte eine Zahl zwischen ${min} und ${max} eingeben.` });
const money = z.union([z.string(), z.number()]).transform((v) => Number(String(v).replace(",", ".")))
  .refine((v) => Number.isFinite(v) && v >= 0 && v < 1_000_000, { message: "Bitte einen gültigen Betrag eingeben." });
const optMoney = z.union([z.string(), z.number()]).optional().nullable()
  .transform((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), { message: "Bitte einen gültigen Betrag eingeben." });

export const uuid = z.string().uuid({ message: "Ungültige ID" });

export const customerSchema = z.object({
  type: z.enum(["private", "business"]).default("private"),
  first_name: opt(80),
  last_name: opt(80),
  company_name: opt(160),
  contact_person: opt(120),
  email: z.string().trim().max(200).optional().nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Bitte eine gültige E-Mail-Adresse eingeben." }),
  phone: opt(60),
  street: opt(160), zip: opt(10), city: opt(100),
  billing_street: opt(160), billing_zip: opt(10), billing_city: opt(100),
  notes: opt(4000),
}).refine((c) => c.company_name || c.last_name || c.first_name, {
  message: "Bitte einen Namen oder Firmennamen angeben.", path: ["last_name"],
});

export const vehicleSchema = z.object({
  customer_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  make: z.string().trim().min(1, "Bitte den Hersteller angeben.").max(60),
  model: z.string().trim().min(1, "Bitte das Modell angeben.").max(80),
  variant: opt(80),
  year: optInt(1900, 2100),
  license_plate: opt(20),
  vin: z.string().trim().max(17).optional().nullable().transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v === null || /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v), { message: "Die FIN besteht aus 17 Zeichen (ohne I, O, Q)." }),
  mileage: optInt(0, 5_000_000),
  color: opt(60), paint_type: opt(60), body_type: opt(60),
  vehicle_class: z.enum(VEHICLE_CLASSES),
  interior_material: opt(80),
  seats: optInt(1, 60),
  condition: opt(2000), special_notes: opt(2000), known_damages: opt(2000), coatings: opt(2000),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(120),
  category_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  description: opt(2000),
  customer_description: opt(2000),
  internal_notes: opt(2000),
  pricing_type: z.enum(["fixed", "hourly"]),
  base_price: money,
  hourly_rate: optMoney,
  duration_minutes: z.coerce.number().int().min(0).max(10_000),
  material_cost: money,
  min_price: optMoney,
  tax_rate: optMoney,
  applies_vehicle_class: z.coerce.boolean(),
  applies_soiling: z.coerce.boolean(),
  active: z.coerce.boolean(),
});

export const packageSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(120),
  description: opt(2000),
  price_mode: z.enum(["discount", "fixed"]),
  fixed_price: optMoney,
  discount_percent: z.coerce.number().min(0).max(100),
  active: z.coerce.boolean(),
  service_ids: z.array(uuid).max(200),
});

export const calculationInputSchema = z.object({
  vehicleClass: z.enum(VEHICLE_CLASSES),
  soiling: z.enum(SOILING_LEVELS),
  serviceIds: z.array(uuid).max(200),
  packageIds: z.array(uuid).max(50),
  extras: z.array(z.object({ title: z.string().trim().max(200), priceNet: z.number().min(0).max(1_000_000) })).max(50).default([]),
  specialEffortMinutes: z.number().int().min(0).max(10_000).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  overrideNet: z.number().min(0).max(1_000_000).nullable().default(null),
});

export const quoteCreateSchema = z.object({
  target: z.enum(["quote", "order"]),
  customer_id: uuid,
  vehicle_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  calc: calculationInputSchema,
  intro_text: opt(4000),
  notes: opt(4000),
  scheduled_start: opt(40),
});

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const roleSchema = z.enum(ROLES);

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
export const openingHoursSchema = z.record(z.string(), z.object({ open: z.boolean(), from: hhmm, to: hhmm }));

export const companySchema = z.object({
  name: z.string().trim().min(2, "Bitte den Firmennamen angeben.").max(120),
  legal_form: opt(60),
  street: opt(160), zip: opt(10), city: opt(100),
  phone: opt(60),
  email: z.string().trim().max(200).optional().nullable().transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Bitte eine gültige E-Mail-Adresse eingeben." }),
  website: opt(200),
  tax_id: opt(40), vat_id: opt(20),
  small_business: z.coerce.boolean(),
  default_tax_rate: z.coerce.number().min(0).max(100),
  bank_name: opt(100), iban: opt(34), bic: opt(11),
  quote_prefix: z.string().trim().min(1).max(10),
  order_prefix: z.string().trim().min(1).max(10),
  invoice_prefix: z.string().trim().min(1).max(10),
  quote_validity_days: z.coerce.number().int().min(1).max(365),
  quote_terms: z.string().trim().max(4000),
});

export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ActionState = { ok?: boolean; message?: string; errors?: Record<string, string> } | undefined;
