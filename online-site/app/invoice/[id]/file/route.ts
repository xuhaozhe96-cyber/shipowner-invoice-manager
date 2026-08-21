import { bindings, first } from "../../../../lib/db";
import type { InvoiceRow } from "../../../../lib/types";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const invoice = await first<InvoiceRow>("SELECT * FROM invoices WHERE id = ?", [Number(id)]);
  if (!invoice?.file_key) return new Response("Not found", { status: 404 });
  const object = await bindings().FILES.get(invoice.file_key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/pdf", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(invoice.source_filename)}` } });
}
