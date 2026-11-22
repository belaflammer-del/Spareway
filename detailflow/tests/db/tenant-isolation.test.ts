import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_URL, Db, resetDatabase } from "./setup";

/**
 * Kritische Berechtigungstests: Firma A darf niemals Daten von Firma B sehen oder verändern.
 * Läuft gegen eine echte PostgreSQL-Datenbank mit den Produktionsmigrationen (RLS aktiv).
 * Start: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/detailflow_test npm run test:db
 */
const run = DB_URL ? describe : describe.skip;

const ownerA = { id: randomUUID(), email: "inhaber@premium-detailing-koeln.de" };
const staffA = { id: randomUUID(), email: "mitarbeiter@premium-detailing-koeln.de" };
const ownerB = { id: randomUUID(), email: "chef@autocare-bonn.de" };
const outsider = { id: randomUUID(), email: "fremd@example.com" };

let db: Db;
let companyA: string;
let companyB: string;
let customerA: string;
let customerB: string;
let vehicleB: string;
let quoteB: string;
let quoteBToken: string;

run("Mandantentrennung (RLS)", () => {
  beforeAll(async () => {
    await resetDatabase();
    db = new Db();
    await db.connect();
    for (const u of [ownerA, staffA, ownerB, outsider]) {
      await db.admin("insert into auth.users(id, email) values ($1, $2)", [u.id, u.email]);
    }
    companyA = (await db.as(ownerA, "select public.create_company('Premium Detailing Köln') as id"))[0].id;
    companyB = (await db.as(ownerB, "select public.create_company('AutoCare Bonn') as id"))[0].id;
    await db.admin("insert into memberships(company_id, user_id, role) values ($1, $2, 'staff')", [companyA, staffA.id]);

    customerA = (
      await db.as(ownerA, "insert into customers(company_id, first_name, last_name) values ($1,'Lena','Schmitz') returning id", [companyA])
    )[0].id;
    customerB = (
      await db.as(ownerB, "insert into customers(company_id, first_name, last_name) values ($1,'Jonas','Becker') returning id", [companyB])
    )[0].id;
    vehicleB = (
      await db.as(
        ownerB,
        "insert into vehicles(company_id, customer_id, make, model, vehicle_class) values ($1,$2,'BMW','M3','limousine') returning id",
        [companyB, customerB],
      )
    )[0].id;
    quoteB = (
      await db.as(
        ownerB,
        `select public.create_quote_with_items($1::jsonb, $2::jsonb) as id`,
        [
          JSON.stringify({ company_id: companyB, customer_id: customerB, vehicle_id: vehicleB, vehicle_class: "limousine", soiling_level: "normal", subtotal_net: 100, tax_total: 19, total_gross: 119 }),
          JSON.stringify([{ title: "Handwäsche", quantity: 1, unit_price_net: 100, tax_rate: 19, total_net: 100 }]),
        ],
      )
    )[0].id;
    await db.admin("update quotes set status = 'sent' where id = $1", [quoteB]);
    quoteBToken = (await db.admin("select public_token from quotes where id = $1", [quoteB])).rows[0].public_token;
  });

  afterAll(async () => {
    await db?.end();
  });

  it("legt bei Firmenanlage den kompletten Leistungskatalog ohne Preise an", async () => {
    const rows = await db.as(ownerA, "select count(*)::int as n, max(base_price)::float as maxp from services where company_id = $1", [companyA]);
    expect(rows[0].n).toBeGreaterThan(100);
    expect(rows[0].maxp).toBe(0);
    const pk = await db.as(ownerA, "select count(*)::int as n from packages");
    expect(pk[0].n).toBe(8);
  });

  it("Firma A sieht nur die eigene Firma", async () => {
    const rows = await db.as(ownerA, "select id from companies");
    expect(rows.map((r) => r.id)).toEqual([companyA]);
  });

  it("Firma A sieht keine Kunden, Fahrzeuge, Angebote, Positionen oder Leistungen von Firma B", async () => {
    for (const table of ["customers", "vehicles", "quotes", "quote_items", "services", "packages", "service_categories", "memberships"]) {
      const rows = await db.as(ownerA, `select count(*)::int as n from ${table} where company_id = $1`, [companyB]);
      expect(rows[0].n, table).toBe(0);
    }
    const direct = await db.as(ownerA, "select * from customers where id = $1", [customerB]);
    expect(direct).toHaveLength(0);
  });

  it("Firma A kann Daten von Firma B weder ändern noch löschen", async () => {
    const upd = await db.as(ownerA, "update customers set last_name = 'Gehackt' where id = $1 returning id", [customerB]);
    expect(upd).toHaveLength(0);
    const del = await db.as(ownerA, "delete from vehicles where id = $1 returning id", [vehicleB]);
    expect(del).toHaveLength(0);
    const upq = await db.as(ownerA, "update quotes set status = 'accepted' where id = $1 returning id", [quoteB]);
    expect(upq).toHaveLength(0);
    const check = await db.admin("select last_name from customers where id = $1", [customerB]);
    expect(check.rows[0].last_name).toBe("Becker");
  });

  it("Firma A kann keine Datensätze in Firma B anlegen", async () => {
    await expect(
      db.as(ownerA, "insert into customers(company_id, last_name) values ($1, 'Eindringling')", [companyB]),
    ).rejects.toThrow(/row-level security/);
  });

  it("Firma A kann keine fremden Kunden-IDs in eigene Datensätze einschleusen", async () => {
    await expect(
      db.as(ownerA, "insert into vehicles(company_id, customer_id, make, model) values ($1, $2, 'VW', 'Golf')", [companyA, customerB]),
    ).rejects.toThrow(/gehört nicht zu dieser Firma/);
  });

  it("company_id kann nachträglich nicht verschoben werden", async () => {
    await expect(
      db.as(ownerA, "update customers set company_id = $1 where id = $2", [companyB, customerA]),
    ).rejects.toThrow();
  });

  it("Firma A kann kein fremdes Angebot in einen Auftrag umwandeln", async () => {
    await db.admin("update quotes set status = 'accepted' where id = $1", [quoteB]);
    await expect(db.as(ownerA, "select public.convert_quote_to_order($1)", [quoteB])).rejects.toThrow(/nicht gefunden/);
    await db.admin("update quotes set status = 'sent' where id = $1", [quoteB]);
  });

  it("Firma A kann keine fremden Kunden zusammenführen", async () => {
    await expect(db.as(ownerA, "select public.merge_customers($1, $2)", [customerB, customerA])).rejects.toThrow();
  });

  it("Nummernkreise fremder Firmen sind nicht nutzbar", async () => {
    await expect(db.as(ownerA, "select public.next_document_number($1, 'quote')", [companyB])).rejects.toThrow(/Kein Zugriff/);
  });

  it("Außenstehende ohne Mitgliedschaft sehen nichts", async () => {
    for (const table of ["companies", "customers", "vehicles", "quotes", "services"]) {
      const rows = await db.as(outsider, `select count(*)::int as n from ${table}`);
      expect(rows[0].n, table).toBe(0);
    }
  });

  it("Anonyme Nutzer sehen keine Tabellen, nur ein Angebot per gültigem Token", async () => {
    const rows = await db.as(null, "select count(*)::int as n from quotes");
    expect(rows[0].n).toBe(0);
    const pub = await db.as(null, "select public.get_public_quote($1) as q", [quoteBToken]);
    expect(pub[0].q.number).toMatch(/^AN-/);
    expect(pub[0].q.items).toHaveLength(1);
    expect(pub[0].q.customer.name).toBe("Jonas Becker");
    // Keine internen Daten
    expect(JSON.stringify(pub[0].q)).not.toContain("calculation");
    const bad = await db.as(null, "select public.get_public_quote($1) as q", ["x".repeat(48)]);
    expect(bad[0].q).toBeNull();
  });

  it("Mitarbeiter dürfen keine Preise ändern und keine Kunden löschen", async () => {
    const upd = await db.as(staffA, "update services set base_price = 1 where company_id = $1 returning id", [companyA]);
    expect(upd).toHaveLength(0);
    const del = await db.as(staffA, "delete from customers where id = $1 returning id", [customerA]);
    expect(del).toHaveLength(0);
    const sel = await db.as(staffA, "select id from customers where id = $1", [customerA]);
    expect(sel).toHaveLength(1);
  });

  it("Mitarbeiter können ihre Rolle nicht selbst erhöhen", async () => {
    const upd = await db.as(staffA, "update memberships set role = 'admin' where user_id = $1 returning id", [staffA.id]);
    expect(upd).toHaveLength(0);
  });

  it("Tarifdaten können nicht vom Client geändert werden", async () => {
    await expect(db.as(ownerA, "update companies set plan = 'business' where id = $1", [companyA])).rejects.toThrow(/Tarif- und Zahlungsdaten/);
  });

  it("Audit-Log ist für Mitarbeiter und fremde Firmen nicht lesbar", async () => {
    const own = await db.as(ownerA, "select count(*)::int as n from audit_log where company_id = $1", [companyA]);
    expect(own[0].n).toBeGreaterThan(0);
    const foreign = await db.as(ownerA, "select count(*)::int as n from audit_log where company_id = $1", [companyB]);
    expect(foreign[0].n).toBe(0);
    const staff = await db.as(staffA, "select count(*)::int as n from audit_log");
    expect(staff[0].n).toBe(0);
  });

  it("Dateien: Firma A kann keine Dateien im Ordner von Firma B lesen oder ablegen", async () => {
    await db.admin("insert into storage.objects(bucket_id, name) values ('company-files', $1)", [`${companyB}/orders/foto.jpg`]);
    await db.admin("insert into storage.objects(bucket_id, name) values ('company-files', $1)", [`${companyA}/orders/foto.jpg`]);
    const own = await db.as(ownerA, "select name from storage.objects");
    expect(own.map((r) => r.name)).toEqual([`${companyA}/orders/foto.jpg`]);
    await expect(
      db.as(ownerA, "insert into storage.objects(bucket_id, name) values ('company-files', $1)", [`${companyB}/x.jpg`]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(ownerA, "insert into storage.objects(bucket_id, name) values ('company-files', 'kein-uuid/x.jpg')"),
    ).rejects.toThrow(/row-level security/);
  });
});

run("Geschäftsregeln Angebote", () => {
  let dbx: Db;
  beforeAll(async () => {
    dbx = new Db();
    await dbx.connect();
  });
  afterAll(async () => dbx?.end());

  it("vergibt fortlaufende Angebotsnummern je Firma", async () => {
    const n1 = (await dbx.as(ownerA, "select public.next_document_number($1, 'quote') as n", [companyA]))[0].n;
    const n2 = (await dbx.as(ownerA, "select public.next_document_number($1, 'quote') as n", [companyA]))[0].n;
    const year = new Date().getFullYear();
    expect(n1).toBe(`AN-${year}-0001`);
    expect(n2).toBe(`AN-${year}-0002`);
  });

  it("Positionen versendeter Angebote sind gesperrt; Annahme per Link erzeugt umwandelbares Angebot", async () => {
    await expect(
      dbx.as(ownerB, "update quote_items set unit_price_net = 1 where quote_id = $1", [quoteB]),
    ).rejects.toThrow(/versendeten Angebots/);
    const res = await dbx.as(null, "select public.respond_public_quote($1, true) as r", [quoteBToken]);
    expect(res[0].r).toBe("accepted");
    const orderId = (await dbx.as(ownerB, "select public.convert_quote_to_order($1) as id", [quoteB]))[0].id;
    const items = await dbx.as(ownerB, "select title from order_items where order_id = $1", [orderId]);
    expect(items.map((i) => i.title)).toEqual(["Handwäsche"]);
    // idempotent
    const again = (await dbx.as(ownerB, "select public.convert_quote_to_order($1) as id", [quoteB]))[0].id;
    expect(again).toBe(orderId);
    await expect(dbx.as(null, "select public.respond_public_quote($1, false)", [quoteBToken])).rejects.toThrow(/nicht mehr/);
  });
});

run("Phase 3: Kalender, Fotos, Checklisten, Auswertungen", () => {
  let d: Db;
  let orderA: string;
  let orderB: string;
  let boxA: string;
  let boxB: string;
  beforeAll(async () => {
    d = new Db();
    await d.connect();
    boxA = (await d.as(ownerA, "select id from workstations where company_id = $1 and name = 'Box 1'", [companyA]))[0].id;
    boxB = (await d.as(ownerB, "select id from workstations where company_id = $1 and name = 'Box 1'", [companyB]))[0].id;
    orderA = (await d.as(ownerA, `select public.create_order_with_items($1::jsonb, '[]'::jsonb) as id`, [
      JSON.stringify({ company_id: companyA, customer_id: customerA, scheduled_start: "2026-12-01T09:00:00Z", estimated_minutes: 120 }),
    ]))[0].id;
    orderB = (await d.admin("select id from orders where company_id = $1 limit 1", [companyB])).rows[0].id;
  });
  afterAll(async () => d?.end());

  it("legt für neue Firmen Boxen und 7 Checklisten-Vorlagen an", async () => {
    const t = await d.as(ownerA, "select count(*)::int as n from checklist_templates");
    expect(t[0].n).toBe(7);
    const w = await d.as(ownerA, "select count(*)::int as n from workstations");
    expect(w[0].n).toBe(3);
  });

  it("leitet das Terminende aus der geschätzten Dauer ab", async () => {
    const r = await d.as(ownerA, "select scheduled_end from orders where id = $1", [orderA]);
    expect(new Date(r[0].scheduled_end).toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });

  it("verhindert Doppelbelegung einer Box in der Datenbank", async () => {
    await d.as(ownerA, "update orders set workstation_id = $1 where id = $2", [boxA, orderA]);
    await expect(d.as(ownerA, `select public.create_order_with_items($1::jsonb, '[]'::jsonb)`, [
      JSON.stringify({ company_id: companyA, customer_id: customerA, scheduled_start: "2026-12-01T10:00:00Z", scheduled_end: "2026-12-01T12:00:00Z" }),
    ]).then(async (rows: any) => d.as(ownerA, "update orders set workstation_id = $1 where id = $2", [boxA, rows[0].create_order_with_items]))).rejects.toThrow(/orders_no_workstation_overlap/);
  });

  it("Firma A kann keine fremde Box zuweisen und fremde Boxen nicht sehen", async () => {
    await expect(d.as(ownerA, "update orders set workstation_id = $1 where id = $2", [boxB, orderA])).rejects.toThrow(/gehört nicht zu dieser Firma/);
    const rows = await d.as(ownerA, "select id from workstations where id = $1", [boxB]);
    expect(rows).toHaveLength(0);
  });

  it("Fotos: nur im eigenen Auftragsordner und nicht für fremde Aufträge", async () => {
    await d.as(staffA, "insert into order_photos(company_id, order_id, category, storage_path) values ($1, $2, 'vorher', $3)", [companyA, orderA, `${companyA}/orders/${orderA}/a.jpg`]);
    await expect(d.as(ownerA, "insert into order_photos(company_id, order_id, category, storage_path) values ($1, $2, 'vorher', $3)", [companyA, orderA, `${companyB}/orders/${orderA}/x.jpg`])).rejects.toThrow(/check constraint/);
    await expect(d.as(ownerA, "insert into order_photos(company_id, order_id, category, storage_path) values ($1, $2, 'vorher', $3)", [companyA, orderB, `${companyA}/orders/${orderB}/x.jpg`])).rejects.toThrow(/gehört nicht zu dieser Firma/);
    const foreign = await d.as(ownerB, "select count(*)::int as n from order_photos");
    expect(foreign[0].n).toBe(0);
    const del = await d.as(staffA, "delete from order_photos returning id");
    expect(del).toHaveLength(0); // Mitarbeiter dürfen Fotos nicht löschen
  });

  it("Checklisten: aus Vorlage anlegen, Abhaken protokolliert Person und Zeit", async () => {
    const tpl = (await d.as(ownerA, "select id from checklist_templates where name = 'Fahrzeugannahme'"))[0].id;
    const cl = (await d.as(staffA, "select public.add_checklist_to_order($1, $2) as id", [orderA, tpl]))[0].id;
    const items = await d.as(staffA, "select id from order_checklist_items where checklist_id = $1 order by sort", [cl]);
    expect(items).toHaveLength(6);
    await d.as(staffA, "update order_checklist_items set done = true where id = $1", [items[0].id]);
    const it = await d.as(ownerA, "select done_by, done_at from order_checklist_items where id = $1", [items[0].id]);
    expect(it[0].done_by).toBe(staffA.id);
    expect(it[0].done_at).not.toBeNull();
    const foreign = await d.as(ownerB, "select count(*)::int as n from order_checklist_items");
    expect(foreign[0].n).toBe(0);
    await expect(d.as(ownerB, "select public.add_checklist_to_order($1, $2)", [orderA, tpl])).rejects.toThrow(/nicht gefunden/);
  });

  it("Mitarbeiter können keine Vorlagen oder Boxen ändern", async () => {
    const r = await d.as(staffA, "update checklist_templates set name = 'X' returning id");
    expect(r).toHaveLength(0);
    await expect(d.as(staffA, "insert into workstations(company_id, name) values ($1, 'Box 9')", [companyA])).rejects.toThrow(/row-level security/);
  });

  it("Auswertungs-Views zeigen nur eigene Zahlen", async () => {
    await d.as(ownerA, "update orders set status = 'abgeschlossen', total_net = 100, total_gross = 119 where id = $1", [orderA]);
    const a = await d.as(ownerA, "select company_id from v_revenue_monthly");
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((r) => r.company_id === companyA)).toBe(true);
    const b = await d.as(ownerB, "select company_id from v_revenue_monthly where company_id = $1", [companyA]);
    expect(b).toHaveLength(0);
    const out = await d.as(outsider, "select count(*)::int as n from v_quote_stats");
    expect(out[0].n).toBe(0);
  });
});

run("Phase 4: Rechnungen, Portal, Online-Anfrage, Nachrichten", () => {
  let d: Db;
  let orderA: string;
  let invoiceId: string;
  let portalToken: string;
  beforeAll(async () => {
    d = new Db();
    await d.connect();
    await d.admin("update companies set street = 'Industriestraße 42', zip = '50735', city = 'Köln', tax_id = '217/5123/4567', slug = 'premium-koeln', booking_enabled = true where id = $1", [companyA]);
    orderA = (await d.as(ownerA, `select public.create_order_with_items($1::jsonb, $2::jsonb) as id`, [
      JSON.stringify({ company_id: companyA, customer_id: customerA, status: "abgeschlossen", total_net: 150, total_gross: 178.5 }),
      JSON.stringify([{ title: "Handwäsche", quantity: 1, unit_price_net: 50, tax_rate: 19, total_net: 50 }, { title: "Innenraum", quantity: 2, unit_price_net: 50, tax_rate: 19, total_net: 100 }]),
    ]))[0].id;
    portalToken = (await d.admin("select portal_token from customers where id = $1", [customerA])).rows[0].portal_token;
  });
  afterAll(async () => d?.end());

  it("erstellt Rechnungsentwurf aus Auftrag mit korrekten Summen", async () => {
    invoiceId = (await d.as(staffA, "select public.create_invoice_from_order($1) as id", [orderA]))[0].id;
    const inv = (await d.as(staffA, "select status, number, subtotal_net::float, tax_total::float, total_gross::float from invoices where id = $1", [invoiceId]))[0];
    expect(inv).toMatchObject({ status: "draft", number: null, subtotal_net: 150, tax_total: 28.5, total_gross: 178.5 });
  });

  it("Mitarbeiter dürfen nicht finalisieren", async () => {
    await expect(d.as(staffA, "select public.finalize_invoice($1)", [invoiceId])).rejects.toThrow(/Keine Berechtigung/);
    await expect(d.as(staffA, "update invoices set status = 'finalized' where id = $1", [invoiceId])).rejects.toThrow(/Keine Berechtigung/);
  });

  it("Finalisieren vergibt lückenlose Nummer, friert Daten ein und bildet Hash", async () => {
    const num = (await d.as(ownerA, "select public.finalize_invoice($1) as n", [invoiceId]))[0].n;
    expect(num).toBe(`RE-${new Date().getFullYear()}-0001`);
    const inv = (await d.as(ownerA, "select status, content_hash, seller_snapshot, buyer_snapshot, due_date from invoices where id = $1", [invoiceId]))[0];
    expect(inv.status).toBe("finalized");
    expect(inv.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(inv.seller_snapshot.tax_id).toBe("217/5123/4567");
    expect(inv.buyer_snapshot.name).toBe("Lena Schmitz");
    expect(inv.due_date).not.toBeNull();
  });

  it("finalisierte Rechnungen sind unveränderbar und nicht löschbar", async () => {
    await expect(d.as(ownerA, "update invoices set total_gross = 1 where id = $1", [invoiceId])).rejects.toThrow(/unveränderbar/);
    await expect(d.as(ownerA, "update invoice_items set total_net = 1 where invoice_id = $1", [invoiceId])).rejects.toThrow(/unveränderbar/);
    await expect(d.as(ownerA, "delete from invoices where id = $1", [invoiceId])).rejects.toThrow(/nicht gelöscht/);
    // Kundendaten-Änderung verändert die Rechnung nicht
    await d.as(ownerA, "update customers set last_name = 'Müller' where id = $1", [customerA]);
    const inv = (await d.as(ownerA, "select buyer_snapshot from invoices where id = $1", [invoiceId]))[0];
    expect(inv.buyer_snapshot.name).toBe("Lena Schmitz");
    await d.as(ownerA, "update customers set last_name = 'Schmitz' where id = $1", [customerA]);
  });

  it("Zahlungen setzen den Status, sind aber selbst unveränderbar", async () => {
    await d.as(ownerA, "insert into invoice_payments(company_id, invoice_id, amount) values ($1, $2, 100)", [companyA, invoiceId]);
    expect((await d.as(ownerA, "select status from invoices where id = $1", [invoiceId]))[0].status).toBe("finalized");
    await d.as(ownerA, "insert into invoice_payments(company_id, invoice_id, amount) values ($1, $2, 78.5)", [companyA, invoiceId]);
    expect((await d.as(ownerA, "select status from invoices where id = $1", [invoiceId]))[0].status).toBe("paid");
    const del = await d.as(ownerA, "delete from invoice_payments where invoice_id = $1 returning id", [invoiceId]);
    expect(del).toHaveLength(0); // keine Lösch-Policy: Zahlungen bleiben erhalten
    await expect(d.admin("delete from invoice_payments where invoice_id = $1", [invoiceId])).rejects.toThrow(/nicht geändert/); // auch nicht mit Admin-Rechten
  });

  it("Storno erzeugt eine finalisierte Gegenrechnung mit eigener Nummer", async () => {
    const st = (await d.as(ownerA, "select public.cancel_invoice($1) as id", [invoiceId]))[0].id;
    const s = (await d.as(ownerA, "select number, kind, status, total_gross::float from invoices where id = $1", [st]))[0];
    expect(s).toMatchObject({ number: `RE-${new Date().getFullYear()}-0002`, kind: "cancellation", status: "finalized", total_gross: -178.5 });
    expect((await d.as(ownerA, "select status from invoices where id = $1", [invoiceId]))[0].status).toBe("cancelled");
  });

  it("Firma B sieht keine Rechnungen, Zahlungen oder Nachrichten von Firma A", async () => {
    for (const t of ["invoices", "invoice_items", "invoice_payments", "messages", "message_templates"]) {
      const r = await d.as(ownerB, `select count(*)::int as n from ${t} where company_id = $1`, [companyA]);
      expect(r[0].n, t).toBe(0);
    }
    await expect(d.as(ownerB, "select public.create_invoice_from_order($1)", [orderA])).rejects.toThrow(/nicht gefunden/);
    await expect(d.as(ownerB, "select public.finalize_invoice($1)", [invoiceId])).rejects.toThrow(/nicht gefunden/);
  });

  it("Kundenportal zeigt nur die eigenen Daten des Kunden; Nachrichten kommen im Betrieb an", async () => {
    const p = (await d.as(null, "select public.get_portal($1) as p", [portalToken]))[0].p;
    expect(p.customer.name).toBe("Lena Schmitz");
    expect(p.invoices.length).toBe(2);
    expect(JSON.stringify(p)).not.toContain("internal_notes");
    await d.as(null, "select public.portal_send_message($1, 'Kann ich das Auto schon um 16 Uhr holen?')", [portalToken]);
    const m = await d.as(ownerA, "select direction, body from messages where customer_id = $1", [customerA]);
    expect(m.some((x) => x.direction === "in" && x.body.includes("16 Uhr"))).toBe(true);
    expect((await d.as(null, "select public.get_portal($1) as p", ["0".repeat(48)]))[0].p).toBeNull();
    // anon sieht Tabellen weiterhin nicht
    expect((await d.as(null, "select count(*)::int as n from messages"))[0].n).toBe(0);
  });

  it("Online-Anfrage legt Kunde, Fahrzeug, Anfrage und Nachricht an – nur bei aktivierter Buchungsseite", async () => {
    const tok = (await d.as(null, "select public.submit_booking_request('premium-koeln', $1::jsonb) as t", [
      JSON.stringify({ name: "Kai Neu", email: "kai@example.com", phone: "0170 1", make: "Audi", model: "A4", vehicle_class: "kombi", message: "Bitte Innenraum", wish_date: "Freitag" }),
    ]))[0].t;
    expect(tok).toHaveLength(48);
    const o = await d.as(ownerA, "select o.status, v.make from orders o join customers c on c.id = o.customer_id left join vehicles v on v.id = o.vehicle_id where c.email = 'kai@example.com'");
    expect(o).toEqual([{ status: "anfrage", make: "Audi" }]);
    // zweite Anfrage mit gleicher E-Mail -> gleicher Kunde
    const tok2 = (await d.as(null, "select public.submit_booking_request('premium-koeln', $1::jsonb) as t", [JSON.stringify({ name: "Kai Neu", email: "KAI@example.com" })]))[0].t;
    expect(tok2).toBe(tok);
    await expect(d.as(null, "select public.submit_booking_request('autocare', $1::jsonb)", [JSON.stringify({ name: "X Y", email: "x@y.de" })])).rejects.toThrow(/nicht gefunden/);
    await expect(d.as(null, "select public.submit_booking_request('premium-koeln', $1::jsonb)", [JSON.stringify({ name: "X", email: "kaputt" })])).rejects.toThrow();
  });
});

run("Umsatzbeteiligung (Stripe Connect)", () => {
  let d: Db;
  beforeAll(async () => { d = new Db(); await d.connect(); });
  afterAll(async () => d?.end());

  it("Stripe-Konto und Freischaltung kann der Betrieb nicht selbst setzen", async () => {
    await expect(d.as(ownerA, "update companies set stripe_charges_enabled = true where id = $1", [companyA])).rejects.toThrow(/Zahlungsdaten/);
    await expect(d.as(ownerA, "update companies set stripe_account_id = 'acct_x' where id = $1", [companyA])).rejects.toThrow(/Zahlungsdaten/);
  });

  it("Plattformgebühren: nur serverseitig schreibbar, nur Inhaber der eigenen Firma lesen", async () => {
    await expect(d.as(ownerA, "insert into platform_fees(company_id, payment_external_id, gross_cents, fee_cents, month) values ($1, 'x', 100, 1, current_date)", [companyA])).rejects.toThrow(/row-level security/);
    await d.admin("insert into platform_fees(company_id, payment_external_id, gross_cents, fee_cents, month) values ($1, 'cs_test_1', 20000, 100, date_trunc('month', now() at time zone 'Europe/Berlin')::date)", [companyA]);
    expect((await d.as(ownerA, "select count(*)::int as n from platform_fees"))[0].n).toBe(1);
    expect((await d.as(staffA, "select count(*)::int as n from platform_fees"))[0].n).toBe(0);
    expect((await d.as(ownerB, "select count(*)::int as n from platform_fees"))[0].n).toBe(0);
    expect((await d.admin("select public.platform_fees_this_month($1) as n", [companyA])).rows[0].n).toBe(100);
    await expect(d.as(ownerA, "select public.platform_fees_this_month($1)", [companyA])).rejects.toThrow(/permission denied/);
  });

  it("Online-Zahlungen werden bei wiederholtem Webhook nicht doppelt gebucht", async () => {
    const inv = (await d.admin("select id from invoices where company_id = $1 and kind = 'invoice' limit 1", [companyA])).rows[0].id;
    await d.admin("update invoices set status = 'finalized' where id = $1", [inv]).catch(() => {});
    await expect(d.admin("insert into invoice_payments(company_id, invoice_id, amount, external_id) values ($1, $2, 1, 'pi_dup'), ($1, $2, 1, 'pi_dup')", [companyA, inv])).rejects.toThrow();
  });
});
