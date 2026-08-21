import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceFilename: text("source_filename").notNull(),
  fileKey: text("file_key").notNull().default(""),
  rawText: text("raw_text").notNull().default(""),
  extractionWarning: text("extraction_warning").notNull().default(""),
  learningNote: text("learning_note").notNull().default(""),
  invoiceCategory: text("invoice_category").notNull().default("freight"),
  vesselName: text("vessel_name").notNull().default(""),
  voyageNo: text("voyage_no").notNull().default(""),
  eta: text("eta").notNull().default(""),
  invoiceNo: text("invoice_no").notNull().default(""),
  invoiceNoKey: text("invoice_no_key").notNull().default(""),
  invoiceDate: text("invoice_date").notNull().default(""),
  ownerName: text("owner_name").notNull().default(""),
  ownerEmail: text("owner_email").notNull().default(""),
  portOfDischarge: text("port_of_discharge").notNull().default(""),
  containerNo: text("container_no").notNull().default(""),
  containerSize: text("container_size").notNull().default(""),
  blNo: text("bl_no").notNull().default(""),
  chargeDetails: text("charge_details").notNull().default(""),
  amount: text("amount").notNull().default(""),
  currency: text("currency").notNull().default(""),
  status: text("status").notNull().default("待校正"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_invoices_vessel_owner").on(table.vesselName, table.ownerName),
  index("idx_invoices_eta_vessel").on(table.eta, table.vesselName),
  uniqueIndex("idx_invoices_invoice_no_key").on(table.invoiceNoKey).where(sql`${table.invoiceNoKey} <> ''`),
]);

export const vesselArchives = sqliteTable("vessel_archives", {
  vesselName: text("vessel_name").primaryKey(),
  archivedAt: text("archived_at").notNull(),
});

export const containerReleases = sqliteTable("container_releases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vesselName: text("vessel_name").notNull(),
  ownerName: text("owner_name").notNull().default(""),
  containerNo: text("container_no").notNull(),
  released: integer("released").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_container_release_unique").on(table.vesselName, table.ownerName, table.containerNo)]);

export const containerFreeDays = sqliteTable("container_free_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vesselName: text("vessel_name").notNull(),
  ownerName: text("owner_name").notNull().default(""),
  containerNo: text("container_no").notNull(),
  lastFreeDay: text("last_free_day").notNull().default(""),
  pickupDate: text("pickup_date").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_container_free_day_unique").on(table.vesselName, table.ownerName, table.containerNo)]);

export const paymentProofs = sqliteTable("payment_proofs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vesselName: text("vessel_name").notNull(),
  ownerName: text("owner_name").notNull().default(""),
  paymentDate: text("payment_date").notNull().default(""),
  sourceFilename: text("source_filename").notNull(),
  fileKey: text("file_key").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_payment_proofs_vessel_owner").on(table.vesselName, table.ownerName)]);

export const emailDrafts = sqliteTable("email_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftType: text("draft_type").notNull(),
  vesselName: text("vessel_name").notNull(),
  ownerName: text("owner_name").notNull().default(""),
  ownerEmail: text("owner_email").notNull().default(""),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_email_draft_unique").on(table.draftType, table.vesselName, table.ownerName, table.ownerEmail)]);

export const learningExamples = sqliteTable("learning_examples", {
  invoiceId: integer("invoice_id").primaryKey(),
  sourceFilename: text("source_filename").notNull().default(""),
  templateSignature: text("template_signature").notNull().default(""),
  fieldsJson: text("fields_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
