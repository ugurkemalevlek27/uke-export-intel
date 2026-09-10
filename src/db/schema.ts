// UKE Global - Export Intelligence & B2B Sales Platform
// Veritabani semasi (V1)
//
// Tasarim prensipleri (CLAUDE.md referans alinarak):
// - organizationId her tabloda var: ileride birden fazla musteri/sirket ayni sistemi
//   kullanabilir (multi-tenant), V1'de tek organizasyon olsa da yapi hazir.
// - Company (firma) kaydi projeden bagimsiz/ortak; ayni firma birden fazla projede
//   (farkli urun/ulke calismasinda) yer alabilir - lead score ve durum proje bazinda
//   companyProjects tablosunda tutulur.
// - Ham veri (tradeRecords) hicbir zaman silinmez/degistirilmez; sadece companyId ile
//   iliskilendirilir. Boylece kaynak veri her zaman izlenebilir kalir.
// - source/sourceFile/importBatchId gibi alanlarla veri kaynagi (provenance) korunur.

import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  numeric,
  integer,
  date,
  uniqueIndex,
  index,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Organizations & Users
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: varchar("role", { length: 50 }).default("admin").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Projects  (orn: "Boya - Gurcistan", "Ambalaj Filmleri - Kazakistan")
// ---------------------------------------------------------------------------

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "paused",
  "completed",
  "archived",
]);

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    targetCountries: text("target_countries").array(),
    hsCodes: text("hs_codes").array(),
    // --- Client workspace alanlari (Phase 1) ---
    // Hepsi nullable: mevcut projeler bozulmadan calismaya devam eder.
    clientName: text("client_name"), // orn: "ACC Ambalaj", "Coral Paints"
    productGroup: varchar("product_group", { length: 150 }), // orn: "Mattress Packaging"
    currency: varchar("currency", { length: 10 }).default("USD"),
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    status: projectStatusEnum("status").default("active").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("projects_org_idx").on(table.organizationId),
    orgStatusIdx: index("projects_org_status_idx").on(table.organizationId, table.status),
  })
);

// ---------------------------------------------------------------------------
// Companies  (global firma kaydi - projeden bagimsiz)
// ---------------------------------------------------------------------------

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(), // normalize edilmis goruntu adi
    rawNameVariants: text("raw_name_variants").array(), // veri kaynaginda gorulen farkli yazimlar
    country: varchar("country", { length: 100 }),
    city: varchar("city", { length: 100 }),
    website: text("website"),
    sector: varchar("sector", { length: 150 }),
    companyType: varchar("company_type", { length: 50 }), // Importer/Distributor/Manufacturer...
    possibleDuplicateOfId: integer("possible_duplicate_of_id"), // ayni tabloya kendine referans, ELLE onaylanmadan birlestirilmez
    source: varchar("source", { length: 255 }),
    sourceFile: varchar("source_file", { length: 255 }),
    importDate: timestamp("import_date"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("companies_name_idx").on(table.name),
    orgIdx: index("companies_org_idx").on(table.organizationId),
    orgCountryIdx: index("companies_org_country_idx").on(table.organizationId, table.country),
    dupIdx: index("companies_possible_duplicate_idx").on(table.possibleDuplicateOfId),
  })
);

// ---------------------------------------------------------------------------
// CompanyProjects  (bir firmanin BELIRLI bir projedeki lead skoru / CRM durumu)
// ---------------------------------------------------------------------------

export const leadStatusEnum = pgEnum("lead_status", [
  "yeni",
  "arastiriliyor",
  "karar_verici_bulundu",
  "ilk_temas",
  "follow_up",
  "ilgilendi",
  "katalog_gonderildi",
  "numune_talebi",
  "fiyat_talebi",
  "teklif_gonderildi",
  "pazarlik",
  "siparis_bekleniyor",
  "siparis_alindi",
  "uretim",
  "sevkiyat",
  "tahsilat",
  "tekrar_siparis",
  "kaybedildi",
  "beklemede",
  "uygun_degil",
]);

/** leadStatusEnum'dan turetilen tip - "as any" kullanmadan tip guvenli atama icin. */
export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];

/** Serbest metin bir degerin gecerli bir LeadStatus olup olmadigini dogrular. */
export function isLeadStatus(value: string): value is LeadStatus {
  return (leadStatusEnum.enumValues as readonly string[]).includes(value);
}

