import { DetectedJob, WorkType } from "../types";

function normalizeWorkType(val?: string | null): WorkType {
  if (!val) return "Unknown";
  const lower = val.toLowerCase();
  if (lower.includes("remote") || lower.includes("telecommute") || lower.includes("work from home")) {
    return "Remote";
  }
  if (lower.includes("hybrid")) {
    return "Hybrid";
  }
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("in-person") || lower.includes("in person")) {
    return "In-Person";
  }
  return "Unknown";
}

function cleanText(text?: string | null): string | null {
  if (!text) return null;
  const doc = new DOMParser().parseFromString(text, "text/html");
  return (doc.body.textContent || "").trim().replace(/\s+/g, " ") || null;
}

export function parseJsonLd(doc: Document, currentUrl: string): DetectedJob | null {
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      if (!script.textContent) continue;
      let data: any;
      try {
        data = JSON.parse(script.textContent);
      } catch {
        continue;
      }

      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];

      for (const item of items) {
        if (!item) continue;
        const type = item["@type"];
        const isJob = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
        if (!isJob) continue;

        const role = item.title || item.name;
        if (!role || typeof role !== "string") continue;

        let company = "";
        if (typeof item.hiringOrganization === "string") {
          company = item.hiringOrganization;
        } else if (item.hiringOrganization && typeof item.hiringOrganization.name === "string") {
          company = item.hiringOrganization.name;
        }

        let location: string | null = null;
        if (typeof item.jobLocation === "string") {
          location = item.jobLocation;
        } else if (item.jobLocation && item.jobLocation.address) {
          const addr = item.jobLocation.address;
          if (typeof addr === "string") {
            location = addr;
          } else if (typeof addr === "object") {
            const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
            if (parts.length > 0) location = parts.join(", ");
          }
        }

        let workType: WorkType = "Unknown";
        if (item.jobLocationType === "TELECOMMUTE" || item.applicantLocationRequirements) {
          workType = "Remote";
        } else {
          workType = normalizeWorkType(role + " " + (location || ""));
        }

        let salary: string | null = null;
        if (item.baseSalary) {
          const s = item.baseSalary;
          const currency = s.currency || "$";
          if (typeof s.value === "number") {
            salary = `${currency}${s.value}`;
          } else if (typeof s.value === "object" && s.value !== null) {
            const min = s.value.minValue;
            const max = s.value.maxValue;
            const unit = s.value.unitText ? ` / ${s.value.unitText.toLowerCase()}` : "";
            if (min && max) salary = `${currency}${min} - ${currency}${max}${unit}`;
            else if (min) salary = `${currency}${min}+${unit}`;
            else if (max) salary = `Up to ${currency}${max}${unit}`;
          } else if (typeof s === "string") {
            salary = s;
          }
        } else if (item.estimatedSalary) {
          salary = typeof item.estimatedSalary === "string" ? item.estimatedSalary : null;
        }

        let jobId: string | null = null;
        if (item.identifier) {
          if (typeof item.identifier === "string") jobId = item.identifier;
          else if (item.identifier.value) jobId = String(item.identifier.value);
        }

        const description = cleanText(item.description);
        const employmentType = Array.isArray(item.employmentType)
          ? item.employmentType.join(", ")
          : typeof item.employmentType === "string"
          ? item.employmentType
          : null;

        const hostname = new URL(currentUrl).hostname.replace(/^www\./, "");

        return {
          company: company.trim(),
          role: role.trim(),
          location: location ? location.trim() : null,
          portal: hostname,
          work_type: workType,
          salary,
          job_id: jobId,
          url: (item.url && typeof item.url === "string") ? item.url : currentUrl,
          description,
          employment_type: employmentType,
          source: "json-ld",
          confidence: 0.95,
        };
      }
    }
  } catch (err) {
    console.debug("[JobTracker] JSON-LD parse error:", err);
  }
  return null;
}
