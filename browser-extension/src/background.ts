import { CapturePayload, DetectedJob, ExtensionSettings } from "./types";
import { EmailClassification } from "./parsers/emailClassifier";

const DEFAULT_SETTINGS: ExtensionSettings = {
  token: "jt_default_local_token",
  autoCapture: true,
  serverUrl: "http://127.0.0.1:41724",
};

let latestDetectedJob: DetectedJob | null = null;
let isConnected = false;
let lastConnectionCheck = 0;

async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...data.settings };
}

async function checkDesktopConnection(): Promise<boolean> {
  const now = Date.now();
  if (now - lastConnectionCheck < 3000) {
    return isConnected;
  }
  lastConnectionCheck = now;
  try {
    const settings = await getSettings();
    const res = await fetch(`${settings.serverUrl}/api/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      isConnected = data.status === "ok" || data.status === "online" || data.online === true;
      return isConnected;
    }
  } catch {
    isConnected = false;
  }
  return isConnected;
}

async function sendJobToDesktop(job: DetectedJob): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await getSettings();
    const payload: CapturePayload = {
      company: job.company,
      role: job.role,
      location: job.location,
      portal: job.portal,
      work_type: job.work_type,
      salary: job.salary,
      job_id: job.job_id,
      url: job.url,
      description: job.description,
      employment_type: job.employment_type,
      captured_at: new Date().toISOString(),
    };

    const token = settings.token || "jt_default_local_token";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Authorization": `Bearer ${token}`,
      "X-JobTracker-Token": token,
    };

    const res = await fetch(`${settings.serverUrl}/api/capture`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      isConnected = true;
      return { success: true };
    } else {
      const txt = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${txt}` };
    }
  } catch (err: any) {
    isConnected = false;
    return { success: false, error: err.message || "Failed to reach desktop app" };
  }
}

async function sendStatusUpdateToDesktop(
  classification: EmailClassification,
): Promise<{ success: boolean; updated?: boolean; error?: string }> {
  try {
    const settings = await getSettings();
    const token = settings.token || "jt_default_local_token";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Authorization": `Bearer ${token}`,
      "X-JobTracker-Token": token,
    };

    const payload = {
      company: classification.company,
      status: classification.stage,
      email_subject: classification.subject,
      sender: classification.sender,
      snippet: classification.snippet,
      confidence: classification.confidence,
      matched_at: new Date().toISOString(),
    };

    const res = await fetch(`${settings.serverUrl}/api/status-update`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, updated: data.updated };
    } else {
      const txt = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${txt}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to reach desktop app" };
  }
}

// Store per-tab detected jobs
const tabJobs = new Map<number, DetectedJob>();

// Listen to content script messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOB_DETECTED" && sender.tab?.id) {
    const tabId = sender.tab.id;
    const job: DetectedJob = message.job;
    tabJobs.set(tabId, job);
    latestDetectedJob = job;

    chrome.storage.local.set({ latestDetectedJob: job });

    getSettings().then((settings) => {
      if (settings.autoCapture) {
        sendJobToDesktop(job);
      }
    });

    chrome.action.setBadgeText({ text: "✓", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4F46E5", tabId });
    sendResponse({ received: true });
  } else if (message.type === "EMAIL_STATUS_DETECTED") {
    const classification: EmailClassification = message.classification;
    sendStatusUpdateToDesktop(classification).then((result) => {
      sendResponse(result);
    });
    return true; // async sendResponse
  } else if (message.type === "JOB_CLEARED" && sender.tab?.id) {
    const tabId = sender.tab.id;
    tabJobs.delete(tabId);
    chrome.action.setBadgeText({ text: "", tabId });
    sendResponse({ cleared: true });
  } else if (message.type === "GET_CURRENT_STATUS") {
    checkDesktopConnection().then((connected) => {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
        const activeJob = activeTab?.id ? tabJobs.get(activeTab.id) || latestDetectedJob : latestDetectedJob;
        sendResponse({
          connected,
          job: activeJob || null,
        });
      });
    });
    return true;
  } else if (message.type === "MANUAL_SEND_JOB") {
    if (message.job) {
      sendJobToDesktop(message.job).then((result) => {
        sendResponse(result);
      });
      return true;
    }
  } else if (message.type === "GET_TRACKED_APPLICATIONS") {
    getSettings().then(async (settings) => {
      try {
        const token = settings.token || "jt_default_local_token";
        const headers: Record<string, string> = {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "X-JobTracker-Token": token,
        };
        const res = await fetch(`${settings.serverUrl}/api/applications`, {
          method: "GET",
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          sendResponse({ success: true, applications: data.applications || [] });
        } else {
          sendResponse({ success: false, applications: [] });
        }
      } catch {
        sendResponse({ success: false, applications: [] });
      }
    });
    return true;
  } else if (message.type === "BATCH_STATUS_UPDATE") {
    getSettings().then(async (settings) => {
      try {
        const token = settings.token || "jt_default_local_token";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "X-JobTracker-Token": token,
        };
        const res = await fetch(`${settings.serverUrl}/api/batch-status-update`, {
          method: "POST",
          headers,
          body: JSON.stringify({ updates: message.updates }),
        });
        if (res.ok) {
          const data = await res.json();
          sendResponse({ success: true, ...data });
        } else {
          const txt = await res.text();
          sendResponse({ success: false, error: txt });
        }
      } catch (err: any) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  } else if (message.type === "TEST_CONNECTION") {
    getSettings().then(async (settings) => {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (settings.token) headers["Authorization"] = `Bearer ${settings.token}`;
        const res = await fetch(`${settings.serverUrl}/api/status`, {
          method: "GET",
          headers,
        });
        if (res.ok) {
          isConnected = true;
          sendResponse({ success: true, message: "Connected to JobTracker desktop app!" });
        } else {
          sendResponse({ success: false, message: `Server error: HTTP ${res.status}` });
        }
      } catch (err: any) {
        sendResponse({ success: false, message: "Could not reach desktop server on 127.0.0.1:41724. Ensure JobTracker is running." });
      }
    });
    return true;
  }
});

// Update badge when tab switches
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const job = tabJobs.get(activeInfo.tabId);
  if (job) {
    latestDetectedJob = job;
    chrome.action.setBadgeText({ text: "✓", tabId: activeInfo.tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4F46E5", tabId: activeInfo.tabId });
    const settings = await getSettings();
    if (settings.autoCapture) {
      sendJobToDesktop(job);
    }
  } else {
    chrome.action.setBadgeText({ text: "", tabId: activeInfo.tabId });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabJobs.delete(tabId);
});
