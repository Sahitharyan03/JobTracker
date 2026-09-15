/**
 * High-Accuracy Recruiter Email Classification & Entity Extraction Engine
 * Parses recruiter emails to extract:
 *  - Company Name (from sender display name, domain, subject line, or body patterns)
 *  - Candidate Application Status (applied, screening, interview, offer, rejected)
 *  - High-confidence Evidence Snippet (exact sentence that triggered classification)
 *  - Confidence Score (0.0 to 1.0)
 */

export type EmailStage = "applied" | "screening" | "interview" | "offer" | "rejected";

export interface EmailClassification {
  company: string;
  stage: EmailStage;
  confidence: number;
  snippet: string;
  subject: string;
  sender: string;
  sender_email?: string;
  raw_body?: string;
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "zoho.com",
  "mail.com",
]);

const ATS_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "gh.io",
  "lever.co",
  "hire.lever.co",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "myworkday.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "bamboohr.com",
  "icims.com",
  "taleo.net",
  "jobvite.com",
  "recruitee.com",
  "workable.com",
  "workablemail.com",
  "rippling.com",
  "pinpointhq.com",
  "applytojob.com",
  "jazzhr.com",
  "interviewing.io",
  "codesignal.com",
  "hackerrank.com",
  "codility.com",
  "hirevue.com",
];

interface PatternRule {
  pattern: RegExp;
  weight: number;
  stage: EmailStage;
  isNegative?: boolean;
}

