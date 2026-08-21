import { env } from "cloudflare:workers";

type AppBindings = {
  DB: D1Database;
  FILES: R2Bucket;
  MIGRATION_SECRET?: string;
};

export function bindings(): AppBindings {
  return env as unknown as AppBindings;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_filename TEXT NOT NULL,
    file_key TEXT NOT NULL DEFAULT '',
    raw_text TEXT NOT NULL DEFAULT '',
    extraction_warning TEXT NOT NULL DEFAULT '',
    learning_note TEXT NOT NULL DEFAULT '',
    invoice_category TEXT NOT NULL DEFAULT 'freight',
    vessel_name TEXT NOT NULL DEFAULT '',
    voyage_no TEXT NOT NULL DEFAULT '',
    eta TEXT NOT NULL DEFAULT '',
    invoice_no TEXT NOT NULL DEFAULT '',
    invoice_no_key TEXT NOT NULL DEFAULT '',
    invoice_date TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    owner_email TEXT NOT NULL DEFAULT '',
    port_of_discharge TEXT NOT NULL DEFAULT '',
    container_no TEXT NOT NULL DEFAULT '',
    container_size TEXT NOT NULL DEFAULT '',
    bl_no TEXT NOT NULL DEFAULT '',
    charge_details TEXT NOT NULL DEFAULT '',
    amount TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '待校正',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_vessel_owner ON invoices(vessel_name, owner_name)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_eta_vessel ON invoices(eta, vessel_name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_no_key ON invoices(invoice_no_key) WHERE invoice_no_key <> ''`,
  `CREATE TABLE IF NOT EXISTS vessel_archives (
    vessel_name TEXT PRIMARY KEY,
    archived_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS container_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    container_no TEXT NOT NULL,
    released INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(vessel_name, owner_name, container_no)
  )`,
  `CREATE TABLE IF NOT EXISTS container_free_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    container_no TEXT NOT NULL,
    last_free_day TEXT NOT NULL DEFAULT '',
    pickup_date TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(vessel_name, owner_name, container_no)
  )`,
  `CREATE TABLE IF NOT EXISTS payment_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    payment_date TEXT NOT NULL DEFAULT '',
    source_filename TEXT NOT NULL,
    file_key TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_proofs_vessel_owner ON payment_proofs(vessel_name, owner_name)`,
  `CREATE TABLE IF NOT EXISTS email_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_type TEXT NOT NULL,
    vessel_name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    owner_email TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(draft_type, vessel_name, owner_name, owner_email)
  )`,
  `CREATE TABLE IF NOT EXISTS learning_examples (
    invoice_id INTEGER PRIMARY KEY,
    source_filename TEXT NOT NULL DEFAULT '',
    template_signature TEXT NOT NULL DEFAULT '',
    fields_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

let ready: Promise<void> | null = null;

export async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const db = bindings().DB;
      await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
      await db.prepare("PRAGMA optimize").run();
    })();
  }
  return ready;
}

export async function all<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await bindings().DB.prepare(sql).bind(...values).all<T>();
  return result.results ?? [];
}

export async function first<T>(sql: string, values: unknown[] = []): Promise<T | null> {
  await ensureSchema();
  return bindings().DB.prepare(sql).bind(...values).first<T>();
}

export async function run(sql: string, values: unknown[] = []) {
  await ensureSchema();
  return bindings().DB.prepare(sql).bind(...values).run();
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
