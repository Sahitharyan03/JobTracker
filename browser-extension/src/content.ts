import { extractJobFromDocument } from "./parsers";
import { extractGmailEmailData, isGmailPage, scanGmailAndSync } from "./parsers/gmail";
import { classifyRecruiterEmail } from "./parsers/emailClassifier";
import { DetectedJob } from "./types";

let lastSentUrl = "";
let lastJobJson = "";
let debounceTimer: number | null = null;

console.log("[JobTracker] Content script active on:", window.location.href);

function scanAndNotify() {
  const currentUrl = window.location.href;

  // 1. If on Gmail, check for recruiter emails
  if (isGmailPage()) {
    if (window.top === window.self) {
      scanGmailAndSync((classification) => {
        chrome.runtime.sendMessage({
          type: "EMAIL_STATUS_DETECTED",
          classification,
        }).catch(() => {});
      });
    }
    return;
  }

  // 2. Otherwise scan for job posting on careers pages
  const isIframe = window.top !== window.self;
  const job = extractJobFromDocument(document, currentUrl);

  if (!job) {
    if (!isIframe) {
      chrome.runtime.sendMessage({
        type: "JOB_CLEARED",
        url: currentUrl,
      }).catch(() => {});
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
    job,
  }).catch(() => {});
}

function debouncedScan(delay = 500) {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(() => {
    scanAndNotify();
  }, delay);
}

// Initial scan
if (document.readyState === "complete" || document.readyState === "interactive") {
  debouncedScan(250);
} else {
  window.addEventListener("DOMContentLoaded", () => debouncedScan(250));
}

// Watch for DOM mutations in single-page apps (SPAs like Gmail, LinkedIn, Greenhouse)
const observer = new MutationObserver((mutations) => {
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
  characterData: true,
});

// Watch for URL / history changes in SPAs
const originalPushState = history.pushState;
history.pushState = function (...args) {
  const res = originalPushState.apply(this, args);
  debouncedScan(300);
  return res;
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  const res = originalReplaceState.apply(this, args);
  debouncedScan(300);
  return res;
};

window.addEventListener("popstate", () => debouncedScan(300));
window.addEventListener("hashchange", () => debouncedScan(300));

// If on Gmail, run a gentle periodic poll every 1.8 seconds in the top frame to catch SPA transitions
if (isGmailPage() && window.top === window.self) {
  setInterval(() => {
    scanGmailAndSync((classification) => {
      chrome.runtime.sendMessage({
        type: "EMAIL_STATUS_DETECTED",
        classification,
      }).catch(() => {});
    });
  }, 1800);
}

// Listen for explicit rescan requests from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TRIGGER_GMAIL_INBOX_SCAN") {
    if (isGmailPage()) {
      import("./parsers/gmail").then(({ triggerFullInboxScanAndModal }) => {
        triggerFullInboxScanAndModal();
        sendResponse({ success: true });
      });
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
          emailData.body,
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


