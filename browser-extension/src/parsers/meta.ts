import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
  return "Unknown";
}

function getMetaContent(doc: Document, selector: string): string | null {
  const el = doc.querySelector(selector);
  return el ? el.getAttribute("content")?.trim() || null : null;
}

export function parseMetaTags(doc: Document, currentUrl: string): DetectedJob | null {
  const ogTitle = getMetaContent(doc, "meta[property='og:title']") || getMetaContent(doc, "meta[name='twitter:title']");
  if (!ogTitle) return null;

  // Many job pages have og:title like "Software Engineer at Stripe" or "Senior Frontend Engineer - Acme Corp"
  let role = "";
  let company = "";

  const atMatch = ogTitle.match(/^(.+?)\s+at\s+([^–|-|•]+)/i);
  const dashMatch = ogTitle.match(/^(.+?)\s+[-–|•]\s+([^–|-|•]+)/);

  if (atMatch) {
    role = atMatch[1].trim();
    company = atMatch[2].trim();
  } else if (dashMatch) {
    role = dashMatch[1].trim();
    company = dashMatch[2].trim();
  } else {
    role = ogTitle;
  }

  if (!company) {
    company =
      getMetaContent(doc, "meta[property='og:site_name']") ||
      getMetaContent(doc, "meta[name='author']") ||
      "";
  }

  // Check if role or title looks like a job posting
  const isJobLike = /engineer|developer|manager|designer|director|analyst|specialist|intern|lead|associate|coordinator|recruiter|officer|consultant|architect|scientist/i.test(
    role
  );
  if (!isJobLike && !currentUrl.includes("job") && !currentUrl.includes("career")) {
    return null;
  }

  const ogDesc =
    getMetaContent(doc, "meta[property='og:description']") ||
    getMetaContent(doc, "meta[name='description']") ||
    getMetaContent(doc, "meta[name='twitter:description']");

  const hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
  const workType = extractWorkType(role + " " + (ogDesc?.slice(0, 500) || ""));

  return {
    company: company.trim(),
    role: role.trim(),
    location: null,
    portal: hostname,
    work_type: workType,
    salary: null,
    job_id: null,
    url: currentUrl,
    description: ogDesc,
    employment_type: null,
    source: "meta",
    confidence: 0.65,
  };
}
