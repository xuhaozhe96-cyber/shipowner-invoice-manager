import type { ExtractedFields } from "./types";
import { COSCO_EMAIL } from "./utils";

function isoDate(value: string) {
  const match = value.trim().match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

export function extractFields(text: string): ExtractedFields {
  const compact = text.replace(/\r/g, "");
  const isCosco = /COSCO SHIPPING/i.test(compact);
  const containers = Array.from(new Set(compact.toUpperCase().match(/[A-Z]{4}\d{7}/g) ?? []));
  let vessel = firstMatch(compact, [
    /(?:VESSEL(?:\s+NAME)?|SHIP)\s*[:#]?\s*([A-Z][A-Z0-9 .'-]{3,40}(?:\s\d{2,4}[A-Z])?)/i,
    /\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s*([A-Z][A-Z ]+\d{2,4}[A-Z])/,
  ]).replace(/\s+/g, " ").trim();
  if (/VOYAGE BOUND ARRIVED/i.test(vessel)) vessel = "";
  if (!vessel) {
    const dated = compact.match(/\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s*([A-Z][A-Z ]+?\s\d{2,4}[A-Z])\b/);
    vessel = dated?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  }
  const invoiceNo = firstMatch(compact, [
    /(?:INVOICE\s*(?:NUMBER|NO\.?|#))\s*[:#]?\s*([A-Z0-9-]{4,30})/i,
    /\b(\d{8,12})\s*INVOICE\s*(?:NO\.?|NUMBER)/i,
  ]);
  const etaRaw = firstMatch(compact, [/(?:ETA|ARRIVAL DATE)\s*[:#]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/i]);
  const invoiceDateRaw = firstMatch(compact, [/(?:INVOICE DATE|DATE OF INVOICE)\s*[:#]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/i]);
  const amountMatch = compact.match(/(?:AMOUNT DUE|TOTAL AMOUNT|GRAND TOTAL|TOTAL)\s*[: ]*\s*(GBP|USD|EUR|£|\$|€)?\s*([\d,]+(?:\.\d{1,2})?)/i)
    ?? compact.match(/\b(GBP|USD|EUR)\s*([\d,]+(?:\.\d{1,2})?)\s*AMOUNT DUE/i)
    ?? compact.match(/\b(GBP|USD|EUR)\s*([\d,]+\.\d{2})\b/i);
  const symbol = amountMatch?.[1]?.toUpperCase() ?? "";
  const currency = symbol === "£" ? "GBP" : symbol === "$" ? "USD" : symbol === "€" ? "EUR" : symbol;
  const port = firstMatch(compact, [
    /PORT OF DISCHARGE[^\n]*\n\s*([A-Za-z][A-Za-z .'-]{2,30})/i,
    /PORT OF DISCHARGE\s*[:#]?\s*([A-Za-z][A-Za-z .'-]{2,30})/i,
  ]).split(/\s{2,}/)[0].trim();
  const blNo = firstMatch(compact, [/(?:B\/L|BL|BILL OF LADING)(?:\s+(?:NO\.?|REFERENCE))?\s*[:#]?\s*([A-Z0-9-]{6,30})/i]);
  const size = firstMatch(compact.toUpperCase(), [/\b(20GP|20DV|20HC|40GP|40DV|40HC|40HQ|45HQ)\b/]);
  const chargeLabels = ["Carrier Security Charge", "UK Lo-Lo(lift on-lift off) Charge", "DEST TRML HANDLG", "DEST. DOC FEE", "STORAGE CHARGE"];
  const chargeDetails = chargeLabels.filter((label) => compact.toUpperCase().includes(label.toUpperCase())).join("\n");
  return {
    vessel_name: vessel,
    voyage_no: "",
    eta: isoDate(etaRaw),
    invoice_no: invoiceNo,
    invoice_date: isoDate(invoiceDateRaw),
    owner_name: isCosco ? "COSCO SHIPPING Lines" : firstMatch(compact, [/(?:SHIPOWNER|OWNER|CARRIER)\s*[:#]?\s*([^\n]{3,50})/i]),
    owner_email: isCosco ? COSCO_EMAIL : firstMatch(compact, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]),
    port_of_discharge: port,
    container_no: containers.join(", "),
    container_size: size,
    bl_no: blNo,
    charge_details: chargeDetails,
    amount: amountMatch?.[2] ?? "",
    currency,
  };
}
