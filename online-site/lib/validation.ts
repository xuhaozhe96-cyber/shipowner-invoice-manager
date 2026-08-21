import type { ExtractedFields } from "./types";
import { splitContainers } from "./utils";

const ISO_LETTER_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

export function validateExtractedFields(fields: ExtractedFields) {
  const warnings: string[] = [];
  if (!fields.vessel_name) warnings.push("没有识别到船名");
  if (/VOYAGE\s+BOUND\s+ARRIVED|PORT OF DISCHARGE|INVOICE/i.test(fields.vessel_name)) warnings.push("船名看起来像账单标题");
  if (!fields.invoice_no) warnings.push("没有识别到账单号");
  if (!fields.container_no) warnings.push("没有识别到集装箱号");
  for (const container of splitContainers(fields.container_no)) {
    if (!isValidContainerNumber(container)) warnings.push(`集装箱号 ${container} 未通过校验位检查`);
  }
  if (!fields.amount) warnings.push("没有识别到总金额");
  else if (!Number.isFinite(Number(fields.amount.replace(/,/g, "")))) warnings.push("总金额格式异常");
  if (fields.amount && !fields.currency) warnings.push("识别到金额但没有识别到币种");
  const chargeTotal = totalChargeAmounts(fields.charge_details);
  const amount = Number(fields.amount.replace(/,/g, ""));
  if (chargeTotal !== null && Number.isFinite(amount) && Math.abs(chargeTotal - amount) > 0.02) {
    warnings.push(`费用明细合计 ${chargeTotal.toFixed(2)} 与总金额 ${amount.toFixed(2)} 不一致`);
  }
  return warnings;
}

export function isValidContainerNumber(value: string) {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(normalized)) return false;
  let total = 0;
  for (let index = 0; index < 10; index += 1) {
    const character = normalized[index];
    const numeric = /\d/.test(character) ? Number(character) : ISO_LETTER_VALUES[character];
    total += numeric * (2 ** index);
  }
  return (total % 11) % 10 === Number(normalized[10]);
}

function totalChargeAmounts(details: string) {
  const lines = details.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const values = lines.map((line) => line.match(/(?:GBP|USD|EUR|CNY|RMB|HKD|AUD|CAD|[£$€¥])\s*([\d,]+(?:\.\d{1,4})?)\s*$/i));
  if (values.some((match) => !match)) return null;
  return values.reduce((sum, match) => sum + Number(match?.[1].replace(/,/g, "") || 0), 0);
}
