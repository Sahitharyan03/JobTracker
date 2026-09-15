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

  // browser-extension/src/parsers/emailClassifier.ts
  var GENERIC_EMAIL_DOMAINS = /* @__PURE__ */ new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
    "zoho.com",
    "mail.com"
  ]);
  var ATS_DOMAINS = [
    "greenhouse.io",
    "greenhouse-mail.io",
    "gh.io",
    "lever.co",
    "hire.lever.co",
    "ashbyhq.com",
    "jobs.ashbyhq.com",
    "myworkday.com",
    "myworkdayjobs.com",
    "smartrecruiters.com",
    "bamboohr.com",
    "icims.com",
    "taleo.net",
    "jobvite.com",
    "recruitee.com",
    "workable.com",
    "workablemail.com",
    "rippling.com",
    "pinpointhq.com",
    "applytojob.com",
    "jazzhr.com",
    "interviewing.io",
    "codesignal.com",
    "hackerrank.com",
    "codility.com",
    "hirevue.com"
  ];
  var RULES = [
    // ── 1. OFFER RULES ──────────────────────────────────────
    { pattern: /\b(?:pleased|delighted|thrilled|excited)\s+to\s+offer\s+you\b/i, weight: 1, stage: "offer" },
    { pattern: /\b(?:formal|official|written)\s+(?:job\s+)?offer\b/i, weight: 0.95, stage: "offer" },
    { pattern: /\boffer\s+of\s+employment\b/i, weight: 0.95, stage: "offer" },
    { pattern: /\bcongratulations\s+on\s+your\s+offer\b/i, weight: 0.95, stage: "offer" },
    { pattern: /\boffer\s+letter\s+(?:attached|enclosed|ready)\b/i, weight: 0.9, stage: "offer" },
    { pattern: /\bwelcome\s+to\s+the\s+team\b/i, weight: 0.85, stage: "offer" },
    { pattern: /\bcompensation\s+(?:package|details|and\s+benefits)\b/i, weight: 0.75, stage: "offer" },
    { pattern: /\b(?:cannot|unable\s+to|not\s+able\s+to)\s+(?:make|extend|offer)\b/i, weight: 1, stage: "rejected", isNegative: true },
    // ── 2. REJECTION RULES ──────────────────────────────────
    { pattern: /\b(?:decided\s+to\s+)?pursue\s+(?:other|more\s+experienced|other\s+qualified)\s+candidates\b/i, weight: 0.98, stage: "rejected" },
    { pattern: /\bmoving\s+forward\s+with\s+(?:other|other\s+candidates|another\s+candidate)\b/i, weight: 0.98, stage: "rejected" },
    { pattern: /\bnot\s+moving\s+forward\s+with\s+your\s+(?:application|candidacy)\b/i, weight: 0.98, stage: "rejected" },
    { pattern: /\bdecided\s+not\s+to\s+(?:move\s+forward|proceed)\b/i, weight: 0.98, stage: "rejected" },
    { pattern: /\bwill\s+not\s+be\s+moving\s+forward\b/i, weight: 0.98, stage: "rejected" },
    { pattern: /\bunfortunately[,\s]+(?:we|after|at\s+this\s+time)\b/i, weight: 0.9, stage: "rejected" },
    { pattern: /\bnot\s+selected\s+for\s+(?:an\s+interview|this\s+position|the\s+role)\b/i, weight: 0.95, stage: "rejected" },
    { pattern: /\bafter\s+careful\s+(?:consideration|review)[,\s]+(?:we|at\s+this\s+time)\b/i, weight: 0.92, stage: "rejected" },
    { pattern: /\bhigh\s+volume\s+of\s+(?:qualified\s+)?applicants\b/i, weight: 0.85, stage: "rejected" },
    { pattern: /\bwish\s+you\s+(?:the\s+best|all\s+the\s+best|success)\s+in\s+your\s+job\s+search\b/i, weight: 0.9, stage: "rejected" },
    { pattern: /\bkeep\s+your\s+(?:resume|application|details)\s+on\s+file\b/i, weight: 0.85, stage: "rejected" },
    { pattern: /\bposition\s+has\s+been\s+filled\b/i, weight: 0.9, stage: "rejected" },
    // ── 3. INTERVIEW RULES ──────────────────────────────────
    { pattern: /\b(?:invitation|invite)\s+to\s+interview\b/i, weight: 0.98, stage: "interview" },
    { pattern: /\b(?:like|love)\s+to\s+(?:schedule|invite\s+you\s+for)\s+(?:an?\s+)?(?:interview|call|conversation|chat)\b/i, weight: 0.95, stage: "interview" },
    { pattern: /\b(?:technical|phone|screening|video|onsite|virtual\s+onsite|panel)\s+interview\b/i, weight: 0.95, stage: "interview" },
    { pattern: /\bnext\s+round\s+of\s+interviews\b/i, weight: 0.95, stage: "interview" },
    { pattern: /\bchat\s+with\s+(?:our|the)\s+hiring\s+manager\b/i, weight: 0.9, stage: "interview" },
    { pattern: /\bselect\s+a\s+time\s+(?:slot|that\s+works|using\s+this\s+link)\b/i, weight: 0.88, stage: "interview" },
    { pattern: /\bcalendly\.com\/|\bhire\.lever\.co\/interviews|\bgrehouse\.io\/interviews\b/i, weight: 0.88, stage: "interview" },
    { pattern: /\bavailability\s+for\s+a\s+(?:15|30|45|60)[\s-]*minute\b/i, weight: 0.92, stage: "interview" },
    { pattern: /\binterview\s+confirmation\b/i, weight: 0.95, stage: "interview" },
    // ── 4. SCREENING / ASSESSMENT RULES ─────────────────────
    { pattern: /\b(?:online|technical|coding|take-home)\s+assessment\b/i, weight: 0.95, stage: "screening" },
    { pattern: /\bcoding\s+challenge\b/i, weight: 0.95, stage: "screening" },
    { pattern: /\b(?:hackerrank|codesignal|codility|hirevue|karat|byteboard)\b/i, weight: 0.95, stage: "screening" },
    { pattern: /\bcomplete\s+the\s+(?:assessment|test|challenge)\s+within\b/i, weight: 0.9, stage: "screening" },
    { pattern: /\binitial\s+screening\b/i, weight: 0.85, stage: "screening" },
    // ── 5. APPLIED RULES ────────────────────────────────────
    { pattern: /\bthank\s+you\s+for\s+applying\b/i, weight: 0.9, stage: "applied" },
    { pattern: /\bwe(?:'ve|\s+have)\s+received\s+your\s+application\b/i, weight: 0.9, stage: "applied" },
    { pattern: /\bapplication\s+submitted\s+successfully\b/i, weight: 0.95, stage: "applied" },
    { pattern: /\bconfirming\s+receipt\s+of\s+your\s+application\b/i, weight: 0.9, stage: "applied" },
    { pattern: /\byour\s+application\s+to\s+[A-Za-z0-9\s&.,'-]+\s+has\s+been\s+received\b/i, weight: 0.95, stage: "applied" }
  ];
  function sanitizeCompanyName(raw) {
    if (!raw) return "";
    let name = raw.trim();
    name = name.replace(/^(?:at|with|from|for|the)\s+/i, "");
    name = name.replace(/\s+(?:careers|recruiting|talent|team|jobs|hiring|ltd|llc|inc|corp|corporation|technologies|solutions|group|portal|platform)$/i, "");
    name = name.replace(/[.,\-_!]+$/, "").trim();
    if (name.length > 0 && name === name.toLowerCase()) {
      name = name.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
    return name;
  }
  function extractCompany(senderName, senderEmail, subject, body) {
    const subjectPatterns = [
      /your\s+application\s+to\s+(?:the\s+)?([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:for|role|team|-|–|—|!|$))/i,
      /thank\s+you\s+for\s+applying\s+to\s+(?:the\s+)?([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:for|role|team|-|–|—|!|$))/i,
      /(?:interview|update|next\s+steps|invitation)\s+(?:with|at|from)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:for|role|team|-|–|—|!|$))/i,
      /^([A-Za-z0-9\s&.,'-]+?)\s*:\s*(?:Your\s+application|Interview|Update|Offer|Next\s+steps)/i,
      /(?:welcome\s+to|joining)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:team|family|!|$))/i
    ];
    for (const pat of subjectPatterns) {
      const match = subject.match(pat);
      if (match && match[1]) {
        const candidate = sanitizeCompanyName(match[1]);
        if (candidate.length >= 2 && candidate.length <= 40) {
          return candidate;
        }
      }
    }
    if (senderName) {
      const cleanSender = senderName.replace(/<.*?>/g, "").replace(/["]+/g, "").trim();
      const isAtsName = ATS_DOMAINS.some((ats) => cleanSender.toLowerCase().includes(ats.split(".")[0]));
      if (!isAtsName && !cleanSender.toLowerCase().includes("no-reply") && !cleanSender.toLowerCase().includes("notifications")) {
        const candidate = sanitizeCompanyName(cleanSender);
        if (candidate.length >= 2 && candidate.length <= 35) {
          return candidate;
        }
      }
    }
    if (senderEmail && senderEmail.includes("@")) {
      const domain = senderEmail.split("@")[1]?.toLowerCase()?.trim() ?? "";
      const isGeneric = GENERIC_EMAIL_DOMAINS.has(domain);
      const isAts = ATS_DOMAINS.some((ats) => domain.includes(ats));
      if (!isGeneric && !isAts && domain.includes(".")) {
        const parts = domain.split(".");
        const mainPart = parts.length > 2 && parts[0] === "jobs" ? parts[1] : parts[0];
        if (mainPart && mainPart.length >= 2) {
          return sanitizeCompanyName(mainPart);
        }
      }
    }
    const bodyPatterns = [
      /thank\s+you\s+for\s+your\s+interest\s+in\s+(?:a\s+career\s+at\s+|the\s+[^.]+\s+at\s+)?([A-Za-z0-9\s&.,'-]+?)(?:\.|\n|<)/i,
      /thank\s+you\s+for\s+applying\s+to\s+([A-Za-z0-9\s&.,'-]+?)(?:\.|\n|<)/i,
      /the\s+([A-Za-z0-9\s&.,'-]+?)\s+(?:recruiting|talent|hiring)\s+team/i
    ];
    for (const pat of bodyPatterns) {
      const match = body.match(pat);
      if (match && match[1]) {
        const candidate = sanitizeCompanyName(match[1]);
        if (candidate.length >= 2 && candidate.length <= 40) {
          return candidate;
        }
      }
    }
    return "";
  }
  function findSentenceSnippet(text, matchIndex, matchLength) {
    if (matchIndex < 0) return "";
    const start = Math.max(0, text.lastIndexOf(".", matchIndex) + 1);
    let end = text.indexOf(".", matchIndex + matchLength);
    if (end === -1) end = Math.min(text.length, matchIndex + matchLength + 60);
    else end = end + 1;
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    return snippet.length > 180 ? snippet.slice(0, 177) + "..." : snippet;
  }
  function classifyRecruiterEmail(subject, senderName, senderEmail, body) {
    const fullText = `${subject}

${body}`;
    const company = extractCompany(senderName, senderEmail, subject, body);
    let bestMatch = null;
    for (const rule of RULES) {
      const match = fullText.match(rule.pattern);
      if (match && match.index !== void 0) {
        const snippet = findSentenceSnippet(fullText, match.index, match[0].length);
        if (rule.isNegative) {
          return {
            company: company || "Unknown Company",
            stage: "rejected",
            confidence: rule.weight,
            snippet: snippet || match[0],
            subject,
            sender: senderName || senderEmail,
            sender_email: senderEmail,
            raw_body: body.slice(0, 1e3)
          };
        }
        if (!bestMatch || rule.weight > bestMatch.confidence) {
          bestMatch = {
            stage: rule.stage,
            confidence: rule.weight,
            snippet: snippet || match[0]
          };
        }
      }
    }
    if (!bestMatch) {
      return null;
    }
    return {
      company: company || "Detected Company",
      stage: bestMatch.stage,
      confidence: bestMatch.confidence,
      snippet: bestMatch.snippet,
      subject,
      sender: senderName || senderEmail,
      sender_email: senderEmail,
      raw_body: body.slice(0, 1e3)
    };
  }

  // browser-extension/src/parsers/gmail.ts
  var lastScannedEmailId = "";
  var currentBanner = null;
  var currentModal = null;
  var floatingControl = null;
  function isGmailPage() {
    return window.location.hostname === "mail.google.com" || window.location.hostname.endsWith(".mail.google.com");
  }
  function extractGmailEmailData() {
    if (!isGmailPage()) return null;
    let subject = "";
    const subjectEl = document.querySelector("h2.hP") || document.querySelector("div[role='main'] h2") || document.querySelector("div.ha h2") || document.querySelector("span.bog") || document.querySelector("[data-legacy-thread-id] h2") || document.querySelector("div.y6 span");
    if (subjectEl?.innerText?.trim()) {
      subject = subjectEl.innerText.trim();
    } else if (document.title && !document.title.startsWith("Inbox") && !document.title.startsWith("Gmail")) {
      subject = document.title.replace(/\s*-\s*[^@\s]+@[^\s]+\s*-\s*Gmail$/i, "").replace(/\s*-\s*Gmail$/i, "").trim();
    }
    let senderName = "";
    let senderEmail = "";
    const senderEls = Array.from(
      document.querySelectorAll(
        "span.gD, span[email], span[data-hovercard-id], span.g2, div.adn span.gD, span.go"
      )
    );
    if (senderEls.length > 0) {
      const latestSenderEl = senderEls[senderEls.length - 1];
      senderName = latestSenderEl.getAttribute("name") || latestSenderEl.innerText?.trim() || "";
      senderEmail = latestSenderEl.getAttribute("email") || latestSenderEl.getAttribute("data-hovercard-id") || "";
      if (!senderEmail && latestSenderEl.innerText) {
        const emailMatch = latestSenderEl.innerText.match(/<([^>]+@[^>]+)>/);
        if (emailMatch) senderEmail = emailMatch[1];
      }
    }
    const bodyEls = Array.from(
      document.querySelectorAll(
        "div.a3s.aiL, div.a3s, div.ii.gt, div.adn div[dir='ltr'], div[role='listitem'] div[dir='ltr']"
      )
    );
    let body = "";
    if (bodyEls.length > 0) {
      const visibleBodies = bodyEls.filter((el) => {
        const text = el.innerText?.trim() || "";
        if (text.length === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0 || el.offsetParent !== null;
      });
      if (visibleBodies.length > 0) {
        const latestBody = visibleBodies[visibleBodies.length - 1].innerText.trim();
        if (latestBody.length > 60 || visibleBodies.length === 1) {
          body = latestBody;
        } else {
          body = visibleBodies.map((b) => b.innerText.trim()).join("\n\n---\n\n");
        }
      }
    }
    if (!body) {
      const mainEl = document.querySelector("div[role='main']");
      if (mainEl && mainEl.innerText.trim().length > 60) {
        body = mainEl.innerText.trim();
      }
    }
    if (!subject && !body) {
      return null;
    }
    const emailId = `${subject}__${senderEmail}__${body.slice(0, 100)}`;
    return { subject, senderName, senderEmail, body, emailId };
  }
  function scanVisibleInboxRows() {
    if (!isGmailPage()) return [];
    const rows = Array.from(document.querySelectorAll("tr.zA"));
    const detectedList = [];
    for (const row of rows) {
      const senderEl = row.querySelector(
        "span.bA4 span.zF, span.yP, span.zF, span[email], span[name], div.yW span"
      );
      const subjectEl = row.querySelector("span.bog span, span.bog, div.y6 span");
      const snippetEl = row.querySelector("span.y2");
      const dateEl = row.querySelector("td.xW span, td.xW");
      const senderName = senderEl?.innerText?.trim() || senderEl?.getAttribute("name") || "";
      const senderEmail = senderEl?.getAttribute("email") || "";
      const subject = subjectEl?.innerText?.trim() || "";
      const snippet = snippetEl?.innerText?.trim() || "";
      const dateStr = dateEl?.innerText?.trim() || "";
      if (!subject && !snippet) continue;
      const classification = classifyRecruiterEmail(
        subject,
        senderName,
        senderEmail,
        snippet
      );
      if (classification && classification.confidence >= 0.7) {
        detectedList.push({
          company: classification.company,
          newStatus: classification.stage,
          confidence: classification.confidence,
          subject: classification.subject,
          sender: classification.sender,
          snippet: classification.snippet,
          dateStr
        });
      }
    }
    return detectedList;
  }
  function matchWithTrackedApplications(scannedUpdates, trackedApps) {
    const matched = [];
    for (const update of scannedUpdates) {
      const compLower = update.company.toLowerCase().trim();
      if (!compLower) continue;
      const match = trackedApps.find((app) => {
        const appComp = app.company.toLowerCase().trim();
        return appComp === compLower || appComp.includes(compLower) || compLower.includes(appComp);
      });
      if (match) {
        matched.push({
          ...update,
          applicationId: match.id,
          role: match.role,
          previousStatus: match.status
        });
      } else {
        matched.push(update);
      }
    }
    const unique = /* @__PURE__ */ new Map();
    for (const m of matched) {
      const key = `${m.company.toLowerCase()}__${m.newStatus}`;
      if (!unique.has(key) || m.confidence > (unique.get(key)?.confidence || 0)) {
        unique.set(key, m);
      }
    }
    return Array.from(unique.values());
  }
  function scanGmailAndSync(onStatusDetected) {
    if (!isGmailPage()) return;
    if (window.top !== window.self) return;
    ensureFloatingControlMounted();
    const data = extractGmailEmailData();
    if (!data) {
      removeBanner();
      return;
    }
    if (data.emailId === lastScannedEmailId) {
      return;
    }
    lastScannedEmailId = data.emailId;
    const classification = classifyRecruiterEmail(
      data.subject,
      data.senderName,
      data.senderEmail,
      data.body
    );
    if (classification) {
      renderGmailBanner(classification, (confirmed) => {
        onStatusDetected(confirmed);
      });
    } else {
      removeBanner();
    }
  }
  function removeBanner() {
    if (currentBanner && currentBanner.parentNode) {
      currentBanner.parentNode.removeChild(currentBanner);
      currentBanner = null;
    }
  }
  function removeModal() {
    if (currentModal && currentModal.parentNode) {
      currentModal.parentNode.removeChild(currentModal);
      currentModal = null;
    }
  }
  function getStageBadgeStyle(stage) {
    switch (stage) {
      case "offer":
        return { bg: "rgba(16, 185, 129, 0.2)", color: "#34d399", label: "Offer Received", icon: "\u{1F389}" };
      case "interview":
        return { bg: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", label: "Interview Scheduled", icon: "\u{1F4C5}" };
      case "screening":
        return { bg: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", label: "Assessment / OA", icon: "\u{1F4BB}" };
      case "rejected":
        return { bg: "rgba(239, 68, 68, 0.2)", color: "#f87171", label: "Not Moving Forward", icon: "\u{1F6D1}" };
      case "applied":
        return { bg: "rgba(99, 102, 241, 0.2)", color: "#818cf8", label: "Applied", icon: "\u{1F4EC}" };
      default:
        return { bg: "rgba(107, 114, 128, 0.2)", color: "#9ca3af", label: "Status Update", icon: "\u2139\uFE0F" };
    }
  }
  function renderGmailBanner(classification, onConfirm) {
    removeBanner();
    const badge = getStageBadgeStyle(classification.stage);
    const banner = document.createElement("div");
    banner.id = "jobtracker-gmail-banner";
    banner.style.cssText = `
    position: fixed;
    top: 72px;
    right: 24px;
    z-index: 2147483647;
    max-width: 400px;
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 12px;
    padding: 16px 18px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.55);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    animation: jtSlideDown 250ms cubic-bezier(0.16, 1, 0.3, 1);
  `;
    banner.innerHTML = `
    <style>
      @keyframes jtSlideDown {
        from { opacity: 0; transform: translateY(-16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .jt-btn-primary {
        background: #4f46e5;
        color: #ffffff;
        border: none;
        border-radius: 6px;
        padding: 7px 14px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 150ms;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .jt-btn-primary:hover {
        background: #4338ca;
        transform: translateY(-1px);
      }
      .jt-btn-close {
        background: transparent;
        border: none;
        color: #a1a1aa;
        cursor: pointer;
        font-size: 16px;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .jt-btn-close:hover {
        color: #ffffff;
        background: #27272a;
      }
    </style>
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 15px;">${badge.icon}</span>
        <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #a1a1aa;">JobTracker Assistant</span>
      </div>
      <button class="jt-btn-close" id="jt-dismiss-btn" title="Dismiss">\u2715</button>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
      <div style="font-size: 15px; font-weight: 800; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${classification.company}
      </div>
      <div style="background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.color}40; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 9999px; white-space: nowrap;">
        ${badge.label}
      </div>
    </div>

    ${classification.snippet ? `
      <div style="font-size: 11px; color: #d4d4d8; line-height: 1.45; background: #27272a; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; border-left: 3px solid ${badge.color}; font-style: italic;">
        "${classification.snippet}"
      </div>
    ` : ""}

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px;">
      <span style="font-size: 11px; color: #71717a; font-weight: 600;">
        Match: ${(classification.confidence * 100).toFixed(0)}%
      </span>
      <button class="jt-btn-primary" id="jt-apply-btn">
        Move to ${classification.stage.charAt(0).toUpperCase() + classification.stage.slice(1)} \u2192
      </button>
    </div>
  `;
    document.body.appendChild(banner);
    currentBanner = banner;
    const applyBtn = banner.querySelector("#jt-apply-btn");
    const dismissBtn = banner.querySelector("#jt-dismiss-btn");
    applyBtn?.addEventListener("click", () => {
      applyBtn.innerText = "\u2713 Syncing...";
      applyBtn.style.background = "#10b981";
      setTimeout(() => removeBanner(), 1200);
      onConfirm(classification);
    });
    dismissBtn?.addEventListener("click", () => {
      removeBanner();
    });
  }
  function ensureFloatingControlMounted() {
    if (floatingControl && document.body.contains(floatingControl)) return;
    if (!isGmailPage() || window.top !== window.self) return;
    const control = document.createElement("div");
    control.id = "jobtracker-gmail-floating-control";
    control.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483640;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #1e1b4b;
    color: #ffffff;
    border: 1px solid #4338ca;
    border-radius: 9999px;
    padding: 8px 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    cursor: pointer;
    transition: all 180ms ease;
    user-select: none;
  `;
    control.innerHTML = `
    <span style="font-size: 15px;">\u26A1</span>
    <span style="font-size: 13px; font-weight: 700; letter-spacing: -0.01em;">JobTracker Scanner</span>
    <span id="jt-scan-badge" style="background: #4f46e5; color: #ffffff; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 9999px;">Scan</span>
  `;
    control.addEventListener("mouseenter", () => {
      control.style.transform = "translateY(-2px)";
      control.style.boxShadow = "0 14px 36px rgba(79, 70, 229, 0.4)";
    });
    control.addEventListener("mouseleave", () => {
      control.style.transform = "translateY(0)";
      control.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
    });
    control.addEventListener("click", () => {
      triggerFullInboxScanAndModal();
    });
    document.body.appendChild(control);
    floatingControl = control;
  }
  async function triggerFullInboxScanAndModal() {
    const badge = floatingControl?.querySelector("#jt-scan-badge");
    if (badge) badge.innerText = "Scanning...";
    const visibleUpdates = scanVisibleInboxRows();
    const openThreadData = extractGmailEmailData();
    if (openThreadData) {
      const threadClass = classifyRecruiterEmail(
        openThreadData.subject,
        openThreadData.senderName,
        openThreadData.senderEmail,
        openThreadData.body
      );
      if (threadClass) {
        visibleUpdates.unshift({
          company: threadClass.company,
          newStatus: threadClass.stage,
          confidence: threadClass.confidence,
          subject: threadClass.subject,
          sender: threadClass.sender,
          snippet: threadClass.snippet,
          dateStr: "Active Thread"
        });
      }
    }
    chrome.runtime.sendMessage({ type: "GET_TRACKED_APPLICATIONS" }, (response) => {
      const trackedApps = response?.applications || [];
      const matchedUpdates = matchWithTrackedApplications(visibleUpdates, trackedApps);
      if (badge) badge.innerText = `${matchedUpdates.length} Found`;
      renderScanModal(matchedUpdates);
    });
  }
  function renderScanModal(matchedUpdates) {
    removeModal();
    const modal = document.createElement("div");
    modal.id = "jobtracker-gmail-scan-modal";
    modal.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    animation: jtFadeIn 150ms ease-out;
  `;
    modal.innerHTML = `
    <style>
      @keyframes jtFadeIn { from { opacity: 0; } to { opacity: 1; } }
      .jt-modal-card {
        background: #18181b;
        color: #f4f4f5;
        border: 1px solid #3f3f46;
        border-radius: 16px;
        width: 620px;
        max-width: 92vw;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 24px 60px rgba(0,0,0,0.6);
        overflow: hidden;
      }
      .jt-item-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid #27272a;
        transition: background 120ms;
      }
      .jt-item-row:hover {
        background: #27272a50;
      }
      .jt-modal-btn-primary {
        background: #4f46e5;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 9px 18px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 150ms;
      }
      .jt-modal-btn-primary:hover {
        background: #4338ca;
        transform: translateY(-1px);
      }
    </style>

    <div class="jt-modal-card">
      <div style="padding: 16px 20px; border-bottom: 1px solid #27272a; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">\u26A1</span>
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #ffffff;">Recruiter Emails & Status Sync</h3>
            <p style="margin: 0; font-size: 12px; color: #a1a1aa;">Scanned from your Gmail inbox & matched against JobTracker</p>
          </div>
        </div>
        <button id="jt-modal-close" style="background: transparent; border: none; color: #a1a1aa; font-size: 18px; cursor: pointer;">\u2715</button>
      </div>

      <div style="padding: 12px 20px; overflow-y: auto; flex: 1;">
        ${matchedUpdates.length === 0 ? `
          <div style="text-align: center; padding: 40px 20px; color: #a1a1aa;">
            <div style="font-size: 32px; margin-bottom: 8px;">\u{1F50D}</div>
            <div style="font-size: 15px; font-weight: 700; color: #ffffff;">No recruiter status updates found</div>
            <div style="font-size: 12px; margin-top: 4px;">Open your Job Search folder/inbox or click into a recruiter email to scan.</div>
          </div>
        ` : matchedUpdates.map((item, idx) => {
      const badge = getStageBadgeStyle(item.newStatus);
      return `
            <div class="jt-item-row">
              <input type="checkbox" checked id="jt-check-${idx}" style="margin-top: 4px; accent-color: #4f46e5; width: 16px; height: 16px; cursor: pointer;" />
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                  <span style="font-size: 14px; font-weight: 800; color: #ffffff;">${item.company}</span>
                  <span style="background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.color}40; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">
                    ${item.previousStatus ? `${item.previousStatus} \u2794 ` : ""}${badge.label}
                  </span>
                </div>
                <div style="font-size: 12px; color: #93c5fd; font-weight: 600; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${item.subject || "Recruiter update"}
                </div>
                ${item.snippet ? `
                  <div style="font-size: 11px; color: #d4d4d8; line-height: 1.4; background: #27272a; padding: 6px 8px; border-radius: 4px; border-left: 3px solid ${badge.color}; font-style: italic;">
                    "${item.snippet}"
                  </div>
                ` : ""}
              </div>
            </div>
          `;
    }).join("")}
      </div>

      <div style="padding: 14px 20px; border-top: 1px solid #27272a; display: flex; align-items: center; justify-content: space-between; background: #121214;">
        <span style="font-size: 12px; color: #a1a1aa;">
          ${matchedUpdates.length} update(s) ready to sync
        </span>
        <div style="display: flex; gap: 8px;">
          <button id="jt-modal-cancel" style="background: #27272a; color: #d4d4d8; border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;">
            Close
          </button>
          ${matchedUpdates.length > 0 ? `
            <button id="jt-modal-sync-all" class="jt-modal-btn-primary">
              Sync All to Kanban (${matchedUpdates.length}) \u2192
            </button>
          ` : ""}
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(modal);
    currentModal = modal;
    modal.querySelector("#jt-modal-close")?.addEventListener("click", removeModal);
    modal.querySelector("#jt-modal-cancel")?.addEventListener("click", removeModal);
    const syncAllBtn = modal.querySelector("#jt-modal-sync-all");
    syncAllBtn?.addEventListener("click", () => {
      syncAllBtn.innerText = "Syncing...";
      syncAllBtn.setAttribute("disabled", "true");
      const selectedUpdates = matchedUpdates.filter((_, idx) => {
        const checkbox = modal.querySelector(`#jt-check-${idx}`);
        return checkbox ? checkbox.checked : true;
      });
      const payload = selectedUpdates.map((u) => ({
        company: u.company,
        status: u.newStatus,
        role: u.role,
        email_subject: u.subject,
        sender: u.sender,
        snippet: u.snippet,
        confidence: u.confidence,
        matched_at: (/* @__PURE__ */ new Date()).toISOString()
      }));
      chrome.runtime.sendMessage({ type: "BATCH_STATUS_UPDATE", updates: payload }, (res) => {
        if (res?.success) {
          syncAllBtn.innerText = `\u2713 Updated ${res.updated_count || payload.length} Application(s)!`;
          syncAllBtn.style.background = "#10b981";
          setTimeout(() => removeModal(), 1500);
        } else {
          syncAllBtn.innerText = "Sync Failed";
          syncAllBtn.style.background = "#ef4444";
        }
      });
    });
  }

  // browser-extension/src/content.ts
  var lastSentUrl = "";
  var lastJobJson = "";
  var debounceTimer = null;
  console.log("[JobTracker] Content script active on:", window.location.href);
  function scanAndNotify() {
    const currentUrl = window.location.href;
    if (isGmailPage()) {
      if (window.top === window.self) {
        ensureFloatingControlMounted();
        scanGmailAndSync((classification) => {
          chrome.runtime.sendMessage({
            type: "EMAIL_STATUS_DETECTED",
            classification
          }).catch(() => {
          });
        });
      }
      return;
    }
    const isIframe = window.top !== window.self;
    const job = extractJobFromDocument(document, currentUrl);
    if (!job) {
      if (!isIframe) {
        chrome.runtime.sendMessage({
          type: "JOB_CLEARED",
          url: currentUrl
        }).catch(() => {
        });
      }
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
  function debouncedScan(delay = 500) {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      scanAndNotify();
    }, delay);
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    debouncedScan(250);
  } else {
    window.addEventListener("DOMContentLoaded", () => debouncedScan(250));
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
      debouncedScan(600);
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
    debouncedScan(300);
    return res;
  };
  var originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    const res = originalReplaceState.apply(this, args);
    debouncedScan(300);
    return res;
  };
  window.addEventListener("popstate", () => debouncedScan(300));
  window.addEventListener("hashchange", () => debouncedScan(300));
  if (isGmailPage() && window.top === window.self) {
    ensureFloatingControlMounted();
    setInterval(() => {
      ensureFloatingControlMounted();
      scanGmailAndSync((classification) => {
        chrome.runtime.sendMessage({
          type: "EMAIL_STATUS_DETECTED",
          classification
        }).catch(() => {
        });
      });
    }, 1800);
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "TRIGGER_GMAIL_INBOX_SCAN") {
      if (isGmailPage()) {
        triggerFullInboxScanAndModal();
        sendResponse({ success: true });
        return true;
      } else {
        sendResponse({ success: false, error: "Not on Gmail page" });
        return true;
      }
    }
    if (message.type === "SCAN_CURRENT_PAGE") {
      if (isGmailPage()) {
        const emailData = extractGmailEmailData();
        if (emailData) {
          const classification = classifyRecruiterEmail(
            emailData.subject,
            emailData.senderName,
            emailData.senderEmail,
            emailData.body
          );
          sendResponse({ emailClassification: classification, emailData });
          return true;
        }
        sendResponse({ emailClassification: null });
        return true;
      }
      const job = extractJobFromDocument(document, window.location.href);
      sendResponse({ job });
      return true;
    }
  });
})();
