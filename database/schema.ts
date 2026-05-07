import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  json,
  mysqlEnum,
  uniqueIndex,
  index,
  date,
} from "drizzle-orm/mysql-core";

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const organizations = mysqlTable("organizations", {
  id:        int("id").autoincrement().primaryKey(),
  name:      varchar("name", { length: 255 }).notNull(),
  domain:    varchar("domain", { length: 255 }),
  ownerId:   int("ownerId"),
  sector:    varchar("sector", { length: 100 }),
  size:      mysqlEnum("size", ["10-50", "50-250", "250+"]),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = mysqlTable(
  "users",
  {
    id:             int("id").autoincrement().primaryKey(),
    email:          varchar("email", { length: 255 }).notNull(),
    name:           varchar("name", { length: 255 }),
    passwordHash:   varchar("passwordHash", { length: 255 }),
    role:           mysqlEnum("role", ["admin", "member"]).notNull().default("member"),
    organizationId: int("organizationId"),
    openId:         varchar("openId", { length: 255 }),
    createdAt:      timestamp("createdAt").notNull().defaultNow(),
    updatedAt:      timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_email").on(t.email)]
);

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id:               int("id").autoincrement().primaryKey(),
    organizationId:   int("organizationId").notNull(),
    plan:             mysqlEnum("plan", ["free", "pro", "mssp"]).notNull().default("free"),
    stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
    stripeSubId:      varchar("stripeSubId", { length: 255 }),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    cancelAt:         timestamp("cancelAt"),
    createdAt:        timestamp("createdAt").notNull().defaultNow(),
    updatedAt:        timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_org").on(t.organizationId),
    index("idx_stripe_sub").on(t.stripeSubId),
  ]
);

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export const scans = mysqlTable(
  "scans",
  {
    id:             int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    target:         varchar("target", { length: 255 }).notNull(),
    mode:           mysqlEnum("mode", ["sme", "supply"]).notNull().default("sme"),
    status:         mysqlEnum("status", ["pending", "running", "completed", "failed"])
                      .notNull()
                      .default("pending"),
    batchId:        varchar("batchId", { length: 36 }),
    startedAt:      timestamp("startedAt"),
    completedAt:    timestamp("completedAt"),
    results:        json("results").$type<Record<string, any>>(),
    createdAt:      timestamp("createdAt").notNull().defaultNow(),
    updatedAt:      timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_org_status").on(t.organizationId, t.status),
    index("idx_org_created").on(t.organizationId, t.createdAt),
    index("idx_batch").on(t.batchId),
  ]
);

// ---------------------------------------------------------------------------
// Vulnerabilities
// ---------------------------------------------------------------------------

export const vulnerabilities = mysqlTable(
  "vulnerabilities",
  {
    id:                int("id").autoincrement().primaryKey(),
    scanId:            int("scanId").notNull(),
    organizationId:    int("organizationId").notNull(),
    cveId:             varchar("cveId", { length: 50 }).notNull(),
    severity:          mysqlEnum("severity", ["critical", "high", "medium", "low"]).notNull(),
    cvssScore:         varchar("cvssScore", { length: 5 }).notNull(),
    description:       text("description").notNull(),
    affectedComponent: varchar("affectedComponent", { length: 255 }).notNull(),
    port:              int("port"),
    remediation:       text("remediation"),
    createdAt:         timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("idx_scan").on(t.scanId),
    index("idx_org_severity").on(t.organizationId, t.severity),
  ]
);

// ---------------------------------------------------------------------------
// Questionnaire sessions
// ---------------------------------------------------------------------------

export const questionnaireSessions = mysqlTable(
  "questionnaire_sessions",
  {
    id:             int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    userId:         int("userId").notNull(),
    sector:         varchar("sector", { length: 100 }),
    answers:        json("answers").$type<
                      Array<{ controlId: string; answer: string; score: number }>
                    >(),
    score:          varchar("score", { length: 8 }),
    articleScores:  json("articleScores").$type<Record<string, number>>(),
    status:         mysqlEnum("status", ["in_progress", "completed"]).notNull().default("in_progress"),
    completedAt:    timestamp("completedAt"),
    createdAt:      timestamp("createdAt").notNull().defaultNow(),
    updatedAt:      timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_org").on(t.organizationId),
    index("idx_user").on(t.userId),
  ]
);

// ---------------------------------------------------------------------------
// Remediation items
// ---------------------------------------------------------------------------

export const remediationItems = mysqlTable(
  "remediation_items",
  {
    id:             int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    scanId:         int("scanId"),
    vulnId:         int("vulnId"),
    title:          varchar("title", { length: 500 }).notNull(),
    steps:          json("steps").$type<
                      Array<{ order: number; instruction: string; platform: string }>
                    >(),
    effort:         mysqlEnum("effort", ["low", "medium", "high"]).notNull().default("medium"),
    status:         mysqlEnum("status", ["todo", "in_progress", "done", "wont_fix"])
                      .notNull()
                      .default("todo"),
    nis2Articles:   json("nis2Articles").$type<string[]>(),
    dueDate:        date("dueDate"),
    resolvedAt:     timestamp("resolvedAt"),
    createdAt:      timestamp("createdAt").notNull().defaultNow(),
    updatedAt:      timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_org_status").on(t.organizationId, t.status),
    index("idx_scan").on(t.scanId),
  ]
);

// ---------------------------------------------------------------------------
// Course progress
// ---------------------------------------------------------------------------

export const courseProgress = mysqlTable(
  "course_progress",
  {
    id:             int("id").autoincrement().primaryKey(),
    userId:         int("userId").notNull(),
    organizationId: int("organizationId").notNull(),
    moduleId:       varchar("moduleId", { length: 50 }).notNull(),
    lessonId:       varchar("lessonId", { length: 50 }).notNull(),
    completedAt:    timestamp("completedAt").notNull().defaultNow(),
    certificateUrl: varchar("certificateUrl", { length: 500 }),
  },
  (t) => [
    uniqueIndex("uq_user_lesson").on(t.userId, t.lessonId),
    index("idx_user_module").on(t.userId, t.moduleId),
  ]
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User         = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Scan         = typeof scans.$inferSelect;
export type Vulnerability = typeof vulnerabilities.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
