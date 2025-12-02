import { LLMClient, LLMMessage, LLMToolCall } from "../llm/client";
import { AGENT_TOOLS, searchPlaces, getPlaceDetails, auditSite, scoreLead, PlaceResult, AuditResult, ScoreResult } from "./tools";
import { storage } from "../storage";
import { InsertLead, InsertLeadMetrics, InsertScore, InsertMissionEvent } from "@shared/schema";
import { normalizeDomain, normalizePhone } from "../utils/normalize";

export interface AgentConfig {
  provider: "openai" | "gemini";
  llmApiKey: string;
  placesApiKey: string;
  strictScoring?: boolean;
}

export interface MissionGoal {
  query: string;
  location: string;
  maxLeads?: number;
  minScore?: number;
}

export interface AgentResult {
  leadsConsidered: number;
  leadsSaved: number;
  qualifiedCount: number;
  junkCount: number;
  topLeads: Array<{ id: string; name: string; score: number; status: string }>;
  completed: boolean;
  message?: string;
}

export class Agent {
  private llmClient: LLMClient;
  private config: AgentConfig;
  private missionId: string;
  private savedLeads: Array<{ id: string; name: string; score: number; status: string }> = [];
  private processedPlaceIds: Set<string> = new Set();
  private processedDomains: Set<string> = new Set();
  private processedPhones: Set<string> = new Set();
  private skippedDuplicates: number = 0;
  private updatedLeads: number = 0;

  constructor(config: AgentConfig, missionId: string) {
    this.config = config;
    this.missionId = missionId;
    this.llmClient = new LLMClient({
      provider: config.provider,
      apiKey: config.llmApiKey,
    });
  }

