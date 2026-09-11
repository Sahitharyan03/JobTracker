import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
  return "Unknown";
}

export function parseLever(doc: Document, currentUrl: string): DetectedJob | null {
  const isLever = currentUrl.includes("jobs.lever.co") || doc.querySelector(".lever-job, a[href*='lever.co']") !== null;
  if (!isLever) return null;

  const roleEl = doc.querySelector(".posting-headline h2, .posting-header h2, h2");
  const role = roleEl?.textContent?.trim();
  if (!role) return null;

  let company = "";
  const logoEl = doc.querySelector(".main-header-logo img, .posting-headline img");
  if (logoEl) {
    company = logoEl.getAttribute("alt") || "";
  }
  if (!company) {
    const urlObj = new URL(currentUrl);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      company = parts[0].replace(/-/g, " ");
      company = company.charAt(0).toUpperCase() + company.slice(1);
    }
  }

  const locEl = doc.querySelector(".posting-categories .location, .sort-by-time.posting-category.location");
  const location = locEl?.textContent?.trim() || null;

  const workplaceTypeEl = doc.querySelector(".workplaceType, .posting-categories .workplaceTypes");
  let workType: WorkType = "Unknown";
  if (workplaceTypeEl?.textContent) {
    workType = extractWorkType(workplaceTypeEl.textContent);
  }
  if (workType === "Unknown") {
    workType = extractWorkType(role + " " + (location || ""));
  }

  let jobId: string | null = null;
  const match = currentUrl.match(/jobs\.lever\.co\/[^/]+\/([a-f0-9-]+)/i);
  if (match) jobId = match[1];

  const descEl = doc.querySelector(".section.page-centered, .posting-description, [data-qa='job-description']");
  const description = descEl?.textContent?.trim().replace(/\s+/g, " ") || null;

  const commitEl = doc.querySelector(".commitment, .posting-categories .commitment");
  const employmentType = commitEl?.textContent?.trim() || null;

  return {
    company: company.trim(),
    role: role.trim(),
    location,
    portal: "Lever",
    work_type: workType,
    salary: null,
    job_id: jobId,
    url: currentUrl,
    description,
    employment_type: employmentType,
    source: "lever",
    confidence: 0.9,
  };
}
