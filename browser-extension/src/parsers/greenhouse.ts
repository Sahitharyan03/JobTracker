import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
  return "Unknown";
}

export function parseGreenhouse(doc: Document, currentUrl: string): DetectedJob | null {
  const isGreenhouse =
    currentUrl.includes("greenhouse.io") ||
    doc.querySelector("#grnhse_app, #app_body, .grnhse-job-view, meta[content*='greenhouse']") !== null;

  if (!isGreenhouse) return null;

  const roleEl = doc.querySelector(".app-title, h1.job-name, .job-post-title, #header h1");
  const role = roleEl?.textContent?.trim();
  if (!role) return null;

  let company = "";
  const companyEl = doc.querySelector(".company-name, #header .company, .logo-container img[alt]");
  if (companyEl) {
    company = companyEl.getAttribute("alt") || companyEl.textContent || "";
  }
  if (!company) {
    const titleMatch = doc.title.match(/at\s+([^-|–]+)/i);
    if (titleMatch) company = titleMatch[1].trim();
  }
  if (!company) {
    // Check URL path: boards.greenhouse.io/<company>/jobs/...
    const urlObj = new URL(currentUrl);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts.length > 0 && parts[0] !== "embed") {
      company = parts[0].replace(/-/g, " ");
      company = company.charAt(0).toUpperCase() + company.slice(1);
    }
  }

  const locEl = doc.querySelector(".location, .body--metadata, .job-location");
  const location = locEl?.textContent?.trim() || null;

  let jobId: string | null = null;
  const urlObj = new URL(currentUrl);
  const idFromParam = urlObj.searchParams.get("gh_jid");
  if (idFromParam) {
    jobId = idFromParam;
  } else {
    const match = urlObj.pathname.match(/\/jobs\/(\d+)/);
    if (match) jobId = match[1];
  }

  const descEl = doc.querySelector("#content, #job-description, .content, .job-post-content");
  const description = descEl?.textContent?.trim().replace(/\s+/g, " ") || null;

  const workType = extractWorkType((role || "") + " " + (location || "") + " " + (description?.slice(0, 500) || ""));

  return {
    company: company.trim(),
    role: role.trim(),
    location,
    portal: "Greenhouse",
    work_type: workType,
    salary: null,
    job_id: jobId,
    url: currentUrl,
    description,
    employment_type: null,
    source: "greenhouse",
    confidence: 0.9,
  };
}
