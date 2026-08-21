import type { ExtractedFields } from "./types";
import { COSCO_EMAIL } from "./utils";

function isoDate(value: string) {
  const cleaned = value.trim();
  let match = cleaned.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  match = cleaned.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (match) {
    const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(match[2].slice(0, 3).toUpperCase()) + 1;
    if (month > 0) return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return "";
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function displayAmount(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? String(amount) : value;
}

function extractCoscoCharges(text: string, currency: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const subtotalIndex = lines.findIndex((line) => line.toUpperCase() === "SUB-TOTAL");
  if (subtotalIndex < 1) return "";

  const names: string[] = [];
  for (let index = subtotalIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (/^[-\d.,%]+$/.test(line) || /VAT\s*BASIS/i.test(line)) break;
    if (line.length <= 100) names.unshift(line);
  }
  if (!names.length || names.length > 20) return "";

  const upperCurrency = (currency || "GBP").toUpperCase();
  let amounts: string[] = [];
  for (let index = subtotalIndex + 1; index <= lines.length - names.length * 3; index += 1) {
    const currencyBlock = lines.slice(index, index + names.length);
    if (!currencyBlock.every((line) => line.toUpperCase() === upperCurrency)) continue;
    const candidates = lines.slice(index + names.length * 2, index + names.length * 3);
    if (candidates.length === names.length && candidates.every((value) => /^[\d,]+(?:\.\d+)?$/.test(value))) {
      amounts = candidates;
      break;
    }
  }
  if (amounts.length !== names.length) return names.join("\n");
  const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", CNY: "¥", RMB: "¥" };
  const symbol = symbols[upperCurrency] || `${upperCurrency} `;
  return names.map((name, index) => `${name} | ${symbol}${displayAmount(amounts[index])}`).join("\n");
}

export function extractFields(text: string): ExtractedFields {
  const compact = text.replace(/\r/g, "");
  const isCosco = /COSCO SHIPPING/i.test(compact);
  const containers = Array.from(new Set(compact.toUpperCase().match(/\b[A-Z]{4}\s*\d{7}\b/g) ?? []))
    .map((container) => container.replace(/\s+/g, ""));
  let vessel = firstMatch(compact, [
    /(?:VESSEL(?:\s+NAME)?|SHIP)\s*[:#]?\s*([A-Z][A-Z0-9 .'-]{3,40}(?:\s\d{2,4}[A-Z])?)/i,
    /\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*([A-Z][A-Z ]+\d{2,4}[A-Z])/
  ]).replace(/\s+/g, " ").trim();
  if (/VOYAGE BOUND ARRIVED/i.test(vessel)) vessel = "";
  if (!vessel) {
    const dated = compact.match(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*([A-Z][A-Z ]+?\s\d{2,4}[A-Z])\b/);
    vessel = dated?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  }
  const invoiceNo = firstMatch(compact, [
    /(?:INVOICE\s*(?:NUMBER|NO\.?|#))\s*[:#]?\s*([A-Z0-9-]{4,30})/i,
    /\b(\d{8,12})\s*INVOICE\s*(?:NO\.?|NUMBER)/i,
  ]);
  const etaRaw = firstMatch(compact, [
    /(?:ETA|ARRIVAL DATE)\s*[:#]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
    /(?:ETA|ARRIVAL DATE)\s*[:#]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
  ]);
  const invoiceDateRaw = firstMatch(compact, [
    /(?:INVOICE DATE|DATE OF INVOICE|ISSUE DATE)\s*[:#]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
    /(?:INVOICE DATE|DATE OF INVOICE|ISSUE DATE)\s*[:#]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
  ]);
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
  const size = firstMatch(compact.toUpperCase(), [/\b(20GP|20DV|20HC|20HQ|40GP|40DV|40HC|40HQ|45HQ)\b/]);
  const chargeLabels = ["Carrier Security Charge", "UK Lo-Lo(lift on-lift off) Charge", "DEST TRML HANDLG", "DEST. DOC FEE", "STORAGE CHARGE"];

  let finalVessel = vessel;
  let finalInvoiceNo = invoiceNo;
  let finalInvoiceDate = isoDate(invoiceDateRaw);
  let finalPort = port;
  let finalBlNo = blNo;
  let finalAmount = amountMatch?.[2] ?? "";
  let finalCurrency = currency;
  let chargeDetails = chargeLabels.filter((label) => compact.toUpperCase().includes(label.toUpperCase())).join("\n");

  if (isCosco) {
    finalInvoiceNo = firstMatch(compact, [
      /\b(\d{8,})\s*INVOICE\s*(?:NO\.?|NUMBER)/i,
      /(?:INVOICE\s*(?:NUMBER|NO\.?|#))\s*[:#]?\s*(\d{8,})/i,
    ]) || finalInvoiceNo;
    finalInvoiceDate = isoDate(firstMatch(compact, [
      /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s*ISSUE DATE/i,
      /ISSUE DATE\s*[:#]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
    ])) || finalInvoiceDate;
    finalVessel = firstMatch(compact, [
      /ARRIVED\/DEPARTED\s*\n?\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*([A-Z][A-Z ]+?\s+\d{2,4}[A-Z])(?:\s|$)/,
      /\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*([A-Z][A-Z ]+?\s+\d{2,4}[A-Z])\b/,
    ]).replace(/\s+/g, " ").trim() || finalVessel;
    finalPort = firstMatch(compact, [
      /PORT OF DISCHARGE[^\n]*\n\s*([A-Za-z][A-Za-z .'-]+?)\s+\1(?:[A-Z]|\s|$)/i,
      /PORT OF DISCHARGE\s*[:#]?\s*([A-Za-z][A-Za-z .'-]{2,30})/i,
    ]).split(/\s{2,}/)[0].trim() || finalPort;
    finalBlNo = firstMatch(compact, [
      /\b([A-Z]{2,6}\d{6,20}|\d{8,20})\s*(?:B\/L|BL)\s*(?:NO\.?|REFERENCE)/i,
      /(?:B\/L|BL)\s*(?:NO\.?|REFERENCE)?\s*[:#]?\s*([A-Z0-9-]{6,30})/i,
    ]) || finalBlNo;
    const due = compact.match(/\b(GBP|USD|EUR|CNY|RMB)\s*([\d,]+(?:\.\d{1,4})?)\s*AMOUNT DUE/i);
    if (due) { finalCurrency = due[1].toUpperCase(); finalAmount = due[2]; }
    chargeDetails = extractCoscoCharges(compact, finalCurrency) || chargeDetails;
  }

  return {
    vessel_name: finalVessel,
    voyage_no: "",
    eta: isoDate(etaRaw),
    invoice_no: finalInvoiceNo,
    invoice_date: finalInvoiceDate,
    owner_name: isCosco ? "COSCO SHIPPING Lines" : firstMatch(compact, [/(?:SHIPOWNER|OWNER|CARRIER)\s*[:#]?\s*([^\n]{3,50})/i]),
    owner_email: isCosco ? COSCO_EMAIL : firstMatch(compact, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]),
    port_of_discharge: finalPort,
    container_no: containers.join(", "),
    container_size: size,
    bl_no: finalBlNo,
    charge_details: chargeDetails,
    amount: finalAmount,
    currency: finalCurrency,
  };
}
