import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export const DB_URL = process.env.TEST_DATABASE_URL;

/** Frische Testdatenbank anlegen und alle Migrationen einspielen. */
export async function resetDatabase(): Promise<void> {
  const admin = new Client({ connectionString: DB_URL!.replace(/\/[^/]+$/, "/postgres") });
  const dbName = new URL(DB_URL!).pathname.slice(1);
  await admin.connect();
  await admin.query(`drop database if exists "${dbName}" with (force)`);
  await admin.query(`create database "${dbName}"`);
  await admin.end();

  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  const root = join(__dirname, "..", "..");
  const files = [
    join(__dirname, "supabase-shim.sql"),
    ...readdirSync(join(root, "supabase", "migrations")).sort().map((f) => join(root, "supabase", "migrations", f)),
    join(__dirname, "post-migrate-grants.sql"),
  ];
  for (const f of files) await c.query(readFileSync(f, "utf8"));
  await c.end();
}

export class Db {
  client: Client;
  constructor() {
    this.client = new Client({ connectionString: DB_URL });
  }
  connect() {
    return this.client.connect();
  }
  end() {
    return this.client.end();
  }
  /** Als Superuser (entspricht service_role ohne RLS) ausführen. */
  admin(sql: string, params: unknown[] = []) {
    return this.client.query(sql, params);
  }
  /** Als angemeldeter Benutzer (Rolle authenticated, RLS aktiv) ausführen. */
  async as<T = any>(user: { id: string; email: string } | null, sql: string, params: unknown[] = []): Promise<T[]> {
    await this.client.query("begin");
    try {
      if (user) {
        await this.client.query("set local role authenticated");
        await this.client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: user.id, email: user.email, role: "authenticated" }),
        ]);
      } else {
        await this.client.query("set local role anon");
        await this.client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      }
      const res = await this.client.query(sql, params);
      await this.client.query("commit");
      return res.rows as T[];
    } catch (e) {
      await this.client.query("rollback");
      throw e;
    }
  }
}
