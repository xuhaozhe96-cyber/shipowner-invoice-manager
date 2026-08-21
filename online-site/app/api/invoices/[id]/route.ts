import { first, nowIso, run } from "../../../../lib/db";
import type { InvoiceRow } from "../../../../lib/types";
import { normalizeInvoiceNo } from "../../../../lib/utils";

const fields = ["vessel_name","voyage_no","eta","invoice_no","invoice_date","owner_name","owner_email","port_of_discharge","container_no","container_size","bl_no","charge_details","amount","currency","status"] as const;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const invoiceId = Number(id);
  const existing = await first<InvoiceRow>("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
  if (!existing) return new Response("Not found", { status: 404 });
  const form = await request.formData();
  const values = Object.fromEntries(fields.map((field) => [field, String(form.get(field) ?? "").trim()])) as Record<(typeof fields)[number], string>;
  const invoiceKey = normalizeInvoiceNo(values.invoice_no);
  if (invoiceKey) {
    const duplicate = await first<Pick<InvoiceRow, "id">>("SELECT id FROM invoices WHERE invoice_no_key = ? AND id <> ?", [invoiceKey, invoiceId]);
    if (duplicate) return Response.redirect(new URL(`/invoice/${duplicate.id}?duplicate=1`, request.url), 303);
  }
  await run(`UPDATE invoices SET vessel_name=?, voyage_no=?, eta=?, invoice_no=?, invoice_no_key=?, invoice_date=?, owner_name=?, owner_email=?, port_of_discharge=?, container_no=?, container_size=?, bl_no=?, charge_details=?, amount=?, currency=?, status=?, updated_at=? WHERE id=?`,
    [values.vessel_name, values.voyage_no, values.eta, values.invoice_no, invoiceKey, values.invoice_date, values.owner_name, values.owner_email, values.port_of_discharge, values.container_no, values.container_size, values.bl_no, values.charge_details, values.amount, values.currency, values.status, nowIso(), invoiceId]);
  const learning = JSON.stringify({ vessel_name: values.vessel_name, owner_name: values.owner_name, owner_email: values.owner_email, port_of_discharge: values.port_of_discharge, container_size: values.container_size, currency: values.currency });
  await run(`INSERT INTO learning_examples (invoice_id, source_filename, template_signature, fields_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(invoice_id) DO UPDATE SET fields_json=excluded.fields_json, updated_at=excluded.updated_at`, [invoiceId, existing.source_filename, existing.raw_text.slice(0, 500), learning, nowIso(), nowIso()]);
  const next = String(form.get("next") ?? "save");
  const target = next === "group" && values.vessel_name ? `/group?vessel=${encodeURIComponent(values.vessel_name)}` : `/invoice/${invoiceId}?saved=1`;
  return Response.redirect(new URL(target, request.url), 303);
}
