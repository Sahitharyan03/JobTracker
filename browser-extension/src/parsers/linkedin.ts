import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("in-person")) return "In-Person";
  return "Unknown";
}

export function parseLinkedIn(doc: Document, currentUrl: string): DetectedJob | null {
  const isLinkedIn = currentUrl.includes("linkedin.com");
  if (!isLinkedIn) return null;

  // Handles both guest view (jobs/view/...) and logged-in feed/search view
  const roleEl = doc.querySelector(
    ".top-card-layout__title, .job-details-jobs-unified-top-card__job-title, h1.t-24, .jobs-unified-top-card__job-title"
  );
  const role = roleEl?.textContent?.trim();
  if (!role) return null;

  const companyEl = doc.querySelector(
    ".topcard__org-name-link, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name a, a.topcard__org-name-link, .job-details-jobs-unified-top-card__primary-description a"
  );
  const company = companyEl?.textContent?.trim() || "";

  const locEl = doc.querySelector(
    ".topcard__flavor--bullet, .job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__primary-description span:nth-child(2)"
  );
  const location = locEl?.textContent?.trim() || null;

  let jobId: string | null = null;
  const viewMatch = currentUrl.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) {
    jobId = viewMatch[1];
  } else {
    const urlObj = new URL(currentUrl);
    const paramId = urlObj.searchParams.get("currentJobId");
    if (paramId) jobId = paramId;
  }

  const descEl = doc.querySelector(
    ".show-more-less-html__markup, .jobs-description__content, #job-details, .jobs-box__html-content"
  );
  const description = descEl?.textContent?.trim().replace(/\s+/g, " ") || null;

  const pillsEl = doc.querySelectorAll(
    ".job-details-jobs-unified-top-card__job-insight, .description__job-criteria-text, .job-details-jobs-unified-top-card__attributes-item"
  );
  let salary: string | null = null;
  let employmentType: string | null = null;
  let workTypeCombined = role + " " + (location || "");

  pillsEl.forEach((pill) => {
    const txt = pill.textContent?.trim() || "";
    if (txt.includes("$") || txt.includes("€") || txt.includes("£")) {
      salary = txt;
    }
    if (txt.includes("Full-time") || txt.includes("Part-time") || txt.includes("Contract") || txt.includes("Internship")) {
      employmentType = txt;
    }
    workTypeCombined += " " + txt;
  });

  const workType = extractWorkType(workTypeCombined);

  return {
    company: company.trim(),
    role: role.trim(),
    location,
    portal: "LinkedIn",
    work_type: workType,
    salary,
    job_id: jobId,
    url: currentUrl,
    description,
    employment_type: employmentType,
    source: "linkedin",
    confidence: 0.92,
  };
}
