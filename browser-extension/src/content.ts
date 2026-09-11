import { extractJobFromDocument } from "./parsers";
import { DetectedJob } from "./types";

let lastSentUrl = "";
let lastJobJson = "";
let debounceTimer: number | null = null;

function scanAndNotify() {
  const isIframe = window.top !== window.self;
  const currentUrl = window.location.href;
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

function debouncedScan(delay = 600) {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(() => {
    scanAndNotify();
  }, delay);
}

// Initial scan
if (document.readyState === "complete" || document.readyState === "interactive") {
  debouncedScan(300);
} else {
  window.addEventListener("DOMContentLoaded", () => debouncedScan(300));
}

// Watch for DOM mutations in single-page apps (SPAs)
const observer = new MutationObserver((mutations) => {
  let hasMeaningfulChange = false;
  for (const m of mutations) {
    if (m.addedNodes.length > 0 || m.type === "characterData") {
      hasMeaningfulChange = true;
      break;
    }
  }
  if (hasMeaningfulChange) {
    debouncedScan(1000);
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
  debouncedScan(400);
  return res;
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  const res = originalReplaceState.apply(this, args);
  debouncedScan(400);
  return res;
};

window.addEventListener("popstate", () => debouncedScan(400));
window.addEventListener("hashchange", () => debouncedScan(400));

// Listen for explicit rescan requests from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCAN_CURRENT_PAGE") {
    const job = extractJobFromDocument(document, window.location.href);
    sendResponse({ job });
  }
});
