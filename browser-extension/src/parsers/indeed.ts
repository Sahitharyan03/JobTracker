import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
  return "Unknown";
}

export function parseIndeed(doc: Document, currentUrl: string): DetectedJob | null {
  const isIndeed = currentUrl.includes("indeed.com");
  if (!isIndeed) return null;

  const roleEl = doc.querySelector(
    "h1.jobsearch-JobInfoHeader-title, h2.jobTitle, [data-testid='jobsearch-JobInfoHeader-title']"
  );
  const role = roleEl?.textContent?.trim();
  if (!role) return null;

  const companyEl = doc.querySelector(
    "[data-company-name='true'], [data-testid='inlineHeader-companyName'], .jobsearch-CompanyInfoContainer a"
  );
  const company = companyEl?.textContent?.trim() || "";

  const locEl = doc.querySelector(
    "[data-testid='job-location'], [data-testid='inlineHeader-companyLocation'], .jobsearch-JobInfoHeader-companyLocation"
  );
  const location = locEl?.textContent?.trim() || null;

  let jobId: string | null = null;
  const urlObj = new URL(currentUrl);
  const jk = urlObj.searchParams.get("jk");
  if (jk) {
    jobId = jk;
  } else {
    const vjk = urlObj.searchParams.get("vjk");
    if (vjk) jobId = vjk;
  }

  const salaryEl = doc.querySelector(
    "#salaryInfoAndJobType, [data-testid='attribute_snippet_testid'], #jobDetailsSection [data-testid*='salary']"
  );
  const salary = salaryEl?.textContent?.trim() || null;

  const descEl = doc.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText");
  const description = descEl?.textContent?.trim().replace(/\s+/g, " ") || null;

  const workType = extractWorkType(
    (role || "") + " " + (location || "") + " " + (salary || "") + " " + (description?.slice(0, 500) || "")
  );

  return {
    company: company.trim(),
    role: role.trim(),
    location,
    portal: "Indeed",
    work_type: workType,
    salary,
    job_id: jobId,
    url: currentUrl,
    description,
    employment_type: null,
    source: "indeed",
    confidence: 0.92,
  };
}