export const companyProjects = pgTable(
  "company_projects",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    leadScore: integer("lead_score"), // 0-100, aciklanabilir bkz. lib/scoring.ts
    leadScoreLabel: varchar("lead_score_label", { length: 50 }), // "Yuksek Potansiyel" vb.
    leadScoreBreakdown: text("lead_score_breakdown"), // JSON string: hangi faktor kac puan verdi
    leadStatus: leadStatusEnum("lead_status").default("yeni").notNull(),
    salesOwner: varchar("sales_owner", { length: 150 }),
    lastContactDate: date("last_contact_date"),
    nextFollowupDate: date("next_followup_date"),
    estimatedValueUsd: numeric("estimated_value_usd"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqCompanyProject: uniqueIndex("company_project_unique").on(
      table.companyId,
      table.projectId
    ),
    projectScoreIdx: index("company_projects_project_score_idx").on(
      table.projectId,
      table.leadScore
    ),
    projectStatusIdx: index("company_projects_project_status_idx").on(
      table.projectId,
      table.leadStatus
    ),
  })
);

// ---------------------------------------------------------------------------
// Contacts (karar vericiler)
// ---------------------------------------------------------------------------

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name"),
  position: varchar("position", { length: 150 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  linkedin: text("linkedin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Activities (CRM iletisim gecmisi)
// ---------------------------------------------------------------------------

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  companyProjectId: integer("company_project_id")
    .notNull()
    .references(() => companyProjects.id),
  activityType: varchar("activity_type", { length: 50 }), // email/linkedin/phone/whatsapp/meeting
  activityDate: timestamp("activity_date").defaultNow().notNull(),
  result: text("result"),
  notes: text("notes"),
  nextAction: text("next_action"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Import batches (her import islemi kayit altina alinir - madde 55)
// ---------------------------------------------------------------------------

export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  projectId: integer("project_id").references(() => projects.id),
  fileName: text("file_name").notNull(),
  uploadedBy: varchar("uploaded_by", { length: 150 }),
  rowCount: integer("row_count").default(0),
  successCount: integer("success_count").default(0),
  errorCount: integer("error_count").default(0),
  duplicateCount: integer("duplicate_count").default(0),
  status: varchar("status", { length: 30 }).default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Trade records (sevkiyat/islem seviyesi ham ticaret verisi - Trade Intelligence)
// ---------------------------------------------------------------------------

export const tradeRecords = pgTable(
  "trade_records",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: integer("project_id").references(() => projects.id),
    companyId: integer("company_id").references(() => companies.id), // ithalatci, coz uldukten sonra baglanir
    hsCode: varchar("hs_code", { length: 20 }).notNull(),
    hsCode2: varchar("hs_code_2", { length: 2 }),
    hsCode4: varchar("hs_code_4", { length: 4 }),
    hsCode6: varchar("hs_code_6", { length: 6 }),
    exporterNameRaw: text("exporter_name_raw"),
    exporterCountry: varchar("exporter_country", { length: 100 }),
    importerNameRaw: text("importer_name_raw").notNull(),
    importerCountry: varchar("importer_country", { length: 100 }),
    transactionDate: date("transaction_date"),
    productDescription: text("product_description"), // bos ise "Not Available"
    unit: varchar("unit", { length: 50 }), // bos ise "Not Available"
    valueUsd: numeric("value_usd").notNull(),
    quantity: numeric("quantity"),
    weightMt: numeric("weight_mt"),
    shipments: integer("shipments").default(1),
    sourceFile: varchar("source_file", { length: 255 }),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
    isDataQualityFlagged: boolean("is_data_quality_flagged").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // --- Mevcut (V1) indexler: korunuyor ---
    hsIdx: index("trade_hs_idx").on(table.hsCode),
    companyIdx: index("trade_company_idx").on(table.companyId),
    dateIdx: index("trade_date_idx").on(table.transactionDate),
    orgIdx: index("trade_org_idx").on(table.organizationId),

    // --- Phase 1: composite indexler ---
    // Her analiz sorgusu organization_id + project_id ile scope edildigi icin
    // bu ikili neredeyse tum WHERE'lerin basinda yer aliyor.
    orgProjectIdx: index("trade_org_project_idx").on(table.organizationId, table.projectId),
    orgProjectDateIdx: index("trade_org_project_date_idx").on(
      table.organizationId,
      table.projectId,
      table.transactionDate
    ),
    orgImporterCountryIdx: index("trade_org_importer_country_idx").on(
      table.organizationId,
      table.importerCountry
    ),
    orgExporterCountryIdx: index("trade_org_exporter_country_idx").on(
      table.organizationId,
      table.exporterCountry
    ),
    orgHs4Idx: index("trade_org_hs4_idx").on(table.organizationId, table.hsCode4),
    orgHs6Idx: index("trade_org_hs6_idx").on(table.organizationId, table.hsCode6),
    // Tedarikci/rakip analizi exporter_name_raw uzerinde grupluyor - V1'de hic index yoktu.
    exporterNameIdx: index("trade_exporter_name_idx").on(table.exporterNameRaw),
    companyProjectIdx: index("trade_company_project_idx").on(table.companyId, table.projectId),
    batchIdx: index("trade_batch_idx").on(table.importBatchId),
  })
);
