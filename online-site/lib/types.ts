export type InvoiceRow = {
  id: number;
  source_filename: string;
  file_key: string;
  raw_text: string;
  extraction_warning: string;
  learning_note: string;
  invoice_category: string;
  vessel_name: string;
  voyage_no: string;
  eta: string;
  invoice_no: string;
  invoice_no_key: string;
  invoice_date: string;
  owner_name: string;
  owner_email: string;
  port_of_discharge: string;
  container_no: string;
  container_size: string;
  bl_no: string;
  charge_details: string;
  amount: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FreeDayRow = {
  id: number;
  vessel_name: string;
  owner_name: string;
  container_no: string;
  last_free_day: string;
  pickup_date: string;
  updated_at: string;
};

export type ReleaseRow = {
  id: number;
  vessel_name: string;
  owner_name: string;
  container_no: string;
  released: number;
  updated_at: string;
};

export type PaymentProofRow = {
  id: number;
  vessel_name: string;
  owner_name: string;
  payment_date: string;
  source_filename: string;
  file_key: string;
  content_type: string;
  created_at: string;
};

export type EmailDraftRow = {
  id: number;
  draft_type: string;
  vessel_name: string;
  owner_name: string;
  owner_email: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type ExtractedFields = Pick<InvoiceRow,
  "vessel_name" | "voyage_no" | "eta" | "invoice_no" | "invoice_date" |
  "owner_name" | "owner_email" | "port_of_discharge" | "container_no" |
  "container_size" | "bl_no" | "charge_details" | "amount" | "currency"
>;
