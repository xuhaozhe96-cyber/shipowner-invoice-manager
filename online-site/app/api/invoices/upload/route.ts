import { extractText, getDocumentProxy } from "unpdf";
import { bindings, first, nowIso, run } from "../../../../lib/db";
import { extractFields } from "../../../../lib/extract";
import type { InvoiceRow } from "../../../../lib/types";
import { normalizeInvoiceNo, safeFilename } from "../../../../lib/utils";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("pdfs").filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return redirectWith(request, "/upload?error=missing");

  const created: number[] = [];
  const duplicates: number[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let rawText = "";
    let warning = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      const extracted = await extractText(pdf, { mergePages: true });
      rawText = extracted.text;
      if (!rawText.trim()) warning = "PDF 没有可提取的文字，可能是扫描件；请对照原始 PDF 手工填写。";
    } catch {
      warning = "PDF 文字提取失败；原始文件已保留，请手工核对字段。";
    }
    const fields = extractFields(rawText);
    const invoiceKey = normalizeInvoiceNo(fields.invoice_no);
    if (invoiceKey) {
      const duplicate = await first<Pick<InvoiceRow, "id">>("SELECT id FROM invoices WHERE invoice_no_key = ?", [invoiceKey]);
      if (duplicate) {
        duplicates.push(duplicate.id);
        continue;
      }
    }
    const fileKey = `invoices/${crypto.randomUUID()}.pdf`;
    await bindings().FILES.put(fileKey, bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { originalName: safeFilename(file.name) } });
    const now = nowIso();
    try {
      const result = await run(
        `INSERT INTO invoices (
          source_filename, file_key, raw_text, extraction_warning, invoice_category,
          vessel_name, voyage_no, eta, invoice_no, invoice_no_key, invoice_date,
          owner_name, owner_email, port_of_discharge, container_no, container_size,
          bl_no, charge_details, amount, currency, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'freight', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待校正', ?, ?)`,
        [safeFilename(file.name), fileKey, rawText, warning, fields.vessel_name, fields.voyage_no,
          fields.eta, fields.invoice_no, invoiceKey, fields.invoice_date, fields.owner_name,
          fields.owner_email, fields.port_of_discharge, fields.container_no, fields.container_size,
          fields.bl_no, fields.charge_details, fields.amount, fields.currency, now, now],
      );
      created.push(Number(result.meta.last_row_id));
    } catch (error) {
      await bindings().FILES.delete(fileKey);
      throw error;
    }
  }
  if (created.length) return redirectWith(request, `/invoice/${created[0]}?uploaded=${created.length}&duplicates=${duplicates.length}`);
  if (duplicates.length) return redirectWith(request, `/invoice/${duplicates[0]}?duplicate=1`);
  return redirectWith(request, "/upload?error=invalid");
}

function redirectWith(request: Request, path: string) {
  return Response.redirect(new URL(path, request.url), 303);
}
