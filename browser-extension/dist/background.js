// browser-extension/src/background.ts
var DEFAULT_SETTINGS = {
  token: "",
  autoCapture: true,
  serverUrl: "http://127.0.0.1:41724"
};
var latestDetectedJob = null;
var isConnected = false;
var lastConnectionCheck = 0;
async function getSettings() {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...data.settings };
}
async function checkDesktopConnection() {
  const now = Date.now();
  if (now - lastConnectionCheck < 3e3) {
    return isConnected;
  }
  lastConnectionCheck = now;
  try {
    const settings = await getSettings();
    const res = await fetch(`${settings.serverUrl}/api/status`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (res.ok) {
      const data = await res.json();
      isConnected = data.status === "ok";
      return isConnected;
    }
  } catch {
    isConnected = false;
  }
  return isConnected;
}
async function sendJobToDesktop(job) {
  try {
    const settings = await getSettings();
    const payload = {
      company: job.company,
      role: job.role,
      location: job.location,
      portal: job.portal,
      work_type: job.work_type,
      salary: job.salary,
      job_id: job.job_id,
      url: job.url,
      description: job.description,
      employment_type: job.employment_type
    };
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (settings.token) {
      headers["Authorization"] = `Bearer ${settings.token}`;
    }
    const res = await fetch(`${settings.serverUrl}/api/capture`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      isConnected = true;
      return { success: true };
    } else {
      const txt = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${txt}` };
    }
  } catch (err) {
    isConnected = false;
    return { success: false, error: err.message || "Failed to reach desktop app" };
  }
}
var tabJobs = /* @__PURE__ */ new Map();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOB_DETECTED" && sender.tab?.id) {
    const tabId = sender.tab.id;
    const job = message.job;
    tabJobs.set(tabId, job);
    latestDetectedJob = job;
    chrome.storage.local.set({ latestDetectedJob: job });
    getSettings().then((settings) => {
      if (settings.autoCapture) {
        sendJobToDesktop(job);
      }
    });
    chrome.action.setBadgeText({ text: "\u2713", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4F46E5", tabId });
    sendResponse({ received: true });
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
          job: activeJob || null
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
  } else if (message.type === "TEST_CONNECTION") {
    getSettings().then(async (settings) => {
      try {
        const headers = { Accept: "application/json" };
        if (settings.token) headers["Authorization"] = `Bearer ${settings.token}`;
        const res = await fetch(`${settings.serverUrl}/api/status`, {
          method: "GET",
          headers
        });
        if (res.ok) {
          isConnected = true;
          sendResponse({ success: true, message: "Connected to JobTracker desktop app!" });
        } else {
          sendResponse({ success: false, message: `Server error: HTTP ${res.status}` });
        }
      } catch (err) {
        sendResponse({ success: false, message: "Could not reach desktop server on 127.0.0.1:41724. Ensure JobTracker is running." });
      }
    });
    return true;
  }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const job = tabJobs.get(activeInfo.tabId);
  if (job) {
    latestDetectedJob = job;
    chrome.action.setBadgeText({ text: "\u2713", tabId: activeInfo.tabId });
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
