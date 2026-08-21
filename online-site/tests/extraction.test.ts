import assert from "node:assert/strict";
import test from "node:test";

import { extractFields } from "../lib/extract";
import { applyLearnedCorrections, createLearningRecord } from "../lib/learning";
import type { LearningExampleRow } from "../lib/types";
import { isValidContainerNumber, validateExtractedFields } from "../lib/validation";

function coscoText(values: { invoice: string; vessel: string; container: string; bl: string }) {
  return `
COSCO SHIPPING Lines (UK) Limited
${values.invoice} INVOICE NO.
31 July 2026 ISSUE DATE
ARRIVED/DEPARTED
04 August 2026 ${values.vessel}
PORT OF DISCHARGE
Felixstowe FelixstoweX
${values.container} 40HQ
${values.bl} BL REFERENCE
0.00
Carrier Security Charge
UK Lo-Lo(lift on-lift off) Charge
DEST TRML HANDLG
DEST. DOC FEE
SUB-TOTAL
GBP
GBP
GBP
GBP
0%
0%
0%
0%
1.50
80.00
189.00
35.00
GBP 305.50AMOUNT DUE
`;
}

test("COSCO reverse-column layout extracts the confirmed invoice fields", () => {
  const fields = extractFields(coscoText({
    invoice: "3106910924",
    vessel: "XIN LIAN YUN GANG 009W",
    container: "OOCU8098321",
    bl: "COSU9507672050",
  }));
  assert.equal(fields.vessel_name, "XIN LIAN YUN GANG 009W");
  assert.equal(fields.invoice_no, "3106910924");
  assert.equal(fields.invoice_date, "2026-07-31");
  assert.equal(fields.owner_name, "COSCO SHIPPING Lines");
  assert.equal(fields.port_of_discharge, "Felixstowe");
  assert.equal(fields.container_no, "OOCU8098321");
  assert.equal(fields.container_size, "40HQ");
  assert.equal(fields.bl_no, "COSU9507672050");
  assert.equal(fields.amount, "305.50");
  assert.equal(fields.currency, "GBP");
  assert.match(fields.charge_details, /Carrier Security Charge \| £1.5/);
  assert.match(fields.charge_details, /DEST TRML HANDLG \| £189/);
  assert.deepEqual(validateExtractedFields(fields), []);
});

test("container numbers use the ISO 6346 check digit as a warning", () => {
  assert.equal(isValidContainerNumber("OOCU8098321"), true);
  assert.equal(isValidContainerNumber("OOCU8098322"), false);
});

test("a corrected layout teaches changing values instead of copying the previous invoice", () => {
  const oldText = coscoText({ invoice: "3106910924", vessel: "XIN LIAN YUN GANG 009W", container: "OOCU8098321", bl: "COSU9507672050" });
  const oldFields = extractFields(oldText);
  const saved = createLearningRecord(oldText, oldFields);
  const example: LearningExampleRow = {
    invoice_id: 1,
    source_filename: "corrected-cosco.pdf",
    template_signature: saved.templateSignature,
    fields_json: saved.fieldsJson,
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
  };
  const newText = coscoText({ invoice: "3106910999", vessel: "COSCO SHIPPING STAR 028W", container: "CSNU6423674", bl: "COSU9507538200" });
  const incomplete = { ...extractFields(newText), vessel_name: "", invoice_no: "", owner_name: "Security Charge", owner_email: "wrong@example.com", container_no: "", bl_no: "", amount: "" };
  const learned = applyLearnedCorrections(newText, incomplete, [example]);
  assert.equal(learned.fields.vessel_name, "COSCO SHIPPING STAR 028W");
  assert.equal(learned.fields.invoice_no, "3106910999");
  assert.equal(learned.fields.container_no, "CSNU6423674");
  assert.equal(learned.fields.bl_no, "COSU9507538200");
  assert.equal(learned.fields.amount, "305.50");
  assert.equal(learned.fields.owner_name, "COSCO SHIPPING Lines");
  assert.equal(learned.fields.owner_email, "Releases@coscoshipping.co.uk");
  assert.doesNotMatch(learned.note, /3106910924|OOCU8098321/);
});
