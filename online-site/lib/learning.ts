import type { ExtractedFields, LearningExampleRow } from "./types";

type FieldName = keyof ExtractedFields;

type StoredLearning = {
  version: 2;
  rawText: string;
  fields: Partial<ExtractedFields>;
  confirmedFields: FieldName[];
};

const LEARNING_FIELDS: FieldName[] = [
  "vessel_name", "voyage_no", "eta", "invoice_no", "invoice_date",
  "owner_name", "owner_email", "port_of_discharge", "container_no",
  "container_size", "bl_no", "amount", "currency",
];

const STABLE_FIELDS = new Set<FieldName>(["owner_name", "owner_email"]);

const FIELD_LABELS: Record<FieldName, string> = {
  vessel_name: "船名",
  voyage_no: "航次",
  eta: "ETA",
  invoice_no: "账单号",
  invoice_date: "账单日期",
  owner_name: "船东",
  owner_email: "船东邮箱",
  port_of_discharge: "卸货港",
  container_no: "集装箱号",
  container_size: "箱型",
  bl_no: "B/L",
  charge_details: "费用明细",
  amount: "金额",
  currency: "币种",
};

export function documentTemplateSignature(text: string) {
  return nonEmptyLines(text).slice(0, 240).map(templateLineSignature).join("\n");
}

export function createLearningRecord(rawText: string, fields: ExtractedFields) {
  const confirmedFields = LEARNING_FIELDS.filter((field) => {
    const value = fields[field]?.trim();
    return Boolean(value) && (STABLE_FIELDS.has(field) || locateValue(field, value, rawText) !== null);
  });
  const payload: StoredLearning = {
    version: 2,
    rawText: rawText.slice(0, 100_000),
    fields: Object.fromEntries(LEARNING_FIELDS.map((field) => [field, fields[field]])),
    confirmedFields,
  };
  return {
    templateSignature: documentTemplateSignature(rawText),
    fieldsJson: JSON.stringify(payload),
  };
}

export function applyLearnedCorrections(
  text: string,
  extracted: ExtractedFields,
  examples: LearningExampleRow[],
) {
  if (!text.trim() || !examples.length) return { fields: extracted, note: "" };
  const signature = documentTemplateSignature(text);
  const scored = examples.flatMap((example) => {
    const stored = readStoredLearning(example);
    const owner = ownerFamily(stored.fields.owner_name || "");
    const extractedOwner = ownerFamily(extracted.owner_name || "");
    if (owner && extractedOwner && owner !== extractedOwner) return [];
    const exampleSignature = normalizeStoredSignature(example.template_signature);
    return [{ example, stored, score: templateSimilarity(signature, exampleSignature) }];
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.6) return { fields: extracted, note: "" };

  const fields = { ...extracted };
  const learned: string[] = [];
  for (const field of best.stored.confirmedFields) {
    const correctedValue = best.stored.fields[field]?.trim() || "";
    const learnedValue = inferValue(field, correctedValue, best.stored.rawText, text);
    if (learnedValue === null || comparable(field, fields[field]) === comparable(field, learnedValue)) continue;
    fields[field] = learnedValue;
    learned.push(FIELD_LABELS[field]);
  }
  if (!learned.length) return { fields, note: "" };
  return {
    fields,
    note: `已参考相似账单“${best.example.source_filename}”自动填写：${learned.join("、")}（版式相似度 ${Math.round(best.score * 100)}%），请继续核对。`,
  };
}

function readStoredLearning(example: LearningExampleRow): StoredLearning {
  try {
    const value = JSON.parse(example.fields_json) as StoredLearning | Partial<ExtractedFields>;
    if ("version" in value && value.version === 2) return value as StoredLearning;
    const fields = value as Partial<ExtractedFields>;
    return {
      version: 2,
      rawText: example.template_signature,
      fields,
      confirmedFields: LEARNING_FIELDS.filter((field) => Boolean(fields[field])),
    };
  } catch {
    return { version: 2, rawText: example.template_signature, fields: {}, confirmedFields: [] };
  }
}

function normalizeStoredSignature(value: string) {
  return value.includes("<CONTAINER>") || value.includes("<N>")
    ? value
    : documentTemplateSignature(value);
}

function templateLineSignature(line: string) {
  return clean(line).toUpperCase()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<EMAIL>")
    .replace(/\b[A-Z]{4}\s*\d{7}\b/g, "<CONTAINER>")
    .replace(/\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+\d{4}\b/g, "<DATE>")
    .replace(/\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/g, "<DATE>")
    .replace(/\d[\d,.]*/g, "<N>")
    .replace(/\s+/g, " ")
    .trim();
}

function templateSimilarity(first: string, second: string) {
  const firstLines = first.split("\n").filter(Boolean);
  const secondLines = second.split("\n").filter(Boolean);
  if (!firstLines.length || !secondLines.length) return 0;
  const lineScore = jaccard(new Set(firstLines), new Set(secondLines));
  const firstPairs = new Set(firstLines.slice(0, -1).map((line, index) => `${line}\u0000${firstLines[index + 1]}`));
  const secondPairs = new Set(secondLines.slice(0, -1).map((line, index) => `${line}\u0000${secondLines[index + 1]}`));
  const pairScore = jaccard(firstPairs, secondPairs);
  return lineScore * 0.72 + pairScore * 0.28;
}

function jaccard(first: Set<string>, second: Set<string>) {
  if (!first.size && !second.size) return 1;
  let intersection = 0;
  for (const value of first) if (second.has(value)) intersection += 1;
  return intersection / (first.size + second.size - intersection || 1);
}

function inferValue(field: FieldName, correctedValue: string, oldText: string, newText: string): string | null {
  if (!correctedValue) return "";
  if (STABLE_FIELDS.has(field)) return correctedValue;
  const location = locateValue(field, correctedValue, oldText);
  if (!location) return null;
  const oldLines = nonEmptyLines(oldText);
  const newLines = nonEmptyLines(newText);
  const line = bestMatchingLine(oldLines, newLines, location.lineIndex);
  const candidates = fieldCandidates(field, line);
  if (!candidates.length) return null;
  const candidate = candidates[Math.min(location.candidateIndex, candidates.length - 1)];
  return normalizeLearnedValue(field, candidate);
}

function locateValue(field: FieldName, value: string, text: string) {
  const expected = comparable(field, value);
  if (!expected) return null;
  const lines = nonEmptyLines(text);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const candidates = fieldCandidates(field, lines[lineIndex]);
    const candidateIndex = candidates.findIndex((candidate) => comparable(field, candidate) === expected);
    if (candidateIndex >= 0) return { lineIndex, candidateIndex };
  }
  return null;
}

