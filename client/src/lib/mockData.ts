import { subMinutes } from "date-fns";

export interface Lead {
  id: string;
  name: string;
  domain: string;
  phone: string;
  address: string;
  category: string;
  source: string;
  score: {
    total: number;
    need: number;
    value: number;
    reachability: number;
  };
  metrics: {
    https_ok: boolean;
    mobile_ok: boolean;
    has_booking: boolean;
    cms: string;
  };
  status: "new" | "contacted" | "qualified" | "junk";
}

export interface LogEvent {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "tool";
  message: string;
  toolName?: string;
}

export const MOCK_LEADS: Lead[] = [
  {
    id: "1",
    name: "Fifth Avenue Dental Arts",
    domain: "mydentistsandiego.com",
    phone: "+1 619-233-3338",
    address: "450 A St #300, San Diego, CA 92101",
    category: "dentist",
    source: "google_places",
    score: { total: 85, need: 80, value: 90, reachability: 85 },
    metrics: { https_ok: true, mobile_ok: true, has_booking: true, cms: "wordpress" },
    status: "qualified",
  },
  {
    id: "2",
    name: "Downtown Works",
    domain: "downtownworks.com",
    phone: "+1 619-555-0123",
    address: "550 W B St, San Diego, CA 92101",
    category: "coworking",
    source: "google_places",
    score: { total: 92, need: 95, value: 88, reachability: 92 },
    metrics: { https_ok: true, mobile_ok: true, has_booking: false, cms: "webflow" },
    status: "new",
  },
  {
    id: "3",
    name: "Little Italy Food Hall",
    domain: "littleitalyfoodhall.com",
    phone: "+1 619-555-0199",
    address: "550 W Date St, San Diego, CA 92101",
    category: "restaurant",
    source: "google_places",
    score: { total: 65, need: 60, value: 70, reachability: 65 },
    metrics: { https_ok: false, mobile_ok: true, has_booking: false, cms: "squarespace" },
    status: "new",
  },
  {
    id: "4",
    name: "Balance Health & Wellness",
    domain: "balancehealthsd.com",
    phone: "+1 619-555-0444",
    address: "1234 State St, San Diego, CA 92101",
    category: "chiropractor",
    source: "google_places",
    score: { total: 78, need: 85, value: 75, reachability: 70 },
    metrics: { https_ok: true, mobile_ok: false, has_booking: true, cms: "wix" },
    status: "qualified",
  },
  {
    id: "5",
    name: "TechFlow Solutions",
    domain: "techflow.io",
    phone: "+1 858-555-9988",
    address: "8954 Rio San Diego Dr, San Diego, CA 92108",
    category: "software",
    source: "google_places",
    score: { total: 45, need: 30, value: 90, reachability: 20 },
    metrics: { https_ok: true, mobile_ok: true, has_booking: true, cms: "react" },
    status: "junk",
  },
];

export const INITIAL_LOGS: LogEvent[] = [
  { id: "1", timestamp: subMinutes(new Date(), 5).toISOString(), type: "info", message: "Agent initialized. Standing by." },
  { id: "2", timestamp: subMinutes(new Date(), 4).toISOString(), type: "info", message: "Connected to Local PostgreSQL database." },
  { id: "3", timestamp: subMinutes(new Date(), 4).toISOString(), type: "info", message: "Loaded system prompts and tool schemas." },
];
