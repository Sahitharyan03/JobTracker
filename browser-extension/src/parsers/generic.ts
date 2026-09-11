import { DetectedJob, WorkType } from "../types";

function extractWorkType(text: string): WorkType {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
  return "Unknown";
}

export function parseGenericDom(doc: Document, currentUrl: string): DetectedJob | null {
  // Try h1
  const h1 = doc.querySelector("h1");
  const h1Text = h1?.textContent?.trim();

  // Or document title
  const pageTitle = doc.title.trim();
  const candidateText = h1Text || pageTitle;
  if (!candidateText) return null;

  let role = "";
  let company = "";

  const atMatch = candidateText.match(/^(.+?)\s+at\s+([^–|-|•]+)/i);
  const dashMatch = candidateText.match(/^(.+?)\s+[-–|•]\s+([^–|-|•]+)/);

  if (atMatch) {
    role = atMatch[1].trim();
    company = atMatch[2].trim();
  } else if (dashMatch) {
    role = dashMatch[1].trim();
    company = dashMatch[2].trim();
  } else {
    role = candidateText;
  }

  // Attempt to find company from header logo or site name if still blank
  if (!company) {
    const logoImg = doc.querySelector("header img[alt], nav img[alt]");
    if (logoImg) {
      company = logoImg.getAttribute("alt") || "";
    }
  }

  // Find possible location
  const locEl = doc.querySelector("[class*='location'], [id*='location'], [aria-label*='location']");
  const location = locEl?.textContent?.trim() || null;

  // Find possible salary
  let salary: string | null = null;
  const salaryRegex = /(\$[\d,]+(?:\s*-\s*\$[\d,]+)?(?:\s*(?:k|per year|\/yr|\/year|\/hr|per hour))?)/i;
  const pageSnippet = doc.body.innerText.slice(0, 3000);
  const salaryMatch = pageSnippet.match(salaryRegex);
  if (salaryMatch) {
    salary = salaryMatch[1];
  }

  // Find description from main or article
  const mainEl = doc.querySelector("main, article, [role='main'], #main-content, .job-description");
  const description = mainEl?.textContent?.trim().replace(/\s+/g, " ").slice(0, 5000) || null;

  const hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
  const workType = extractWorkType(role + " " + (location || "") + " " + (description?.slice(0, 500) || ""));

  // Require at least a reasonable role name
  if (role.length < 3 || role.length > 120) return null;

  return {
    company: company.trim(),
    role: role.trim(),
    location,
    portal: hostname,
    work_type: workType,
    salary,
    job_id: null,
    url: currentUrl,
    description,
    employment_type: null,
    source: "generic",
    confidence: 0.5,
  };
}