  async executeMission(goal: MissionGoal): Promise<AgentResult> {
    const minScore = goal.minScore ?? 75;
    const maxLeads = goal.maxLeads ?? 10;

    await this.logEvent("info", `Starting mission: ${goal.query} in ${goal.location}`);
    await this.logEvent("info", `Target: Find ${maxLeads} leads with score >= ${minScore}`);

    try {
      await this.logEvent("tool", "Searching for businesses...", "search_places");
      
      const places = await searchPlaces(goal.query, goal.location, this.config.placesApiKey);
      
      if (places.length === 0) {
        await this.logEvent("warning", "No businesses found matching your criteria");
        return this.createResult(0, "No businesses found");
      }

      await this.logEvent("success", `Found ${places.length} potential businesses`);

      const placesWithDetails = await Promise.all(
        places.slice(0, 15).map(async (place) => {
          try {
            const details = await getPlaceDetails(place.placeId, this.config.placesApiKey);
            return { ...place, ...details };
          } catch (e) {
            return place;
          }
        })
      );

      await this.logEvent("info", `Retrieved contact details for ${placesWithDetails.length} businesses`);

      const placeIds = placesWithDetails
        .map(p => p.placeId)
        .filter((id): id is string => !!id);

      const domains: string[] = [];
      const phones: string[] = [];
      for (const place of placesWithDetails) {
        const d = normalizeDomain(place.website);
        const p = normalizePhone(place.phone);
        if (d) domains.push(d);
        if (p) phones.push(p);
      }
      
      const [existingByPlaceId, existingByDomainOrPhone] = await Promise.all([
        storage.getLeadsByPlaceIds(placeIds),
        storage.getLeadsByDomainsOrPhones(domains, phones),
      ]);
      
      const allExistingLeads = [...existingByPlaceId];
      const seenIds = new Set(existingByPlaceId.map(l => l.id));
      for (const lead of existingByDomainOrPhone) {
        if (!seenIds.has(lead.id)) {
          allExistingLeads.push(lead);
          seenIds.add(lead.id);
        }
      }

      for (const lead of allExistingLeads) {
        if (lead.placeId) this.processedPlaceIds.add(lead.placeId);
        if (lead.canonicalDomain) this.processedDomains.add(lead.canonicalDomain);
        if (lead.normalizedPhone) this.processedPhones.add(lead.normalizedPhone);
      }

      if (allExistingLeads.length > 0) {
        await this.logEvent("info", `Found ${allExistingLeads.length} leads already in database - will skip duplicates`);
      }

      let qualifiedCount = 0;
      
      for (const place of placesWithDetails) {
        if (qualifiedCount >= maxLeads) {
          await this.logEvent("success", `Reached target of ${maxLeads} qualified leads!`);
          break;
        }

        const placeDomain = normalizeDomain(place.website);
        const placePhone = normalizePhone(place.phone);

        if (place.placeId && this.processedPlaceIds.has(place.placeId)) {
          this.skippedDuplicates++;
          continue;
        }

        if (placeDomain && this.processedDomains.has(placeDomain)) {
          this.skippedDuplicates++;
          continue;
        }

        if (placePhone && this.processedPhones.has(placePhone)) {
          this.skippedDuplicates++;
          continue;
        }

        await this.logEvent("info", `Analyzing: ${place.name}`);

        let auditResults: AuditResult;
        if (place.website) {
          await this.logEvent("tool", `Auditing website: ${place.website}`, "audit_site");
          
          try {
            auditResults = await auditSite(place.website);
            
            if (auditResults.cmsHint === "timeout") {
              await this.logEvent("warning", `Website audit timed out - site may be slow`);
            } else if (auditResults.cmsHint === "error") {
              await this.logEvent("warning", `Website audit failed - site may be unreachable`);
            } else {
              const issues: string[] = [];
              if (!auditResults.httpsOk) issues.push("No HTTPS");
              if (!auditResults.mobileOk) issues.push("Not mobile-friendly");
              if (!auditResults.hasBooking) issues.push("No booking system");
              if (!auditResults.schemaOk) issues.push("Missing SEO schema");
              
              if (issues.length > 0) {
                await this.logEvent("info", `Issues found: ${issues.join(", ")}`);
              } else {
                await this.logEvent("info", "Website looks well-optimized");
              }
            }
          } catch (e: any) {
            await this.logEvent("warning", `Audit error: ${e.message || "Unknown error"}`);
            auditResults = {
              httpsOk: false,
              mobileOk: false,
              hasBooking: false,
              schemaOk: false,
              cmsHint: "error",
            };
          }
        } else {
          await this.logEvent("warning", `${place.name} has no website - using default audit`);
          auditResults = {
            httpsOk: false,
            mobileOk: false,
            hasBooking: false,
            schemaOk: false,
            cmsHint: "none",
          };
        }

        const contactInfo = {
          phone: place.phone,
          website: place.website,
          email: undefined,
        };

        const score = scoreLead(place.name, auditResults, contactInfo, place.category);

        const isQualified = score.total >= 75;
        const meetsThreshold = minScore === 0 || score.total >= minScore;

        if (meetsThreshold) {
          const status = isQualified ? "qualified" : "junk";
          await this.logEvent(isQualified ? "success" : "info", 
            `${isQualified ? "QUALIFIED" : "SAVED (low score)"}: ${place.name} - Score: ${score.total}/100`);
          await this.logEvent("info", `  Need: ${score.need} | Value: ${score.value} | Reachability: ${score.reachability}`);
          
          const topReasons = score.reasons.slice(0, 3);
          for (const reason of topReasons) {
            await this.logEvent("info", `  • ${reason}`);
          }

          const { id: leadId, isNew } = await this.saveLead({
            name: place.name,
            category: place.category,
            domain: place.website,
            phone: place.phone,
            address: place.address,
            placeId: place.placeId,
            latitude: place.latitude,
            longitude: place.longitude,
            rating: place.rating,
            reviewCount: place.reviewCount,
            auditResults,
            score,
            status,
          });

          if (!isNew) {
            await this.logEvent("info", `  (Updated existing lead)`);
          }

          this.savedLeads.push({ id: leadId, name: place.name, score: score.total, status });
          
          if (isQualified) {
            qualifiedCount++;
          }
        } else {
          await this.logEvent("info", `Skipped: ${place.name} - Score ${score.total} below threshold ${minScore}`);
        }
      }

      const junkCount = this.savedLeads.length - qualifiedCount;
      
      let summaryMsg: string;
      const dedupeInfo = this.updatedLeads > 0 ? `, ${this.updatedLeads} updated` : "";
      const skipInfo = this.skippedDuplicates > 0 ? ` (${this.skippedDuplicates} duplicates skipped)` : "";
      
      if (this.savedLeads.length === 0) {
        summaryMsg = minScore > 0 
          ? `Mission complete. No leads met the qualification threshold of ${minScore}.${skipInfo}`
          : `Mission complete. No businesses found to save.${skipInfo}`;
      } else if (minScore === 0) {
        summaryMsg = `Mission complete! Saved ${this.savedLeads.length} leads (${qualifiedCount} qualified, ${junkCount} low-score${dedupeInfo}).${skipInfo}`;
      } else {
        summaryMsg = `Mission complete! Found ${qualifiedCount} qualified leads${dedupeInfo}.${skipInfo}`;
      }
      
      await this.logEvent("success", summaryMsg);

      if (this.savedLeads.length > 0) {
        const qualifiedLeads = this.savedLeads.filter(l => l.score >= 75);
        const junkLeads = this.savedLeads.filter(l => l.score < 75);
        
        if (qualifiedLeads.length > 0) {
          await this.logEvent("info", "Qualified leads:");
          for (const lead of qualifiedLeads.slice(0, 5)) {
            await this.logEvent("info", `  • ${lead.name} (Score: ${lead.score})`);
          }
        }
        
        if (junkLeads.length > 0 && minScore === 0) {
          await this.logEvent("info", "Low-score leads (for review):");
          for (const lead of junkLeads.slice(0, 3)) {
            await this.logEvent("info", `  • ${lead.name} (Score: ${lead.score})`);
          }
        }
      }

      return this.createResult(placesWithDetails.length, summaryMsg);

    } catch (error: any) {
      const errorMsg = error.message || "Unknown error occurred";
      
      if (errorMsg.includes("REQUEST_DENIED")) {
        await this.logEvent("error", "Google Places API access denied. Please check:");
        await this.logEvent("error", "  1. Places API is enabled in Google Cloud Console");
        await this.logEvent("error", "  2. Billing is set up on your Google Cloud project");
        await this.logEvent("error", "  3. API key has no IP/referrer restrictions blocking this server");
      } else {
        await this.logEvent("error", `Mission failed: ${errorMsg}`);
      }

      throw error;
    }
  }