function bestMatchingLine(oldLines: string[], newLines: string[], oldIndex: number) {
  if (!newLines.length) return "";
  const expectedIndex = Math.round(oldIndex * Math.max(newLines.length - 1, 0) / Math.max(oldLines.length - 1, 1));
  const signature = templateLineSignature(oldLines[oldIndex] || "");
  let best = newLines[Math.min(expectedIndex, newLines.length - 1)];
  let bestScore = -Infinity;
  for (let index = 0; index < newLines.length; index += 1) {
    const candidateSignature = templateLineSignature(newLines[index]);
    const tokens = jaccard(new Set(signature.split(" ")), new Set(candidateSignature.split(" ")));
    const exactBonus = signature === candidateSignature ? 1 : 0;
    const distancePenalty = Math.abs(index - expectedIndex) / Math.max(newLines.length, 1) * 0.2;
    const score = tokens + exactBonus - distancePenalty;
    if (score > bestScore) { bestScore = score; best = newLines[index]; }
  }
  return best;
}

function fieldCandidates(field: FieldName, line: string) {
  const patterns: Partial<Record<FieldName, RegExp[]>> = {
    vessel_name: [
      /\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*([A-Z][A-Z .'&/-]{3,}\s+\d{2,4}[A-Z])\b/gi,
      /(?:VESSEL(?:\s*NAME)?|VSL)\s*[:#-]?\s*([A-Z][A-Z0-9 .'&/-]{3,})/gi,
    ],
    voyage_no: [/\b\d{2,4}[A-Z]\b/gi],
    eta: [datePattern(), wordDatePattern()],
    invoice_date: [datePattern(), wordDatePattern()],
    invoice_no: [/\b\d{6,}\b/g, /\b[A-Z]{1,8}[-/]?\d[A-Z0-9/._-]{3,}\b/gi],
    port_of_discharge: [/(?:PORT OF DISCHARGE|DISCHARGE PORT)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,40})/gi],
    owner_email: [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
    container_no: [/\b[A-Z]{4}\s*\d{7}\b/gi],
    container_size: [/\b(?:20|40|45)(?:HQ|HC|GP|DV|RF|OT|FR)\b/gi],
    bl_no: [/\b[A-Z]{2,8}[-/]?\d[A-Z0-9/._-]{5,}\b/gi, /\b\d{7,}\b/g],
    amount: [/\d[\d,]*\.\d{1,4}/g],
    currency: [/\b(?:GBP|USD|EUR|CNY|RMB|HKD|AUD|CAD)\b/gi],
  };
  const result: string[] = [];
  for (const pattern of patterns[field] || []) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const value = clean(match[1] || match[0]);
      if (value && !result.includes(value)) result.push(value);
    }
  }
  if (field === "port_of_discharge" && /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(line) && !result.includes(clean(line))) {
    result.push(clean(line));
  }
  return result;
}

function datePattern() { return /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/g; }
function wordDatePattern() { return /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/gi; }

function comparable(field: FieldName, value: string) {
  const cleaned = clean(value);
  if (field === "eta" || field === "invoice_date") return normalizeDate(cleaned);
  if (field === "amount") return cleaned.replace(/,/g, "").replace(/\.0+$/, "");
  return cleaned.replace(/\s+/g, "").toUpperCase();
}

function normalizeLearnedValue(field: FieldName, value: string) {
  const cleaned = clean(value);
  if (field === "eta" || field === "invoice_date") return normalizeDate(cleaned);
  if (field === "container_no") return cleaned.replace(/\s+/g, "").toUpperCase();
  if (field === "currency") return cleaned.toUpperCase();
  if (field === "amount") return cleaned.replace(/,/g, "");
  return cleaned.replace(/\s+/g, " ");
}

function normalizeDate(value: string) {
  let match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  match = value.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (match) {
    const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(match[2].slice(0, 3).toUpperCase()) + 1;
    if (month > 0) return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return value;
}

function ownerFamily(value: string) {
  const upper = value.toUpperCase();
  if (upper.includes("COSCO")) return "COSCO";
  if (upper.includes("MAERSK")) return "MAERSK";
  if (upper.includes("MSC") || upper.includes("MEDITERRANEAN SHIPPING")) return "MSC";
  if (upper.includes("CMA CGM")) return "CMA CGM";
  if (upper.includes("EVERGREEN")) return "EVERGREEN";
  return "";
}

function nonEmptyLines(text: string) { return text.split(/\r?\n/).map(clean).filter(Boolean); }
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
