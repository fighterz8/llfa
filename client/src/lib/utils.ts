import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDomainForDisplay(url: string | undefined | null): string {
  if (!url) return "";
  try {
    let cleaned = url.trim();
    cleaned = cleaned.replace(/^https?:\/\//, "");
    cleaned = cleaned.replace(/\/$/, "");
    if (!cleaned.startsWith("www.") && !cleaned.includes("/")) {
      cleaned = "www." + cleaned;
    }
    return cleaned;
  } catch {
    return url;
  }
}

export function getClickableUrl(url: string | undefined | null): string {
  if (!url) return "#";
  try {
    let cleaned = url.trim();
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      return cleaned;
    }
    return "https://" + cleaned;
  } catch {
    return url;
  }
}
