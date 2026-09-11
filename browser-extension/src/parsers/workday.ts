import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
  return "Unknown";
}

export function parseWorkday(doc: Document, currentUrl: string): DetectedJob | null {
  const isWorkday = currentUrl.includes("myworkdayjobs.com") || currentUrl.includes("myworkday.com");
  if (!isWorkday) return null;

  const roleEl = doc.querySelector(
    "h2[data-automation-id='jobPostingHeader'], h1[data-automation-id='jobPostingHeader'], [data-automation-id='jobTitle']"
  );
  const role = roleEl?.textContent?.trim();
  if (!role) return null;

  let company = "";
  const matchSub = currentUrl.match(/https:\/\/([^.]+)\.wd\d*\.myworkdayjobs\.com/i);
  if (matchSub) {
    company = matchSub[1].replace(/-/g, " ");
    company = company.charAt(0).toUpperCase() + company.slice(1);
  }
  if (!company) {
    const titleMatch = doc.title.match(/Career Site\s*-\s*([^|–-]+)/i);
    if (titleMatch) company = titleMatch[1].trim();
  }

  const locEl = doc.querySelector(
    "[data-automation-id='locations'], [data-automation-id='jobPostingLocation'], dd[data-automation-id='location']"
  );
  const location = locEl?.textContent?.trim() || null;

  const idEl = doc.querySelector("[data-automation-id='jobPostingId']");
  let jobId = idEl?.textContent?.trim() || null;
  if (!jobId) {
    const urlMatch = currentUrl.match(/job\/[^/]+\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) jobId = urlMatch[1];
  }

  const descEl = doc.querySelector(
    "[data-automation-id='jobPostingDescription'], .job-description, [data-automation-id='jobSummary']"
  );
  const description = descEl?.textContent?.trim().replace(/\s+/g, " ") || null;

  const timeTypeEl = doc.querySelector("[data-automation-id='timeType']");
  const employmentType = timeTypeEl?.textContent?.trim() || null;

  const workType = extractWorkType((role || "") + " " + (location || "") + " " + (description?.slice(0, 500) || ""));

  return {
    company: company.trim(),
    role: role.trim(),
    location,
    portal: "Workday",
    work_type: workType,
    salary: null,
    job_id: jobId,
    url: currentUrl,
    description,
    employment_type: employmentType,
    source: "workday",
    confidence: 0.9,
  };
}
