import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
  return "Unknown";
}

export function parseAshby(doc: Document, currentUrl: string): DetectedJob | null {
  const isAshby = currentUrl.includes("jobs.ashbyhq.com") || doc.querySelector("[class*='ashby']") !== null;
  if (!isAshby) return null;

  const roleEl = doc.querySelector("h1, [class*='JobPostingTitle'], [class*='title']");
  const role = roleEl?.textContent?.trim();
  if (!role) return null;

  let company = "";
  const companyEl = doc.querySelector("[class*='companyName'], [class*='organizationName'], header img[alt]");
  if (companyEl) {
    company = companyEl.getAttribute("alt") || companyEl.textContent || "";
  }
  if (!company) {
    const parts = new URL(currentUrl).pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      company = parts[0].replace(/-/g, " ");
      company = company.charAt(0).toUpperCase() + company.slice(1);
    }
  }

  const locEl = doc.querySelector("[class*='location'], [class*='Location'], [class*='metadata']");
  const location = locEl?.textContent?.trim() || null;

  const workType = extractWorkType((role || "") + " " + (location || ""));

  let jobId: string | null = null;
  const match = currentUrl.match(/jobs\.ashbyhq\.com\/[^/]+\/([a-f0-9-]+)/i);
  if (match) jobId = match[1];

  const descEl = doc.querySelector("[class*='jobPostingDetails'], [class*='description'], [class*='JobDescription']");
  const description = descEl?.textContent?.trim().replace(/\s+/g, " ") || null;

  return {
    company: company.trim(),
    role: role.trim(),
    location,
    portal: "Ashby",
    work_type: workType,
    salary: null,
    job_id: jobId,
    url: currentUrl,
    description,
    employment_type: null,
    source: "ashby",
    confidence: 0.9,
  };
}
