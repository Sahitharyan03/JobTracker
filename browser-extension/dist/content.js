"use strict";
(() => {
  // browser-extension/src/parsers/jsonLd.ts
  function normalizeWorkType(val) {
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
  function cleanText(text) {
    if (!text) return null;
    const doc = new DOMParser().parseFromString(text, "text/html");
    return (doc.body.textContent || "").trim().replace(/\s+/g, " ") || null;
  }
  function parseJsonLd(doc, currentUrl) {
    try {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        if (!script.textContent) continue;
        let data;
        try {
          data = JSON.parse(script.textContent);
        } catch {
          continue;
        }
        const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
        for (const item of items) {
          if (!item) continue;
          const type = item["@type"];
          const isJob = type === "JobPosting" || Array.isArray(type) && type.includes("JobPosting");
          if (!isJob) continue;
          const role = item.title || item.name;
          if (!role || typeof role !== "string") continue;
          let company = "";
          if (typeof item.hiringOrganization === "string") {
            company = item.hiringOrganization;
          } else if (item.hiringOrganization && typeof item.hiringOrganization.name === "string") {
            company = item.hiringOrganization.name;
          }
          let location = null;
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
          let workType = "Unknown";
          if (item.jobLocationType === "TELECOMMUTE" || item.applicantLocationRequirements) {
            workType = "Remote";
          } else {
            workType = normalizeWorkType(role + " " + (location || ""));
          }
          let salary = null;
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
          let jobId = null;
          if (item.identifier) {
            if (typeof item.identifier === "string") jobId = item.identifier;
            else if (item.identifier.value) jobId = String(item.identifier.value);
          }
          const description = cleanText(item.description);
          const employmentType = Array.isArray(item.employmentType) ? item.employmentType.join(", ") : typeof item.employmentType === "string" ? item.employmentType : null;
          const hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
          return {
            company: company.trim(),
            role: role.trim(),
            location: location ? location.trim() : null,
            portal: hostname,
            work_type: workType,
            salary,
            job_id: jobId,
            url: item.url && typeof item.url === "string" ? item.url : currentUrl,
            description,
            employment_type: employmentType,
            source: "json-ld",
            confidence: 0.95
          };
        }
      }
    } catch (err) {
      console.debug("[JobTracker] JSON-LD parse error:", err);
    }
    return null;
  }

  // browser-extension/src/parsers/greenhouse.ts
  function extractWorkType(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
    return "Unknown";
  }
  function parseGreenhouse(doc, currentUrl) {
    const isGreenhouse = currentUrl.includes("greenhouse.io") || doc.querySelector("#grnhse_app, #app_body, .grnhse-job-view, meta[content*='greenhouse']") !== null;
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
      const urlObj2 = new URL(currentUrl);
      const parts = urlObj2.pathname.split("/").filter(Boolean);
      if (parts.length > 0 && parts[0] !== "embed") {
        company = parts[0].replace(/-/g, " ");
        company = company.charAt(0).toUpperCase() + company.slice(1);
      }
    }
    const locEl = doc.querySelector(".location, .body--metadata, .job-location");
    const location = locEl?.textContent?.trim() || null;
    let jobId = null;
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
      confidence: 0.9
    };
  }

  // browser-extension/src/parsers/lever.ts
  function extractWorkType2(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
    return "Unknown";
  }
  function parseLever(doc, currentUrl) {
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
    let workType = "Unknown";
    if (workplaceTypeEl?.textContent) {
      workType = extractWorkType2(workplaceTypeEl.textContent);
    }
    if (workType === "Unknown") {
      workType = extractWorkType2(role + " " + (location || ""));
    }
    let jobId = null;
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
      confidence: 0.9
    };
  }

  // browser-extension/src/parsers/ashby.ts
  function extractWorkType3(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
    return "Unknown";
  }
  function parseAshby(doc, currentUrl) {
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
    const workType = extractWorkType3((role || "") + " " + (location || ""));
    let jobId = null;
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
      confidence: 0.9
    };
  }

  // browser-extension/src/parsers/workday.ts
  function extractWorkType4(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
    return "Unknown";
  }
  function parseWorkday(doc, currentUrl) {
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
    const workType = extractWorkType4((role || "") + " " + (location || "") + " " + (description?.slice(0, 500) || ""));
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
      confidence: 0.9
    };
  }

  // browser-extension/src/parsers/linkedin.ts
  function extractWorkType5(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("in-person")) return "In-Person";
    return "Unknown";
  }
  function parseLinkedIn(doc, currentUrl) {
    const isLinkedIn = currentUrl.includes("linkedin.com");
    if (!isLinkedIn) return null;
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
    let jobId = null;
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
    let salary = null;
    let employmentType = null;
    let workTypeCombined = role + " " + (location || "");
    pillsEl.forEach((pill) => {
      const txt = pill.textContent?.trim() || "";
      if (txt.includes("$") || txt.includes("\u20AC") || txt.includes("\xA3")) {
        salary = txt;
      }
      if (txt.includes("Full-time") || txt.includes("Part-time") || txt.includes("Contract") || txt.includes("Internship")) {
        employmentType = txt;
      }
      workTypeCombined += " " + txt;
    });
    const workType = extractWorkType5(workTypeCombined);
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
      confidence: 0.92
    };
  }

  // browser-extension/src/parsers/indeed.ts
  function extractWorkType6(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
    return "Unknown";
  }
  function parseIndeed(doc, currentUrl) {
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
    let jobId = null;
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
    const workType = extractWorkType6(
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
      confidence: 0.92
    };
  }

  // browser-extension/src/parsers/meta.ts
  function extractWorkType7(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
    return "Unknown";
  }
  function getMetaContent(doc, selector) {
    const el = doc.querySelector(selector);
    return el ? el.getAttribute("content")?.trim() || null : null;
  }
  function parseMetaTags(doc, currentUrl) {
    const ogTitle = getMetaContent(doc, "meta[property='og:title']") || getMetaContent(doc, "meta[name='twitter:title']");
    if (!ogTitle) return null;
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
      company = getMetaContent(doc, "meta[property='og:site_name']") || getMetaContent(doc, "meta[name='author']") || "";
    }
    const isJobLike = /engineer|developer|manager|designer|director|analyst|specialist|intern|lead|associate|coordinator|recruiter|officer|consultant|architect|scientist/i.test(
      role
    );
    if (!isJobLike && !currentUrl.includes("job") && !currentUrl.includes("career")) {
      return null;
    }
    const ogDesc = getMetaContent(doc, "meta[property='og:description']") || getMetaContent(doc, "meta[name='description']") || getMetaContent(doc, "meta[name='twitter:description']");
    const hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
    const workType = extractWorkType7(role + " " + (ogDesc?.slice(0, 500) || ""));
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
      confidence: 0.65
    };
  }

  // browser-extension/src/parsers/generic.ts
  function extractWorkType8(text) {
    const lower = text.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("in-person") || lower.includes("on-site") || lower.includes("onsite")) return "In-Person";
    return "Unknown";
  }
  function parseGenericDom(doc, currentUrl) {
    const h1 = doc.querySelector("h1");
    const h1Text = h1?.textContent?.trim();
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
    if (!company) {
      const logoImg = doc.querySelector("header img[alt], nav img[alt]");
      if (logoImg) {
        company = logoImg.getAttribute("alt") || "";
      }
    }
    const locEl = doc.querySelector("[class*='location'], [id*='location'], [aria-label*='location']");
    const location = locEl?.textContent?.trim() || null;
    let salary = null;
    const salaryRegex = /(\$[\d,]+(?:\s*-\s*\$[\d,]+)?(?:\s*(?:k|per year|\/yr|\/year|\/hr|per hour))?)/i;
    const pageSnippet = doc.body.innerText.slice(0, 3e3);
    const salaryMatch = pageSnippet.match(salaryRegex);
    if (salaryMatch) {
      salary = salaryMatch[1];
    }
    const mainEl = doc.querySelector("main, article, [role='main'], #main-content, .job-description");
    const description = mainEl?.textContent?.trim().replace(/\s+/g, " ").slice(0, 5e3) || null;
    const hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
    const workType = extractWorkType8(role + " " + (location || "") + " " + (description?.slice(0, 500) || ""));
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
      confidence: 0.5
    };
  }

  // browser-extension/src/parsers/index.ts
  function extractJobFromDocument(doc, url) {
    const jsonLdResult = parseJsonLd(doc, url);
    if (jsonLdResult && jsonLdResult.role && jsonLdResult.company) {
      return jsonLdResult;
    }
    const greenhouseResult = parseGreenhouse(doc, url);
    if (greenhouseResult && greenhouseResult.role) return greenhouseResult;
    const leverResult = parseLever(doc, url);
    if (leverResult && leverResult.role) return leverResult;
    const ashbyResult = parseAshby(doc, url);
    if (ashbyResult && ashbyResult.role) return ashbyResult;
    const workdayResult = parseWorkday(doc, url);
    if (workdayResult && workdayResult.role) return workdayResult;
    const linkedinResult = parseLinkedIn(doc, url);
    if (linkedinResult && linkedinResult.role) return linkedinResult;
    const indeedResult = parseIndeed(doc, url);
    if (indeedResult && indeedResult.role) return indeedResult;
    if (jsonLdResult && jsonLdResult.role) {
      return jsonLdResult;
    }
    const metaResult = parseMetaTags(doc, url);
    if (metaResult && metaResult.role) return metaResult;
    const genericResult = parseGenericDom(doc, url);
    if (genericResult && genericResult.role) return genericResult;
    return null;
  }

  // browser-extension/src/content.ts
  var lastSentUrl = "";
  var lastJobJson = "";
  var debounceTimer = null;
  function scanAndNotify() {
    if (window.top !== window.self) {
      const isEmbed = window.location.href.includes("greenhouse") || window.location.href.includes("lever");
      if (!isEmbed) return;
    }
    const currentUrl = window.location.href;
    const job = extractJobFromDocument(document, currentUrl);
    if (!job) {
      chrome.runtime.sendMessage({
        type: "JOB_CLEARED",
        url: currentUrl
      }).catch(() => {
      });
      return;
    }
    const jobJson = JSON.stringify(job);
    if (currentUrl === lastSentUrl && jobJson === lastJobJson) {
      return;
    }
    lastSentUrl = currentUrl;
    lastJobJson = jobJson;
    chrome.runtime.sendMessage({
      type: "JOB_DETECTED",
      job
    }).catch(() => {
    });
  }
  function debouncedScan(delay = 600) {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      scanAndNotify();
    }, delay);
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    debouncedScan(300);
  } else {
    window.addEventListener("DOMContentLoaded", () => debouncedScan(300));
  }
  var observer = new MutationObserver((mutations) => {
    let hasMeaningfulChange = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0 || m.type === "characterData") {
        hasMeaningfulChange = true;
        break;
      }
    }
    if (hasMeaningfulChange) {
      debouncedScan(1e3);
    }
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
  var originalPushState = history.pushState;
  history.pushState = function(...args) {
    const res = originalPushState.apply(this, args);
    debouncedScan(400);
    return res;
  };
  var originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    const res = originalReplaceState.apply(this, args);
    debouncedScan(400);
    return res;
  };
  window.addEventListener("popstate", () => debouncedScan(400));
  window.addEventListener("hashchange", () => debouncedScan(400));
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "SCAN_CURRENT_PAGE") {
      const job = extractJobFromDocument(document, window.location.href);
      sendResponse({ job });
    }
  });
})();
