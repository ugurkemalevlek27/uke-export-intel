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
  jsonb,
  bigint,
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
    clientKey: varchar("client_key", { length: 100 }),
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
    /**
     * Bu firma baska bir firmayla BIRLESTIRILDIYSE hedef firmanin id'si.
     * Kayit SILINMEZ; mezar tasi olarak kalir ve listelerde gosterilmez.
     * Boylece yanlis birlestirme geri alinabilir ve gecmis izlenebilir kalir.
     */
    mergedIntoId: integer("merged_into_id"),
    mergedAt: timestamp("merged_at"),
    mergedBy: integer("merged_by"),
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
    mergedIdx: index("companies_merged_idx").on(table.mergedIntoId),
  })
);

// ---------------------------------------------------------------------------
// CompanyProjects  (bir firmanin BELIRLI bir projedeki lead skoru / CRM durumu)
// ---------------------------------------------------------------------------

export const leadStatusEnum = pgEnum("lead_status", [
  "linkedin_eklendi",
  "numune_gonderildi",
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

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    // organizationId savunma derinligi icin eklendi: kisi sorgulari yalnizca
    // companyId join'ine guvenmek yerine dogrudan organizasyonla sinirlanabilir.
    organizationId: integer("organization_id").references(() => organizations.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name"),
    position: varchar("position", { length: 150 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    whatsapp: varchar("whatsapp", { length: 50 }),
    linkedin: text("linkedin"),
    isPrimary: boolean("is_primary").default(false),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index("contacts_company_idx").on(table.companyId),
    orgIdx: index("contacts_org_idx").on(table.organizationId),
  })
);

// ---------------------------------------------------------------------------
// Activities (CRM iletisim gecmisi)
// ---------------------------------------------------------------------------

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    companyProjectId: integer("company_project_id")
      .notNull()
      .references(() => companyProjects.id),
    contactId: integer("contact_id").references(() => contacts.id),
    createdBy: integer("created_by").references(() => users.id),
    activityType: varchar("activity_type", { length: 50 }), // email/linkedin/phone/whatsapp/meeting/note
    activityDate: timestamp("activity_date").defaultNow().notNull(),
    result: text("result"),
    notes: text("notes"),
    nextAction: text("next_action"),
    nextFollowupDate: date("next_followup_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    externalEventId: varchar("external_event_id", { length: 255 }),
  },
  (table) => ({
    companyProjectIdx: index("activities_company_project_idx").on(
      table.companyProjectId,
      table.activityDate
    ),
    followupIdx: index("activities_followup_idx").on(table.nextFollowupDate),
  })
);

// ---------------------------------------------------------------------------
// Integration events & review queue
// ---------------------------------------------------------------------------

export const communicationAccounts = pgTable("communication_accounts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  clientId: varchar("client_id", { length: 100 }).notNull(),
  channel: text("channel").notNull(), provider: text("provider").notNull(),
  address: text("address").notNull(), credentialPrefix: text("credential_prefix").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  hourlyLimit: integer("hourly_limit").default(30).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({ addressUnique: uniqueIndex("communication_accounts_address_unique").on(table.channel, table.provider, table.address) }));

export const communicationPermissions = pgTable("communication_permissions", {
  userId: integer("user_id").references(() => users.id),
  accountId: integer("account_id").notNull().references(() => communicationAccounts.id),
  address: text("address").notNull(), allowed: boolean("allowed").default(false).notNull(),
  aiAllowed: boolean("ai_allowed").default(false).notNull(),
}, table => ({ unique: uniqueIndex("communication_permissions_unique").on(table.accountId, table.address) }));

export const communicationSuppressions = pgTable("communication_suppressions", {
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  clientId: varchar("client_id", { length: 100 }).notNull(), channel: text("channel").notNull(),
  address: text("address").notNull(), reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({ unique: uniqueIndex("communication_suppressions_unique").on(table.organizationId, table.clientId, table.channel, table.address) }));

export const communicationMessages = pgTable("communication_messages", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: integer("account_id").notNull().references(() => communicationAccounts.id),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  clientId: varchar("client_id", { length: 100 }).notNull(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  leadId: integer("lead_id").references(() => companyProjects.id),
  contactId: integer("contact_id").references(() => contacts.id),
  externalEventId: text("external_event_id").notNull(), payloadHash: text("payload_hash").notNull(),
  providerMessageId: text("provider_message_id"), threadId: text("thread_id"),
  direction: text("direction").notNull(), address: text("address").notNull(),
  subject: text("subject"), body: text("body"), status: text("status").notNull(),
  reviewReason: text("review_reason"), activityId: integer("activity_id").references(() => activities.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  eventUnique: uniqueIndex("communication_messages_event_unique").on(table.accountId, table.externalEventId),
  threads: index("communication_threads_idx").on(table.accountId, table.threadId),
  provider: index("communication_provider_idx").on(table.accountId, table.providerMessageId),
  review: index("communication_review_idx").on(table.organizationId, table.projectId, table.status),
}));

export const communicationNonces = pgTable("communication_nonces", {
  accountId: integer("account_id").notNull().references(() => communicationAccounts.id),
  nonce: text("nonce").notNull(), externalEventId: text("external_event_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({ unique: uniqueIndex("communication_nonces_unique").on(table.accountId, table.nonce) }));

export const whatsappAssistantResults = pgTable("whatsapp_assistant_results", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  messageId: bigint("message_id", { mode: "number" }).notNull().unique().references(() => communicationMessages.id),
  userId: integer("user_id").notNull().references(() => users.id),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  action: text("action").notNull(), reply: text("reply").notNull(),
  deliveryStatus: text("delivery_status").default("configuration_required").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    clientId: varchar("client_id", { length: 100 }).notNull(),
    projectId: integer("project_id").notNull(),
    leadId: integer("lead_id").notNull(),
    contactId: integer("contact_id").notNull(),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    nonce: varchar("nonce", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 30 }).default("received").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    activityId: integer("activity_id").references(() => activities.id),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventUnique: uniqueIndex("integration_events_org_external_unique").on(table.organizationId, table.externalEventId),
    nonceUnique: uniqueIndex("integration_events_org_nonce_unique").on(table.organizationId, table.nonce),
    statusIdx: index("integration_events_status_idx").on(table.status, table.createdAt),
  })
);

export const integrationReviewQueue = pgTable(
  "integration_review_queue",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    integrationEventId: bigint("integration_event_id", { mode: "number" }).notNull().references(() => integrationEvents.id),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 30 }).default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    eventUnique: uniqueIndex("integration_review_event_unique").on(table.integrationEventId),
    pendingIdx: index("integration_review_pending_idx").on(table.organizationId, table.status, table.createdAt),
  })
);

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
  /** Ayni icerige sahip oldugu icin ATLANAN sevkiyat sayisi (Phase 4) */
  skippedDuplicateCount: integer("skipped_duplicate_count").default(0),
  /** Sihirbazda kullanilan sutun eslesmesi (JSON) - izlenebilirlik icin */
  columnMapping: text("column_mapping"),
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
    /**
     * Kaydi benzersiz kilan alanlardan uretilen icerik hash'i (bkz. lib/rowHash.ts).
     * Ayni dosyanin ikinci kez yuklenmesi durumunda tekrar eden sevkiyatlari
     * tespit etmek icin kullanilir.
     */
    rowHash: varchar("row_hash", { length: 32 }),
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
    rowHashIdx: index("trade_row_hash_idx").on(table.organizationId, table.rowHash),
  })
);


// ---------------------------------------------------------------------------
// Login denemeleri (giris hiz siniri - Phase 4/5 guvenlik)
// ---------------------------------------------------------------------------

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    /** E-posta (kucuk harfe cevrilmis). IP degil: uygulama proxy arkasinda. */
    identifier: varchar("identifier", { length: 255 }).notNull(),
    attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
    success: boolean("success").default(false).notNull(),
  },
  (table) => ({
    idx: index("login_attempts_idx").on(table.identifier, table.attemptedAt),
  })
);
