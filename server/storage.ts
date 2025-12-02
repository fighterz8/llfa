import { db } from "./db";
import { 
  leads, leadMetrics, scores, missions, missionEvents, settings, leadLists, leadListMembers,
  type Lead, type InsertLead,
  type LeadMetrics, type InsertLeadMetrics,
  type Score, type InsertScore,
  type Mission, type InsertMission,
  type MissionEvent, type InsertMissionEvent,
  type Setting, type InsertSetting,
  type LeadList, type InsertLeadList,
  type LeadListMember, type InsertLeadListMember
} from "@shared/schema";
import { eq, desc, and, or, ilike, inArray, gte, lte, isNotNull, sql } from "drizzle-orm";
import { normalizeDomain, normalizePhone, isFuzzyMatch } from "./utils/normalize";

export type UpsertResult = { lead: Lead; isNew: boolean; wasUpdated: boolean };

export type ListFilters = {
  minScore?: number;
  maxScore?: number;
  status?: string[];
  categories?: string[];
  city?: string;
  state?: string;
  hasWebsite?: boolean;
  hasPhone?: boolean;
};

export interface IStorage {
  // Leads
  createLead(lead: InsertLead): Promise<Lead>;
  getLeadById(id: string): Promise<Lead | undefined>;
  getAllLeads(limit?: number, offset?: number): Promise<Lead[]>;
  updateLeadStatus(id: string, status: string): Promise<Lead | undefined>;
  deleteAllLeads(): Promise<number>;
  
  // Deduplication
  findExistingLead(criteria: { placeId?: string; domain?: string; phone?: string; name?: string; city?: string }): Promise<Lead | undefined>;
  upsertLead(lead: InsertLead): Promise<UpsertResult>;
  getLeadsByPlaceIds(placeIds: string[]): Promise<Lead[]>;
  getLeadsByDomainsOrPhones(domains: string[], phones: string[]): Promise<Lead[]>;
  
  // Lead Metrics
  createLeadMetrics(metrics: InsertLeadMetrics): Promise<LeadMetrics>;
  getLeadMetrics(leadId: string): Promise<LeadMetrics | undefined>;
  upsertLeadMetrics(metrics: InsertLeadMetrics): Promise<LeadMetrics>;
  
  // Scores
  createScore(score: InsertScore): Promise<Score>;
  getScore(leadId: string): Promise<Score | undefined>;
  upsertScore(score: InsertScore): Promise<Score>;
  
  // Missions
  createMission(mission: InsertMission): Promise<Mission>;
  getMissionById(id: string): Promise<Mission | undefined>;
  updateMissionStatus(id: string, status: string, completedAt?: Date): Promise<Mission | undefined>;
  
  // Mission Events
  createMissionEvent(event: InsertMissionEvent): Promise<MissionEvent>;
  getMissionEvents(missionId: string, limit?: number): Promise<MissionEvent[]>;
  
  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(setting: InsertSetting): Promise<Setting>;
  
  // Lead Lists
  createLeadList(list: InsertLeadList): Promise<LeadList>;
  getLeadListById(id: string): Promise<LeadList | undefined>;
  getAllLeadLists(): Promise<LeadList[]>;
  updateLeadList(id: string, updates: Partial<InsertLeadList>): Promise<LeadList | undefined>;
  deleteLeadList(id: string): Promise<boolean>;
  addMembersToList(listId: string, leadIds: string[], reason?: string): Promise<number>;
  removeMemberFromList(listId: string, leadId: string): Promise<boolean>;
  getListMembers(listId: string): Promise<Array<Lead & { score?: Score }>>;
  getLeadsByFilters(filters: ListFilters): Promise<Lead[]>;
  updateListLeadCount(listId: string): Promise<void>;
  
  // Complex queries
  getLeadWithDetails(leadId: string): Promise<{ lead: Lead; metrics?: LeadMetrics; score?: Score } | undefined>;
  getLeadsWithScores(limit?: number, offset?: number, minScore?: number): Promise<Array<Lead & { score?: Score }>>;
}

export class DatabaseStorage implements IStorage {
  // Leads
  async createLead(insertLead: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(insertLead).returning();
    return lead;
  }

  async getLeadById(id: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return lead;
  }

  async getAllLeads(limit: number = 100, offset: number = 0): Promise<Lead[]> {
    return db.select().from(leads).limit(limit).offset(offset).orderBy(desc(leads.createdAt));
  }

