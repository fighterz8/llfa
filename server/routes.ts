import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type ListFilters } from "./storage";
import { insertLeadSchema, insertScoreSchema, insertLeadMetricsSchema, insertLeadListSchema } from "@shared/schema";
import { z } from "zod";

const createListSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  listType: z.enum(["static", "snapshot", "dynamic"]).default("static"),
  leadIds: z.array(z.string()).optional(),
  filterJson: z.object({
    minScore: z.number().optional(),
    maxScore: z.number().optional(),
    status: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    hasWebsite: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
  }).optional(),
});

const addMembersSchema = z.object({
  leadIds: z.array(z.string()).min(1, "At least one lead ID required"),
  reason: z.string().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Settings API
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getSetting(key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      
      if (!key || value === undefined) {
        return res.status(400).json({ error: "Key and value are required" });
      }
      
      const setting = await storage.setSetting({ key, value });
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to save setting" });
    }
  });

  // Leads API
  app.get("/api/leads", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const minScore = req.query.minScore ? parseInt(req.query.minScore as string) : undefined;
      
      const leads = await storage.getLeadsWithScores(limit, offset, minScore);
      
      const formattedLeads = await Promise.all(leads.map(async (lead) => {
        const metrics = await storage.getLeadMetrics(lead.id);
        return {
          id: lead.id,
          name: lead.name,
          domain: lead.domain || "",
          phone: lead.phone || "",
          address: lead.address || "",
          category: lead.category,
          source: lead.source,
          status: lead.status,
          score: lead.score ? {
            total: lead.score.total,
            need: lead.score.need,
            value: lead.score.value,
            reachability: lead.score.reachability,
          } : { total: 0, need: 0, value: 0, reachability: 0 },
          metrics: metrics ? {
            https_ok: metrics.httpsOk || false,
            mobile_ok: metrics.mobileOk || false,
            has_booking: metrics.hasBooking || false,
            cms: metrics.cmsHint || "unknown",
          } : { https_ok: false, mobile_ok: false, has_booking: false, cms: "unknown" }
        };
      }));
      
      res.json(formattedLeads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const leadData = await storage.getLeadWithDetails(id);
      
      if (!leadData) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json(leadData);
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const leadData = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(leadData);
      res.status(201).json(lead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid lead data", details: error.errors });
      }
      console.error("Error creating lead:", error);
      res.status(500).json({ error: "Failed to create lead" });
    }
  });

  app.patch("/api/leads/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }
      
      const lead = await storage.updateLeadStatus(id, status);
      
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json(lead);
    } catch (error) {
      console.error("Error updating lead status:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  app.delete("/api/leads", async (req, res) => {
    try {
      const deletedCount = await storage.deleteAllLeads();
      res.json({ success: true, deleted: deletedCount });
    } catch (error) {
      console.error("Error deleting leads:", error);
      res.status(500).json({ error: "Failed to delete leads" });
    }
  });

  // Missions API
  app.get("/api/missions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const mission = await storage.getMissionById(id);
      
      if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
      }
      
      res.json(mission);
    } catch (error) {
      console.error("Error fetching mission:", error);
      res.status(500).json({ error: "Failed to fetch mission" });
    }
  });

  app.get("/api/missions/:id/events", async (req, res) => {
    try {
      const { id } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const events = await storage.getMissionEvents(id, limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching mission events:", error);
      res.status(500).json({ error: "Failed to fetch mission events" });
    }
  });

  // Agent Chat API
  app.post("/api/agent/chat", async (req, res) => {
    try {
      const { mission_id, messages, mode } = req.body;

      const userMessage = messages[messages.length - 1]?.content || "";

      const configSetting = await storage.getSetting("agent_config");
      if (!configSetting?.value) {
        return res.status(400).json({ 
          error: "Agent not configured. Please configure API keys in Settings." 
        });
      }

      const config = configSetting.value as {
        provider: "openai" | "gemini";
        llmApiKey: string;
        placesApiKey: string;
        strictScoring?: boolean;
      };

      if (!config.llmApiKey) {
        return res.status(400).json({ 
          error: "Missing LLM API key. Please configure in Settings." 
        });
      }

      const agentConfig = {
        provider: config.provider,
        llmApiKey: config.llmApiKey,
        placesApiKey: config.placesApiKey || "",
        strictScoring: config.strictScoring,
      };

      const isMissionRequest = (msg: string): boolean => {
        const lowerMsg = msg.toLowerCase();
        
        const hasAction = /\b(find|search|look for|get|discover|show|list|pull)\b/i.test(msg);
        const hasLocation = /\b(in|near|around|at)\s+[a-z]/i.test(msg) || 
                            /\b(san diego|los angeles|new york|chicago|houston|phoenix|philadelphia|san antonio|dallas|austin|jacksonville|san jose|fort worth|columbus|charlotte|seattle|denver|boston|nashville|baltimore|oklahoma city|louisville|portland|las vegas|milwaukee|albuquerque|tucson|fresno|sacramento|mesa|kansas city|atlanta|miami|oakland|minneapolis|tulsa|cleveland|wichita|arlington|new orleans|bakersfield|tampa|honolulu|aurora|anaheim|santa ana|st\. louis|riverside|corpus christi|lexington|pittsburgh|stockton|anchorage|cincinnati|saint paul|toledo|greensboro|newark|plano|henderson|lincoln|buffalo|jersey city|chula vista|fort wayne|orlando|st\. petersburg|chandler|laredo|norfolk|durham|madison|lubbock|irvine|winston-salem|glendale|garland|hialeah|reno|chesapeake|gilbert|baton rouge|irving|scottsdale|north las vegas|fremont|boise|richmond|san bernardino)\b/i.test(msg);
        const hasLeadsOrBusiness = /\b(leads?|business(es)?|companies|dentist|doctor|lawyer|restaurant|plumber|contractor|realtor|agency|clinic|salon|spa|gym|studio|shop|store|service)\b/i.test(msg);
        const hasCount = /\b(\d+)\s*(leads?|business(es)?|results?)\b/i.test(msg) || /\bget\s+me\s+\d+\b/i.test(msg);
        
        if (hasAction && hasLocation) return true;
        if (hasLocation && hasLeadsOrBusiness) return true;
        if (hasCount && (hasLocation || hasLeadsOrBusiness)) return true;
        
        return false;
      };

      const isSearchRequest = isMissionRequest(userMessage);

      if (mode === "chat" || !isSearchRequest) {
        const { Agent } = await import("./agent/loop");
        const tempMissionId = mission_id || "chat-" + Date.now();
        const agent = new Agent(agentConfig, tempMissionId);
        
        let response = await agent.processUserMessage(userMessage);
        
        if (response.length > 800) {
          const sentences = response.split(/(?<=[.!?])\s+/);
          let truncated = "";
          for (const sentence of sentences) {
            if ((truncated + sentence).length > 700) break;
            truncated += sentence + " ";
          }
          response = truncated.trim() + "\n\n[Use specific commands like 'find dentists in San Diego' to start a mission]";
        }
        
        return res.json({
          mission_id: mission_id,
          assistant_message: { role: "assistant", content: response },
          summary: { status: "idle" }
        });
      }

      if (!config.placesApiKey) {
        return res.status(400).json({ 
          error: "Missing Google Places API key. Please configure in Settings to search for businesses." 
        });
      }

      let currentMissionId = mission_id;

      if (!currentMissionId) {
        const mission = await storage.createMission({
          goalText: userMessage,
          title: userMessage.slice(0, 50),
          status: "running",
        });
        currentMissionId = mission.id;
      } else {
        await storage.updateMissionStatus(currentMissionId, "running");
      }

      const parseGoal = (text: string): { query: string; location: string; minScore: number } => {
        const patterns = [
          /(?:find|search|look for|get me|discover)\s+(.+?)\s+(?:in|near|around)\s+(.+)/i,
          /(.+?)\s+(?:in|near|around)\s+(.+)/i,
        ];
        
        const minScore = config.strictScoring ? 75 : 0;
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return { query: match[1].trim(), location: match[2].trim(), minScore };
          }
        }
        return { query: text, location: "San Diego", minScore };
      };

      const goal = parseGoal(userMessage);

      const { Agent } = await import("./agent/loop");
      const agent = new Agent(agentConfig, currentMissionId);

      const scoringMode = config.strictScoring ? "strict (score >= 75)" : "relaxed (all scores)";
      
      res.json({
        mission_id: currentMissionId,
        assistant_message: { 
          role: "assistant", 
          content: `Starting mission to find ${goal.query} in ${goal.location}. Using ${scoringMode} mode. Watch the logs panel to see my progress!` 
        },
        summary: {
          status: "running",
          leads_considered: 0,
          leads_saved: 0,
          top_leads: [],
          recent_events: []
        }
      });

      agent.executeMission(goal).then(async (result) => {
        await storage.updateMissionStatus(currentMissionId, "completed", new Date());
      }).catch(async (error) => {
        console.error("Mission error:", error);
        await storage.updateMissionStatus(currentMissionId, "failed");
      });

    } catch (error) {
      console.error("Error in agent chat:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  // Lead Lists API
  app.get("/api/lists", async (req, res) => {
    try {
      const lists = await storage.getAllLeadLists();
      res.json(lists);
    } catch (error) {
      console.error("Error fetching lists:", error);
      res.status(500).json({ error: "Failed to fetch lists" });
    }
  });

  app.get("/api/lists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const list = await storage.getLeadListById(id);
      
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }
      
      res.json(list);
    } catch (error) {
      console.error("Error fetching list:", error);
      res.status(500).json({ error: "Failed to fetch list" });
    }
  });

  app.post("/api/lists", async (req, res) => {
    try {
      const data = createListSchema.parse(req.body);
      
      const list = await storage.createLeadList({
        name: data.name,
        description: data.description,
        listType: data.listType,
        filterJson: data.filterJson,
      });

      if (data.listType === "static" && data.leadIds && data.leadIds.length > 0) {
        await storage.addMembersToList(list.id, data.leadIds, "initial_selection");
      } else if (data.listType === "snapshot" && data.filterJson) {
        const matchingLeads = await storage.getLeadsByFilters(data.filterJson as ListFilters);
        const leadIds = matchingLeads.map(l => l.id);
        await storage.addMembersToList(list.id, leadIds, "snapshot_from_filter");
      }

      const updatedList = await storage.getLeadListById(list.id);
      res.status(201).json(updatedList);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid list data", details: error.errors });
      }
      console.error("Error creating list:", error);
      res.status(500).json({ error: "Failed to create list" });
    }
  });

  app.patch("/api/lists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      
      const list = await storage.updateLeadList(id, { name, description });
      
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }
      
      res.json(list);
    } catch (error) {
      console.error("Error updating list:", error);
      res.status(500).json({ error: "Failed to update list" });
    }
  });

  app.delete("/api/lists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteLeadList(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "List not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting list:", error);
      res.status(500).json({ error: "Failed to delete list" });
    }
  });

  app.get("/api/lists/:id/leads", async (req, res) => {
    try {
      const { id } = req.params;
      const list = await storage.getLeadListById(id);
      
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }

      let leads;
      if (list.listType === "dynamic" && list.filterJson) {
        const rawLeads = await storage.getLeadsByFilters(list.filterJson as ListFilters);
        leads = await Promise.all(rawLeads.map(async (lead) => {
          const score = await storage.getScore(lead.id);
          const metrics = await storage.getLeadMetrics(lead.id);
          return {
            id: lead.id,
            name: lead.name,
            domain: lead.domain || "",
            phone: lead.phone || "",
            address: lead.address || "",
            category: lead.category,
            source: lead.source,
            status: lead.status,
            score: score ? {
              total: score.total,
              need: score.need,
              value: score.value,
              reachability: score.reachability,
            } : { total: 0, need: 0, value: 0, reachability: 0 },
            metrics: metrics ? {
              https_ok: metrics.httpsOk || false,
              mobile_ok: metrics.mobileOk || false,
              has_booking: metrics.hasBooking || false,
              cms: metrics.cmsHint || "unknown",
            } : { https_ok: false, mobile_ok: false, has_booking: false, cms: "unknown" }
          };
        }));
      } else {
        const members = await storage.getListMembers(id);
        leads = await Promise.all(members.map(async (lead) => {
          const metrics = await storage.getLeadMetrics(lead.id);
          return {
            id: lead.id,
            name: lead.name,
            domain: lead.domain || "",
            phone: lead.phone || "",
            address: lead.address || "",
            category: lead.category,
            source: lead.source,
            status: lead.status,
            score: lead.score ? {
              total: lead.score.total,
              need: lead.score.need,
              value: lead.score.value,
              reachability: lead.score.reachability,
            } : { total: 0, need: 0, value: 0, reachability: 0 },
            metrics: metrics ? {
              https_ok: metrics.httpsOk || false,
              mobile_ok: metrics.mobileOk || false,
              has_booking: metrics.hasBooking || false,
              cms: metrics.cmsHint || "unknown",
            } : { https_ok: false, mobile_ok: false, has_booking: false, cms: "unknown" }
          };
        }));
      }
      
      res.json(leads);
    } catch (error) {
      console.error("Error fetching list leads:", error);
      res.status(500).json({ error: "Failed to fetch list leads" });
    }
  });

  app.post("/api/lists/:id/leads", async (req, res) => {
    try {
      const { id } = req.params;
      const data = addMembersSchema.parse(req.body);
      
      const list = await storage.getLeadListById(id);
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }
      
      if (list.listType === "dynamic") {
        return res.status(400).json({ error: "Cannot manually add leads to a dynamic list" });
      }
      
      const added = await storage.addMembersToList(id, data.leadIds, data.reason);
      res.json({ added });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error adding leads to list:", error);
      res.status(500).json({ error: "Failed to add leads to list" });
    }
  });

  app.delete("/api/lists/:id/leads/:leadId", async (req, res) => {
    try {
      const { id, leadId } = req.params;
      
      const list = await storage.getLeadListById(id);
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }
      
      if (list.listType === "dynamic") {
        return res.status(400).json({ error: "Cannot manually remove leads from a dynamic list" });
      }
      
      const removed = await storage.removeMemberFromList(id, leadId);
      
      if (!removed) {
        return res.status(404).json({ error: "Lead not found in list" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing lead from list:", error);
      res.status(500).json({ error: "Failed to remove lead from list" });
    }
  });

  app.post("/api/lists/:id/refresh", async (req, res) => {
    try {
      const { id } = req.params;
      
      const list = await storage.getLeadListById(id);
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }
      
      if (list.listType !== "snapshot") {
        return res.status(400).json({ error: "Only snapshot lists can be refreshed" });
      }
      
      if (!list.filterJson) {
        return res.status(400).json({ error: "List has no filter configuration" });
      }
      
      const matchingLeads = await storage.getLeadsByFilters(list.filterJson as ListFilters);
      const leadIds = matchingLeads.map(l => l.id);
      await storage.addMembersToList(id, leadIds, "snapshot_refresh");
      
      const updatedList = await storage.getLeadListById(id);
      res.json(updatedList);
    } catch (error) {
      console.error("Error refreshing list:", error);
      res.status(500).json({ error: "Failed to refresh list" });
    }
  });

  return httpServer;
}
