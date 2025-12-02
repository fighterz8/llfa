export function normalizeDomain(url: string | undefined | null): string | null {
  if (!url || url.trim() === "") return null;
  
  try {
    let cleanUrl = url.trim();
    
    if (!cleanUrl.match(/^https?:\/\//i)) {
      cleanUrl = "https://" + cleanUrl;
    }
    
    const parsed = new URL(cleanUrl);
    let hostname = parsed.hostname.toLowerCase();
    
    if (hostname.startsWith("www.")) {
      hostname = hostname.substring(4);
    }
    
    if (!hostname || hostname === "localhost") return null;
    
    return hostname;
  } catch {
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)/i);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    return null;
  }
}

export function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone || phone.trim() === "") return null;
  
  const digits = phone.replace(/\D/g, "");
  
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  
  return null;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

export function nameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  
  if (n1 === n2) return 1;
  
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(n1, n2);
  return 1 - distance / maxLen;
}

export function isFuzzyMatch(
  lead1: { name: string; city?: string | null; normalizedPhone?: string | null },
  lead2: { name: string; city?: string | null; normalizedPhone?: string | null },
  threshold: number = 0.85
): boolean {
  if (lead1.normalizedPhone && lead2.normalizedPhone && 
      lead1.normalizedPhone === lead2.normalizedPhone) {
    return true;
  }
  
  if (lead1.city && lead2.city && 
      lead1.city.toLowerCase() !== lead2.city.toLowerCase()) {
    return false;
  }
  
  const similarity = nameSimilarity(lead1.name, lead2.name);
  return similarity >= threshold;
}