  async updateLeadStatus(id: string, status: string): Promise<Lead | undefined> {
    const [lead] = await db.update(leads)
      .set({ status, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();
    return lead;
  }

  async deleteAllLeads(): Promise<number> {
    const deleted = await db.delete(leads).returning();
    return deleted.length;
  }

  async findExistingLead(criteria: { 
    placeId?: string; 
    domain?: string; 
    phone?: string; 
    name?: string; 
    city?: string 
  }): Promise<Lead | undefined> {
    const canonicalDomain = normalizeDomain(criteria.domain);
    const normalizedPhone = normalizePhone(criteria.phone);

    if (criteria.placeId) {
      const [byPlaceId] = await db.select().from(leads)
        .where(eq(leads.placeId, criteria.placeId)).limit(1);
      if (byPlaceId) return byPlaceId;
    }

    if (canonicalDomain) {
      const [byDomain] = await db.select().from(leads)
        .where(eq(leads.canonicalDomain, canonicalDomain)).limit(1);
      if (byDomain) return byDomain;
    }

    if (normalizedPhone && criteria.name) {
      const candidates = await db.select().from(leads)
        .where(eq(leads.normalizedPhone, normalizedPhone)).limit(10);
      
      for (const candidate of candidates) {
        if (isFuzzyMatch(
          { name: criteria.name, city: criteria.city, normalizedPhone },
          { name: candidate.name, city: candidate.city, normalizedPhone: candidate.normalizedPhone }
        )) {
          return candidate;
        }
      }
    }

    if (criteria.name && criteria.city) {
      const namePattern = criteria.name.substring(0, Math.min(10, criteria.name.length));
      const candidates = await db.select().from(leads)
        .where(and(
          ilike(leads.city, `%${criteria.city}%`),
          ilike(leads.name, `%${namePattern}%`)
        )).limit(20);
      
      for (const candidate of candidates) {
        if (isFuzzyMatch(
          { name: criteria.name, city: criteria.city, normalizedPhone },
          { name: candidate.name, city: candidate.city, normalizedPhone: candidate.normalizedPhone }
        )) {
          return candidate;
        }
      }
    }

    return undefined;
  }

  async upsertLead(insertLead: InsertLead): Promise<UpsertResult> {
    const canonicalDomain = normalizeDomain(insertLead.domain);
    const normalizedPhone = normalizePhone(insertLead.phone);
    
    const leadWithNormalized = {
      ...insertLead,
      canonicalDomain,
      normalizedPhone,
    };

    const existing = await this.findExistingLead({
      placeId: insertLead.placeId || undefined,
      domain: insertLead.domain || undefined,
      phone: insertLead.phone || undefined,
      name: insertLead.name,
      city: insertLead.city || undefined,
    });

    if (existing) {
      const [updated] = await db.update(leads)
        .set({
          name: insertLead.name,
          domain: insertLead.domain ?? existing.domain,
          canonicalDomain: canonicalDomain ?? existing.canonicalDomain,
          phone: insertLead.phone ?? existing.phone,
          normalizedPhone: normalizedPhone ?? existing.normalizedPhone,
          email: insertLead.email ?? existing.email,
          address: insertLead.address ?? existing.address,
          city: insertLead.city ?? existing.city,
          state: insertLead.state ?? existing.state,
          latitude: insertLead.latitude ?? existing.latitude,
          longitude: insertLead.longitude ?? existing.longitude,
          placeId: insertLead.placeId ?? existing.placeId,
          category: insertLead.category ?? existing.category,
          source: insertLead.source ?? existing.source,
          status: insertLead.status ?? existing.status,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, existing.id))
        .returning();
      
      return { lead: updated, isNew: false, wasUpdated: true };
    }

    const [created] = await db.insert(leads).values(leadWithNormalized).returning();
    return { lead: created, isNew: true, wasUpdated: false };
  }

  async getLeadsByPlaceIds(placeIds: string[]): Promise<Lead[]> {
    if (placeIds.length === 0) return [];
    
    return db.select().from(leads)
      .where(inArray(leads.placeId, placeIds));
  }

  async getLeadsByDomainsOrPhones(domains: string[], phones: string[]): Promise<Lead[]> {
    if (domains.length === 0 && phones.length === 0) return [];
    
    const hasDomains = domains.length > 0;
    const hasPhones = phones.length > 0;
    
    if (hasDomains && hasPhones) {
      return db.select().from(leads)
        .where(or(
          inArray(leads.canonicalDomain, domains),
          inArray(leads.normalizedPhone, phones)
        ));
    } else if (hasDomains) {
      return db.select().from(leads)
        .where(inArray(leads.canonicalDomain, domains));
    } else {
      return db.select().from(leads)
        .where(inArray(leads.normalizedPhone, phones));
    }
  }

  // Lead Metrics
  async createLeadMetrics(insertMetrics: InsertLeadMetrics): Promise<LeadMetrics> {
    const [metrics] = await db.insert(leadMetrics).values(insertMetrics).returning();
    return metrics;
  }

  async getLeadMetrics(leadId: string): Promise<LeadMetrics | undefined> {
    const [metrics] = await db.select().from(leadMetrics).where(eq(leadMetrics.leadId, leadId)).limit(1);
    return metrics;
  }

  async upsertLeadMetrics(insertMetrics: InsertLeadMetrics): Promise<LeadMetrics> {
    const existing = await this.getLeadMetrics(insertMetrics.leadId);
    
    if (existing) {
      const [updated] = await db.update(leadMetrics)
        .set({
          httpsOk: insertMetrics.httpsOk !== undefined ? insertMetrics.httpsOk : existing.httpsOk,
          mobileOk: insertMetrics.mobileOk !== undefined ? insertMetrics.mobileOk : existing.mobileOk,
          schemaOk: insertMetrics.schemaOk !== undefined ? insertMetrics.schemaOk : existing.schemaOk,
          hasBooking: insertMetrics.hasBooking !== undefined ? insertMetrics.hasBooking : existing.hasBooking,
          lcpMs: insertMetrics.lcpMs !== undefined ? insertMetrics.lcpMs : existing.lcpMs,
          cls: insertMetrics.cls !== undefined ? insertMetrics.cls : existing.cls,
          analyticsPixels: insertMetrics.analyticsPixels !== undefined ? insertMetrics.analyticsPixels : existing.analyticsPixels,
          rating: insertMetrics.rating !== undefined ? insertMetrics.rating : existing.rating,
          reviewCount: insertMetrics.reviewCount !== undefined ? insertMetrics.reviewCount : existing.reviewCount,
          cmsHint: insertMetrics.cmsHint !== undefined ? insertMetrics.cmsHint : existing.cmsHint,
        })
        .where(eq(leadMetrics.leadId, insertMetrics.leadId))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(leadMetrics).values(insertMetrics).returning();
    return created;
  }

  // Scores
  async createScore(insertScore: InsertScore): Promise<Score> {
    const [score] = await db.insert(scores).values(insertScore).returning();
    return score;
  }

  async getScore(leadId: string): Promise<Score | undefined> {
    const [score] = await db.select().from(scores).where(eq(scores.leadId, leadId)).limit(1);
    return score;
  }

  async upsertScore(insertScore: InsertScore): Promise<Score> {
    const existing = await this.getScore(insertScore.leadId);
    
    if (existing) {
      const [updated] = await db.update(scores)
        .set({
          need: insertScore.need,
          value: insertScore.value,
          reachability: insertScore.reachability,
          total: insertScore.total,
          reasons: insertScore.reasons,
        })
        .where(eq(scores.leadId, insertScore.leadId))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(scores).values(insertScore).returning();
    return created;
  }

  // Missions
  async createMission(insertMission: InsertMission): Promise<Mission> {
    const [mission] = await db.insert(missions).values(insertMission).returning();
    return mission;
  }

  async getMissionById(id: string): Promise<Mission | undefined> {
    const [mission] = await db.select().from(missions).where(eq(missions.id, id)).limit(1);
    return mission;
  }

  async updateMissionStatus(id: string, status: string, completedAt?: Date): Promise<Mission | undefined> {
    const [mission] = await db.update(missions)
      .set({ status, completedAt })
      .where(eq(missions.id, id))
      .returning();
    return mission;
  }

  // Mission Events
  async createMissionEvent(insertEvent: InsertMissionEvent): Promise<MissionEvent> {
    const [event] = await db.insert(missionEvents).values(insertEvent).returning();
    return event;
  }

  async getMissionEvents(missionId: string, limit: number = 50): Promise<MissionEvent[]> {
    return db.select()
      .from(missionEvents)
      .where(eq(missionEvents.missionId, missionId))
      .orderBy(desc(missionEvents.createdAt))
      .limit(limit);
  }

  // Settings
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return setting;
  }

  async setSetting(insertSetting: InsertSetting): Promise<Setting> {
    const existing = await this.getSetting(insertSetting.key);
    
    if (existing) {
      const [updated] = await db.update(settings)
        .set({ value: insertSetting.value, updatedAt: new Date() })
        .where(eq(settings.key, insertSetting.key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(settings).values(insertSetting).returning();
      return created;
    }
  }

  // Complex queries
  async getLeadWithDetails(leadId: string): Promise<{ lead: Lead; metrics?: LeadMetrics; score?: Score } | undefined> {
    const lead = await this.getLeadById(leadId);
    if (!lead) return undefined;

    const [metrics, score] = await Promise.all([
      this.getLeadMetrics(leadId),
      this.getScore(leadId)
    ]);

    return { lead, metrics, score };
  }

  async getLeadsWithScores(limit: number = 100, offset: number = 0, minScore?: number): Promise<Array<Lead & { score?: Score }>> {
    const leadsData = await this.getAllLeads(limit, offset);
    
    const leadsWithScores = await Promise.all(
      leadsData.map(async (lead) => {
        const score = await this.getScore(lead.id);
        return { ...lead, score };
      })
    );

    if (minScore !== undefined) {
      return leadsWithScores.filter(l => l.score && l.score.total >= minScore);
    }

    return leadsWithScores;
  }

  // Lead Lists
  async createLeadList(insertList: InsertLeadList): Promise<LeadList> {
    const [list] = await db.insert(leadLists).values(insertList).returning();
    return list;
  }

  async getLeadListById(id: string): Promise<LeadList | undefined> {
    const [list] = await db.select().from(leadLists).where(eq(leadLists.id, id)).limit(1);
    return list;
  }

  async getAllLeadLists(): Promise<LeadList[]> {
    return db.select().from(leadLists).orderBy(desc(leadLists.createdAt));
  }

  async updateLeadList(id: string, updates: Partial<InsertLeadList>): Promise<LeadList | undefined> {
    const [updated] = await db.update(leadLists)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(leadLists.id, id))
      .returning();
    return updated;
  }

  async deleteLeadList(id: string): Promise<boolean> {
    const deleted = await db.delete(leadLists).where(eq(leadLists.id, id)).returning();
    return deleted.length > 0;
  }

  async addMembersToList(listId: string, leadIds: string[], reason?: string): Promise<number> {
    if (leadIds.length === 0) return 0;
    
    const members = leadIds.map(leadId => ({
      listId,
      leadId,
      addedReason: reason,
    }));
    
    const result = await db.insert(leadListMembers)
      .values(members)
      .onConflictDoNothing()
      .returning();
    
    await this.updateListLeadCount(listId);
    return result.length;
  }

  async removeMemberFromList(listId: string, leadId: string): Promise<boolean> {
    const deleted = await db.delete(leadListMembers)
      .where(and(
        eq(leadListMembers.listId, listId),
        eq(leadListMembers.leadId, leadId)
      ))
      .returning();
    
    await this.updateListLeadCount(listId);
    return deleted.length > 0;
  }

  async getListMembers(listId: string): Promise<Array<Lead & { score?: Score }>> {
    const members = await db.select({ leadId: leadListMembers.leadId })
      .from(leadListMembers)
      .where(eq(leadListMembers.listId, listId));
    
    const leadIds = members.map(m => m.leadId);
    if (leadIds.length === 0) return [];
    
    const leadsData = await db.select().from(leads)
      .where(inArray(leads.id, leadIds));
    
    const leadsWithScores = await Promise.all(
      leadsData.map(async (lead) => {
        const score = await this.getScore(lead.id);
        return { ...lead, score };
      })
    );
    
    return leadsWithScores;
  }

  async getLeadsByFilters(filters: ListFilters): Promise<Lead[]> {
    const conditions = [];
    
    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(leads.status, filters.status));
    }
    
    if (filters.categories && filters.categories.length > 0) {
      conditions.push(inArray(leads.category, filters.categories));
    }
    
    if (filters.city) {
      conditions.push(ilike(leads.city, `%${filters.city}%`));
    }
    
    if (filters.state) {
      conditions.push(ilike(leads.state, `%${filters.state}%`));
    }
    
    if (filters.hasWebsite) {
      conditions.push(isNotNull(leads.domain));
    }
    
    if (filters.hasPhone) {
      conditions.push(isNotNull(leads.phone));
    }
    
    let leadsData: Lead[];
    if (conditions.length > 0) {
      leadsData = await db.select().from(leads).where(and(...conditions));
    } else {
      leadsData = await db.select().from(leads);
    }
    
    if (filters.minScore !== undefined || filters.maxScore !== undefined) {
      const leadsWithScores = await Promise.all(
        leadsData.map(async (lead) => {
          const score = await this.getScore(lead.id);
          return { lead, score };
        })
      );
      
      return leadsWithScores
        .filter(({ score }) => {
          if (!score) return false;
          if (filters.minScore !== undefined && score.total < filters.minScore) return false;
          if (filters.maxScore !== undefined && score.total > filters.maxScore) return false;
          return true;
        })
        .map(({ lead }) => lead);
    }
    
    return leadsData;
  }

  async updateListLeadCount(listId: string): Promise<void> {
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(leadListMembers)
      .where(eq(leadListMembers.listId, listId));
    
    const count = Number(countResult[0]?.count ?? 0);
    
    await db.update(leadLists)
      .set({ leadCount: count, updatedAt: new Date() })
      .where(eq(leadLists.id, listId));
  }
}

export const storage = new DatabaseStorage();