const RULES: PatternRule[] = [
  // ── 1. OFFER RULES (Highest priority) ──────────────────────────────────────
  { pattern: /\b(?:pleased|delighted|thrilled|excited)\s+to\s+offer\s+you\b/i, weight: 1.0, stage: "offer" },
  { pattern: /\b(?:formal|official|written)\s+(?:job\s+)?offer\b/i, weight: 0.95, stage: "offer" },
  { pattern: /\boffer\s+of\s+employment\b/i, weight: 0.95, stage: "offer" },
  { pattern: /\bcongratulations\s+on\s+your\s+offer\b/i, weight: 0.95, stage: "offer" },
  { pattern: /\boffer\s+letter\s+(?:attached|enclosed|ready)\b/i, weight: 0.9, stage: "offer" },
  { pattern: /\bwelcome\s+to\s+the\s+team\b/i, weight: 0.85, stage: "offer" },
  { pattern: /\bcompensation\s+(?:package|details|and\s+benefits)\b/i, weight: 0.75, stage: "offer" },
  // Negative offer checks
  { pattern: /\b(?:cannot|unable\s+to|not\s+able\s+to)\s+(?:make|extend|offer)\b/i, weight: 1.0, stage: "rejected", isNegative: true },

  // ── 2. REJECTION RULES ────────────────────────────────────────────────────
  { pattern: /\b(?:decided\s+to\s+)?pursue\s+(?:other|more\s+experienced|other\s+qualified)\s+candidates\b/i, weight: 0.98, stage: "rejected" },
  { pattern: /\bmoving\s+forward\s+with\s+(?:other|other\s+candidates|another\s+candidate)\b/i, weight: 0.98, stage: "rejected" },
  { pattern: /\bnot\s+moving\s+forward\s+with\s+your\s+(?:application|candidacy)\b/i, weight: 0.98, stage: "rejected" },
  { pattern: /\bdecided\s+not\s+to\s+(?:move\s+forward|proceed)\b/i, weight: 0.98, stage: "rejected" },
  { pattern: /\bwill\s+not\s+be\s+moving\s+forward\b/i, weight: 0.98, stage: "rejected" },
  { pattern: /\bunfortunately[,\s]+(?:we|after|at\s+this\s+time)\b/i, weight: 0.9, stage: "rejected" },
  { pattern: /\bnot\s+selected\s+for\s+(?:an\s+interview|this\s+position|the\s+role)\b/i, weight: 0.95, stage: "rejected" },
  { pattern: /\bafter\s+careful\s+(?:consideration|review)[,\s]+(?:we|at\s+this\s+time)\b/i, weight: 0.92, stage: "rejected" },
  { pattern: /\bhigh\s+volume\s+of\s+(?:qualified\s+)?applicants\b/i, weight: 0.85, stage: "rejected" },
  { pattern: /\bwish\s+you\s+(?:the\s+best|all\s+the\s+best|success)\s+in\s+your\s+job\s+search\b/i, weight: 0.9, stage: "rejected" },
  { pattern: /\bkeep\s+your\s+(?:resume|application|details)\s+on\s+file\b/i, weight: 0.85, stage: "rejected" },
  { pattern: /\bposition\s+has\s+been\s+filled\b/i, weight: 0.9, stage: "rejected" },

  // ── 3. INTERVIEW RULES ────────────────────────────────────────────────────
  { pattern: /\b(?:invitation|invite)\s+to\s+interview\b/i, weight: 0.98, stage: "interview" },
  { pattern: /\b(?:like|love)\s+to\s+(?:schedule|invite\s+you\s+for)\s+(?:an?\s+)?(?:interview|call|conversation|chat)\b/i, weight: 0.95, stage: "interview" },
  { pattern: /\b(?:technical|phone|screening|video|onsite|virtual\s+onsite|panel)\s+interview\b/i, weight: 0.95, stage: "interview" },
  { pattern: /\bnext\s+round\s+of\s+interviews\b/i, weight: 0.95, stage: "interview" },
  { pattern: /\bchat\s+with\s+(?:our|the)\s+hiring\s+manager\b/i, weight: 0.9, stage: "interview" },
  { pattern: /\bselect\s+a\s+time\s+(?:slot|that\s+works|using\s+this\s+link)\b/i, weight: 0.88, stage: "interview" },
  { pattern: /\bcalendly\.com\/|\bhire\.lever\.co\/interviews|\bgrehouse\.io\/interviews\b/i, weight: 0.88, stage: "interview" },
  { pattern: /\bavailability\s+for\s+a\s+(?:15|30|45|60)[\s-]*minute\b/i, weight: 0.92, stage: "interview" },
  { pattern: /\binterview\s+confirmation\b/i, weight: 0.95, stage: "interview" },

  // ── 4. SCREENING / ASSESSMENT RULES ───────────────────────────────────────
  { pattern: /\b(?:online|technical|coding|take-home)\s+assessment\b/i, weight: 0.95, stage: "screening" },
  { pattern: /\bcoding\s+challenge\b/i, weight: 0.95, stage: "screening" },
  { pattern: /\b(?:hackerrank|codesignal|codility|hirevue|karat|byteboard)\b/i, weight: 0.95, stage: "screening" },
  { pattern: /\bcomplete\s+the\s+(?:assessment|test|challenge)\s+within\b/i, weight: 0.9, stage: "screening" },
  { pattern: /\binitial\s+screening\b/i, weight: 0.85, stage: "screening" },

  // ── 5. APPLIED / CONFIRMATION RULES ───────────────────────────────────────
  { pattern: /\bthank\s+you\s+for\s+applying\b/i, weight: 0.9, stage: "applied" },
  { pattern: /\bwe(?:'ve|\s+have)\s+received\s+your\s+application\b/i, weight: 0.9, stage: "applied" },
  { pattern: /\bapplication\s+submitted\s+successfully\b/i, weight: 0.95, stage: "applied" },
  { pattern: /\bconfirming\s+receipt\s+of\s+your\s+application\b/i, weight: 0.9, stage: "applied" },
  { pattern: /\byour\s+application\s+to\s+[A-Za-z0-9\s&.,'-]+\s+has\s+been\s+received\b/i, weight: 0.95, stage: "applied" },
];

/**
 * Clean up company names extracted from signatures or headers
 */
export function sanitizeCompanyName(raw: string): string {
  if (!raw) return "";
  let name = raw.trim();

  // Remove common prefix/suffix noise
  name = name.replace(/^(?:at|with|from|for|the)\s+/i, "");
  name = name.replace(/\s+(?:careers|recruiting|talent|team|jobs|hiring|ltd|llc|inc|corp|corporation|technologies|solutions|group|portal|platform)$/i, "");
  name = name.replace(/[.,\-_!]+$/, "").trim();

  // Capitalize neatly
  if (name.length > 0 && name === name.toLowerCase()) {
    name = name
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return name;
}

/**
 * Extract company name from email headers, sender, and subject
 */
export function extractCompany(
  senderName: string,
  senderEmail: string,
  subject: string,
  body: string,
): string {
  // 1. Try Subject Regex: "Your application to [Company]"
  const subjectPatterns = [
    /your\s+application\s+to\s+(?:the\s+)?([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:for|role|team|-|–|—|!|$))/i,
    /thank\s+you\s+for\s+applying\s+to\s+(?:the\s+)?([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:for|role|team|-|–|—|!|$))/i,
    /(?:interview|update|next\s+steps|invitation)\s+(?:with|at|from)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:for|role|team|-|–|—|!|$))/i,
    /^([A-Za-z0-9\s&.,'-]+?)\s*:\s*(?:Your\s+application|Interview|Update|Offer|Next\s+steps)/i,
    /(?:welcome\s+to|joining)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:team|family|!|$))/i,
  ];

  for (const pat of subjectPatterns) {
    const match = subject.match(pat);
    if (match && match[1]) {
      const candidate = sanitizeCompanyName(match[1]);
      if (candidate.length >= 2 && candidate.length <= 40) {
        return candidate;
      }
    }
  }

  // 2. Try Sender Display Name: "Stripe Recruiting", "Google Careers"
  if (senderName) {
    const cleanSender = senderName
      .replace(/<.*?>/g, "")
      .replace(/["]+/g, "")
      .trim();

    // Exclude generic personal names or common ATS systems
    const isAtsName = ATS_DOMAINS.some((ats) => cleanSender.toLowerCase().includes(ats.split(".")[0]));
    if (!isAtsName && !cleanSender.toLowerCase().includes("no-reply") && !cleanSender.toLowerCase().includes("notifications")) {
      const candidate = sanitizeCompanyName(cleanSender);
      if (candidate.length >= 2 && candidate.length <= 35) {
        return candidate;
      }
    }
  }

  // 3. Try Sender Email Domain: "recruiter@stripe.com" -> "Stripe"
  if (senderEmail && senderEmail.includes("@")) {
    const domain = senderEmail.split("@")[1]?.toLowerCase()?.trim() ?? "";
    const isGeneric = GENERIC_EMAIL_DOMAINS.has(domain);
    const isAts = ATS_DOMAINS.some((ats) => domain.includes(ats));

    if (!isGeneric && !isAts && domain.includes(".")) {
      const parts = domain.split(".");
      const mainPart = parts.length > 2 && parts[0] === "jobs" ? parts[1] : parts[0];
      if (mainPart && mainPart.length >= 2) {
        return sanitizeCompanyName(mainPart);
      }
    }
  }

  // 4. Try Body introductory patterns
  const bodyPatterns = [
    /thank\s+you\s+for\s+your\s+interest\s+in\s+(?:a\s+career\s+at\s+|the\s+[^.]+\s+at\s+)?([A-Za-z0-9\s&.,'-]+?)(?:\.|\n|<)/i,
    /thank\s+you\s+for\s+applying\s+to\s+([A-Za-z0-9\s&.,'-]+?)(?:\.|\n|<)/i,
    /the\s+([A-Za-z0-9\s&.,'-]+?)\s+(?:recruiting|talent|hiring)\s+team/i,
  ];

  for (const pat of bodyPatterns) {
    const match = body.match(pat);
    if (match && match[1]) {
      const candidate = sanitizeCompanyName(match[1]);
      if (candidate.length >= 2 && candidate.length <= 40) {
        return candidate;
      }
    }
  }

  return "";
}

/**
 * Find the exact sentence or paragraph containing the pattern trigger
 */
function findSentenceSnippet(text: string, matchIndex: number, matchLength: number): string {
  if (matchIndex < 0) return "";
  const start = Math.max(0, text.lastIndexOf(".", matchIndex) + 1);
  let end = text.indexOf(".", matchIndex + matchLength);
  if (end === -1) end = Math.min(text.length, matchIndex + matchLength + 60);
  else end = end + 1;

  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  return snippet.length > 180 ? snippet.slice(0, 177) + "..." : snippet;
}

/**
 * Classify email content into stage and extract metadata
 */
export function classifyRecruiterEmail(
  subject: string,
  senderName: string,
  senderEmail: string,
  body: string,
): EmailClassification | null {
  const fullText = `${subject}\n\n${body}`;
  const company = extractCompany(senderName, senderEmail, subject, body);

  let bestMatch: {
    stage: EmailStage;
    confidence: number;
    snippet: string;
  } | null = null;

  for (const rule of RULES) {
    const match = fullText.match(rule.pattern);
    if (match && match.index !== undefined) {
      const snippet = findSentenceSnippet(fullText, match.index, match[0].length);

      if (rule.isNegative) {
        // Immediate priority for negative overrides (e.g. "unable to offer")
        return {
          company: company || "Unknown Company",
          stage: "rejected",
          confidence: rule.weight,
          snippet: snippet || match[0],
          subject,
          sender: senderName || senderEmail,
          sender_email: senderEmail,
          raw_body: body.slice(0, 1000),
        };
      }

      if (!bestMatch || rule.weight > bestMatch.confidence) {
        bestMatch = {
          stage: rule.stage,
          confidence: rule.weight,
          snippet: snippet || match[0],
        };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    company: company || "Detected Company",
    stage: bestMatch.stage,
    confidence: bestMatch.confidence,
    snippet: bestMatch.snippet,
    subject,
    sender: senderName || senderEmail,
    sender_email: senderEmail,
    raw_body: body.slice(0, 1000),
  };
}
