import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, numeric, jsonb, timestamp, bigserial, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Leads table with deduplication indexes
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: text("domain"),
  canonicalDomain: text("canonical_domain"),
  normalizedPhone: text("normalized_phone"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  category: text("category").notNull(),
  source: text("source").notNull(),
  placeId: text("place_id"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("leads_place_id_unique").on(table.placeId).where(sql`place_id IS NOT NULL`),
  uniqueIndex("leads_canonical_domain_unique").on(table.canonicalDomain).where(sql`canonical_domain IS NOT NULL`),
  index("leads_normalized_phone_idx").on(table.normalizedPhone),
  index("leads_name_city_idx").on(table.name, table.city),
]);

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// Lead Metrics table
export const leadMetrics = pgTable("lead_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }).unique(),
  httpsOk: boolean("https_ok").default(false),
  lcpMs: integer("lcp_ms"),
  cls: numeric("cls"),
  mobileOk: boolean("mobile_ok").default(false),
  schemaOk: boolean("schema_ok").default(false),
  hasBooking: boolean("has_booking").default(false),
  analyticsPixels: jsonb("analytics_pixels"),
  rating: numeric("rating"),
  reviewCount: integer("review_count"),
  lastReviewAt: timestamp("last_review_at"),
  cmsHint: text("cms_hint"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeadMetricsSchema = createInsertSchema(leadMetrics).omit({
  id: true,
  createdAt: true,
});
export type InsertLeadMetrics = z.infer<typeof insertLeadMetricsSchema>;
export type LeadMetrics = typeof leadMetrics.$inferSelect;

// Scores table
export const scores = pgTable("scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }).unique(),
  need: integer("need").notNull(),
  value: integer("value").notNull(),
  reachability: integer("reachability").notNull(),
  total: integer("total").notNull(),
  reasons: jsonb("reasons").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScoreSchema = createInsertSchema(scores).omit({
  id: true,
  createdAt: true,
});
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scores.$inferSelect;

// Missions table
export const missions = pgTable("missions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title"),
  goalText: text("goal_text").notNull(),
  industrySlug: text("industry_slug"),
  locationQuery: text("location_query"),
  maxLeads: integer("max_leads"),
  status: text("status").notNull().default("running"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertMissionSchema = createInsertSchema(missions).omit({
  id: true,
  createdAt: true,
});
export type InsertMission = z.infer<typeof insertMissionSchema>;
export type Mission = typeof missions.$inferSelect;

// Mission Events table
export const missionEvents = pgTable("mission_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  missionId: varchar("mission_id").notNull().references(() => missions.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  toolName: text("tool_name"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMissionEventSchema = createInsertSchema(missionEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertMissionEvent = z.infer<typeof insertMissionEventSchema>;
export type MissionEvent = typeof missionEvents.$inferSelect;

// Settings table
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Lead Lists table - for organizing leads into collections
export const leadLists = pgTable("lead_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  listType: text("list_type").notNull().default("static"),
  filterJson: jsonb("filter_json").$type<{
    minScore?: number;
    maxScore?: number;
    status?: string[];
    categories?: string[];
    city?: string;
    state?: string;
    hasWebsite?: boolean;
    hasPhone?: boolean;
  }>(),
  missionId: varchar("mission_id").references(() => missions.id, { onDelete: "set null" }),
  leadCount: integer("lead_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLeadListSchema = createInsertSchema(leadLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLeadList = z.infer<typeof insertLeadListSchema>;
export type LeadList = typeof leadLists.$inferSelect;

// Lead List Members table - junction table for list membership
export const leadListMembers = pgTable("lead_list_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listId: varchar("list_id").notNull().references(() => leadLists.id, { onDelete: "cascade" }),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  addedReason: text("added_reason"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("lead_list_members_unique").on(table.listId, table.leadId),
  index("lead_list_members_lead_idx").on(table.leadId),
]);

export const insertLeadListMemberSchema = createInsertSchema(leadListMembers).omit({
  id: true,
  addedAt: true,
});
export type InsertLeadListMember = z.infer<typeof insertLeadListMemberSchema>;
export type LeadListMember = typeof leadListMembers.$inferSelect;
