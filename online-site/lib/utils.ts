import type { InvoiceRow } from "./types";

export const COSCO_EMAIL = "Releases@coscoshipping.co.uk";

export function normalizeInvoiceNo(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function splitContainers(value: string) {
  return Array.from(new Set((value.toUpperCase().match(/[A-Z]{4}\d{7}/g) ?? []).map((part) => part.trim())));
}

export function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function extensionDays(lastFreeDay: string, pickupDate: string) {
  if (!lastFreeDay || !pickupDate) return 0;
  const start = Date.parse(`${lastFreeDay}T00:00:00Z`);
  const end = Date.parse(`${pickupDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function amountNumber(value: string) {
  const parsed = Number.parseFloat((value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function totals(invoices: InvoiceRow[]) {
  const map = new Map<string, number>();
  for (const invoice of invoices) {
    if (!invoice.currency || !invoice.amount) continue;
    map.set(invoice.currency, (map.get(invoice.currency) ?? 0) + amountNumber(invoice.amount));
  }
  return Array.from(map, ([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
}

export function isCosco(owner: string) {
  return /COSCO/i.test(owner);
}

export function safeFilename(value: string) {
  return value.replace(/[\\/\0]/g, "_").replace(/[^\p{L}\p{N}._()\- ]/gu, "_").slice(0, 180) || "file";
}

export function queryUrl(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `${path}?${query.toString()}`;
}