  async processUserMessage(message: string): Promise<string> {
    const leadsWithScores = await storage.getLeadsWithScores(50);
    
    let leadsContext = "";
    if (leadsWithScores.length > 0) {
      const leadsSummary = leadsWithScores.map((lead, i) => {
        const score = lead.score;
        const metrics = score ? `Need:${score.need} Value:${score.value} Reach:${score.reachability} Total:${score.total}` : "No score";
        const reasons = score?.reasons?.slice(0, 3).join(", ") || "";
        return `${i+1}. ${lead.name} | ${lead.category} | ${lead.city}, ${lead.state} | ${lead.phone || "No phone"} | ${lead.domain || "No website"} | ${metrics} | Status: ${lead.status} | ${reasons}`;
      }).join("\n");
      
      leadsContext = `\n\n=== LEADS IN DATABASE (${leadsWithScores.length} total) ===\nFormat: Name | Category | Location | Phone | Website | Scores | Status | Key Issues\n\n${leadsSummary}`;
    } else {
      leadsContext = "\n\n=== LEADS IN DATABASE ===\nNo leads found. Run a mission to discover leads.";
    }

    const systemPrompt = `You are LLFA - the Local Lead Finder Agent.

You help users find and qualify local business leads. You have access to the leads database below. Answer questions about these specific leads using ONLY the data provided - do not make up or infer information.

=== INSTRUCTIONS ===

1. BE BRIEF: Keep responses under 150 words.
2. USE REAL DATA: Only reference leads shown in the database below.
3. BE SPECIFIC: When discussing a lead, mention their actual scores and issues.
4. DON'T FABRICATE: If asked about a lead not in the database, say so.

=== TO START A NEW MISSION ===

Type commands like: "Find dentists in San Diego" or "Search for restaurants in Austin"

=== SCORING EXPLAINED ===

- Need (0-100): Website problems = opportunity. Higher = more issues to fix.
- Value (0-100): Business type potential. Dentists/lawyers score higher.
- Reachability (0-100): Contact info quality. Phone + email + website = 100.
- Total: Average of the three. Score >= 75 = "qualified" lead.

=== YOUR CAPABILITIES ===

- Tell me about [business name] - gives full details on a specific lead
- Which leads have the highest scores? - ranks by total score
- Show me leads in [city] - filters by location
- Which leads need website help? - filters by high Need score
- Compare [lead A] vs [lead B] - compares two leads
${leadsContext}`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    try {
      const response = await this.llmClient.chat(messages, [], "none");
      return response.content || "I understand. How can I help you with your lead search?";
    } catch (error: any) {
      return "I encountered an issue processing your message. Please try again.";
    }
  }

