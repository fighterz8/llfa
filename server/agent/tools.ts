import { LLMTool } from "../llm/client";
import * as cheerio from "cheerio";

export const AGENT_TOOLS: LLMTool[] = [
  {
    name: "search_places",
    description: "Search for local businesses using Google Places API. Returns name, address, phone, website, and rating.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query (e.g., 'dentists in San Diego')",
        },
        location: {
          type: "string",
          description: "The location to search in (city, address, or coordinates)",
        },
        radius: {
          type: "number",
          description: "Search radius in meters (default: 5000)",
        },
      },
      required: ["query", "location"],
    },
  },
  {
    name: "audit_site",
    description: "Audit a business website for technical issues, mobile optimization, booking systems, and other marketing gaps.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The website URL to audit",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "score_lead",
    description: "Score a lead based on Need (technical issues), Value (business potential), and Reachability (contact info quality). Returns scores 0-100 for each dimension.",
    parameters: {
      type: "object",
      properties: {
        business_name: {
          type: "string",
          description: "The name of the business",
        },
        audit_results: {
          type: "object",
          description: "Results from the site audit",
        },
        contact_info: {
          type: "object",
          description: "Available contact information (phone, email, etc.)",
        },
        category: {
          type: "string",
          description: "The business category (e.g., dentist, restaurant)",
        },
      },
      required: ["business_name", "audit_results", "contact_info", "category"],
    },
  },
];

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  category: string;
  latitude?: number;
  longitude?: number;
}

export interface AuditResult {
  httpsOk: boolean;
  mobileOk: boolean;
  hasBooking: boolean;
  schemaOk: boolean;
  cmsHint?: string;
  lcpMs?: number;
  cls?: number;
  analyticsPixels?: string[];
}

export interface ScoreResult {
  need: number;
  value: number;
  reachability: number;
  total: number;
  reasons: string[];
}