  private createResult(considered: number, message: string): AgentResult {
    const qualifiedLeads = this.savedLeads.filter(l => l.status === "qualified");
    const junkLeads = this.savedLeads.filter(l => l.status === "junk");
    
    return {
      leadsConsidered: considered,
      leadsSaved: this.savedLeads.length,
      qualifiedCount: qualifiedLeads.length,
      junkCount: junkLeads.length,
      topLeads: qualifiedLeads.slice(0, 5),
      completed: true,
      message,
    };
  }

  private async saveLead(data: {
    name: string;
    category: string;
    domain?: string;
    phone?: string;
    email?: string;
    address?: string;
    placeId?: string;
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
    rating?: number;
    reviewCount?: number;
    auditResults: AuditResult;
    score: ScoreResult;
    status?: string;
  }): Promise<{ id: string; isNew: boolean }> {
    const leadData: InsertLead = {
      name: data.name,
      domain: data.domain,
      phone: data.phone,
      email: data.email,
      address: data.address,
      placeId: data.placeId,
      city: data.city,
      state: data.state,
      latitude: data.latitude?.toString(),
      longitude: data.longitude?.toString(),
      category: data.category,
      source: "google_places",
      status: data.status || (data.score.total >= 75 ? "qualified" : "new"),
    };

    const { lead, isNew, wasUpdated } = await storage.upsertLead(leadData);

    if (lead.placeId) this.processedPlaceIds.add(lead.placeId);
    if (lead.canonicalDomain) this.processedDomains.add(lead.canonicalDomain);
    if (lead.normalizedPhone) this.processedPhones.add(lead.normalizedPhone);

    if (wasUpdated) {
      this.updatedLeads++;
    }

    const metricsData: InsertLeadMetrics = {
      leadId: lead.id,
      httpsOk: data.auditResults.httpsOk,
      mobileOk: data.auditResults.mobileOk,
      hasBooking: data.auditResults.hasBooking,
      schemaOk: data.auditResults.schemaOk,
      cmsHint: data.auditResults.cmsHint,
      lcpMs: data.auditResults.lcpMs,
      cls: data.auditResults.cls ? data.auditResults.cls.toString() : undefined,
      analyticsPixels: data.auditResults.analyticsPixels,
      rating: data.rating?.toString(),
      reviewCount: data.reviewCount,
    };

    await storage.upsertLeadMetrics(metricsData);

    const scoreData: InsertScore = {
      leadId: lead.id,
      need: data.score.need,
      value: data.score.value,
      reachability: data.score.reachability,
      total: data.score.total,
      reasons: data.score.reasons,
    };

    await storage.upsertScore(scoreData);

    return { id: lead.id, isNew };
  }

  private async logEvent(type: string, message: string, toolName?: string): Promise<void> {
    const eventData: InsertMissionEvent = {
      missionId: this.missionId,
      eventType: type,
      toolName,
      payload: { message },
    };

    await storage.createMissionEvent(eventData);
  }
}