export async function searchPlaces(
  query: string,
  location: string,
  apiKey: string,
  radius: number = 5000
): Promise<PlaceResult[]> {
  if (!apiKey || apiKey.length < 10) {
    throw new Error("Invalid or missing Google Places API key. Please configure it in Settings.");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.append("query", `${query} in ${location}`);
  url.searchParams.append("radius", radius.toString());
  url.searchParams.append("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === "REQUEST_DENIED") {
    const errorDetail = data.error_message || "No additional details provided";
    throw new Error(`Google Places API REQUEST_DENIED: ${errorDetail}. Make sure the Places API is enabled in your Google Cloud Console and billing is set up.`);
  }

  if (data.status === "INVALID_REQUEST") {
    throw new Error("Invalid request to Google Places API. Check your query parameters.");
  }

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places API error: ${data.status} - ${data.error_message || "Unknown error"}`);
  }

  if (!data.results || data.results.length === 0) {
    return [];
  }

  return data.results.map((place: any) => ({
    placeId: place.place_id,
    name: place.name,
    address: place.formatted_address,
    rating: place.rating,
    reviewCount: place.user_ratings_total,
    category: place.types?.[0] || "business",
    latitude: place.geometry?.location?.lat,
    longitude: place.geometry?.location?.lng,
  }));
}

export async function getPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<{ phone?: string; website?: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.append("place_id", placeId);
  url.searchParams.append("fields", "formatted_phone_number,website");
  url.searchParams.append("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return {};
  }

  const data = await response.json();
  return {
    phone: data.result?.formatted_phone_number,
    website: data.result?.website,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

export async function auditSite(url: string): Promise<AuditResult> {
  const AUDIT_TIMEOUT = 8000;
  
  try {
    const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
    const startTime = Date.now();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AUDIT_TIMEOUT);
    
    try {
      const response = await fetch(normalizedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LLFABot/1.0)",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      const html = await withTimeout(
        response.text(),
        5000,
        "Timeout reading response body"
      );
      
      clearTimeout(timeoutId);
      const loadTime = Date.now() - startTime;
      
      const $ = cheerio.load(html);

      const httpsOk = normalizedUrl.startsWith("https://") || response.url.startsWith("https://");
      
      const viewport = $('meta[name="viewport"]').attr("content");
      const mobileOk = !!viewport && viewport.includes("width=device-width");

      const bookingKeywords = ["book", "appointment", "schedule", "reserve", "booking"];
      const hasBooking = bookingKeywords.some(
        (keyword) =>
          $(`a[href*="${keyword}"], button:contains("${keyword}")`).length > 0 ||
          html.toLowerCase().includes(keyword)
      );

      const schemaOk = $('script[type="application/ld+json"]').length > 0;

      const cmsHints: Record<string, string[]> = {
        wordpress: ["/wp-content/", "/wp-includes/", "wp-json"],
        wix: ["wix.com", "static.parastorage.com"],
        squarespace: ["squarespace", "sqsp.net"],
        webflow: ["webflow.io", "webflow.com"],
        shopify: ["shopify.com", "cdn.shopify.com"],
      };

      let cmsHint = "unknown";
      for (const [cms, hints] of Object.entries(cmsHints)) {
        if (hints.some((hint) => html.includes(hint))) {
          cmsHint = cms;
          break;
        }
      }

      const analyticsPixels: string[] = [];
      if (html.includes("google-analytics.com") || html.includes("gtag")) analyticsPixels.push("google_analytics");
      if (html.includes("facebook.com") || html.includes("fbq")) analyticsPixels.push("facebook_pixel");

      return {
        httpsOk,
        mobileOk,
        hasBooking,
        schemaOk,
        cmsHint,
        lcpMs: loadTime,
        cls: 0,
        analyticsPixels,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: any) {
    const errorType = error.name === "AbortError" ? "timeout" : 
                      error.message?.includes("Timeout") ? "timeout" : "error";
    return {
      httpsOk: false,
      mobileOk: false,
      hasBooking: false,
      schemaOk: false,
      cmsHint: errorType,
    };
  }
}

export function scoreLead(
  businessName: string,
  auditResults: AuditResult,
  contactInfo: { phone?: string; email?: string; website?: string },
  category: string
): ScoreResult {
  const reasons: string[] = [];
  
  let needScore = 0;
  if (!auditResults.httpsOk) {
    needScore += 25;
    reasons.push("Missing HTTPS security");
  }
  if (!auditResults.mobileOk) {
    needScore += 25;
    reasons.push("Not mobile optimized");
  }
  if (!auditResults.hasBooking) {
    needScore += 30;
    reasons.push("No online booking system");
  }
  if (!auditResults.schemaOk) {
    needScore += 10;
    reasons.push("Missing structured data");
  }
  if (!auditResults.analyticsPixels || auditResults.analyticsPixels.length === 0) {
    needScore += 10;
    reasons.push("No analytics tracking");
  }

  let valueScore = 50;
  const highValueCategories = ["dentist", "doctor", "lawyer", "chiropractor", "medical", "health"];
  if (highValueCategories.some((cat) => category.toLowerCase().includes(cat))) {
    valueScore += 30;
    reasons.push("High-value industry");
  }
  const validCmsHints = ["wordpress", "wix", "squarespace", "webflow", "shopify"];
  if (auditResults.cmsHint && validCmsHints.includes(auditResults.cmsHint)) {
    valueScore += 20;
    reasons.push(`Uses ${auditResults.cmsHint} (easy to upgrade)`);
  }

  let reachabilityScore = 0;
  if (contactInfo.phone) {
    reachabilityScore += 40;
    reasons.push("Phone number available");
  }
  if (contactInfo.email) {
    reachabilityScore += 30;
    reasons.push("Email address available");
  }
  if (contactInfo.website) {
    reachabilityScore += 30;
    reasons.push("Website available");
  }

  const total = Math.round((needScore + valueScore + reachabilityScore) / 3);

  return {
    need: needScore,
    value: valueScore,
    reachability: reachabilityScore,
    total,
    reasons,
  };
}
