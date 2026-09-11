import { DetectedJob, ExtensionSettings } from "./types";

const connectionPill = document.getElementById("connectionPill")!;
const connectionText = document.getElementById("connectionText")!;
const jobCard = document.getElementById("jobCard")!;
const emptyCard = document.getElementById("emptyCard")!;
const sourceBadge = document.getElementById("sourceBadge")!;
const portalBadge = document.getElementById("portalBadge")!;
const jobRole = document.getElementById("jobRole")!;
const jobCompany = document.getElementById("jobCompany")!;
const jobWorkType = document.getElementById("jobWorkType")!;
const jobLocation = document.getElementById("jobLocation")!;
const jobSalary = document.getElementById("jobSalary")!;
const salaryWrapper = document.getElementById("salaryWrapper")!;
const jobId = document.getElementById("jobId")!;
const jobIdWrapper = document.getElementById("jobIdWrapper")!;
const sendBtn = document.getElementById("sendBtn")!;
const rescanBtn = document.getElementById("rescanBtn")!;
const emptyRescanBtn = document.getElementById("emptyRescanBtn")!;
const toggleSettingsBtn = document.getElementById("toggleSettingsBtn")!;
const settingsPanel = document.getElementById("settingsPanel")!;
const tokenInput = document.getElementById("tokenInput") as HTMLInputElement;
const autoCaptureCheck = document.getElementById("autoCaptureCheck") as HTMLInputElement;
const saveSettingsBtn = document.getElementById("saveSettingsBtn")!;
const testConnectionBtn = document.getElementById("testConnectionBtn")!;
const toastEl = document.getElementById("toast")!;

let currentJob: DetectedJob | null = null;
let toastTimeout: number | null = null;

function showToast(message: string, type: "success" | "error" = "success") {
  if (toastTimeout) window.clearTimeout(toastTimeout);
  toastEl.textContent = message;
  toastEl.className = `toast toast-${type}`;
  toastEl.classList.remove("hidden");
  toastTimeout = window.setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 3500);
}

function updateConnectionStatus(connected: boolean) {
  if (connected) {
    connectionPill.className = "status-pill status-connected";
    connectionText.textContent = "Connected";
  } else {
    connectionPill.className = "status-pill status-disconnected";
    connectionText.textContent = "Disconnected";
  }
}

function renderJob(job: DetectedJob | null) {
  currentJob = job;
  if (!job) {
    jobCard.classList.add("hidden");
    emptyCard.classList.remove("hidden");
    return;
  }

  emptyCard.classList.add("hidden");
  jobCard.classList.remove("hidden");

  jobRole.textContent = job.role || "Untitled Position";
  jobCompany.textContent = job.company || "Unknown Company";
  sourceBadge.textContent = job.source.toUpperCase();
  portalBadge.textContent = job.portal || "Web";
  jobWorkType.textContent = job.work_type;
  jobLocation.textContent = job.location || "Not specified";

  if (job.salary) {
    salaryWrapper.classList.remove("hidden");
    jobSalary.textContent = job.salary;
  } else {
    salaryWrapper.classList.add("hidden");
  }

  if (job.job_id) {
    jobIdWrapper.classList.remove("hidden");
    jobId.textContent = `#${job.job_id}`;
  } else {
    jobIdWrapper.classList.add("hidden");
  }
}

// Load status from background
async function loadStatus() {
  chrome.runtime.sendMessage({ type: "GET_CURRENT_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      updateConnectionStatus(false);
      return;
    }
    updateConnectionStatus(response.connected);
    renderJob(response.job);
  });
}

// Rescan current tab
async function rescanActiveTab() {
  showToast("Scanning page...", "success");
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;

  chrome.tabs.sendMessage(activeTab.id, { type: "SCAN_CURRENT_PAGE" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.job) {
      renderJob(null);
      showToast("No job found on this page", "error");
    } else {
      renderJob(response.job);
      showToast("Job details detected!", "success");
      // also notify background
      chrome.runtime.sendMessage({ type: "JOB_DETECTED", job: response.job });
    }
  });
}

// Send job to desktop
sendBtn.addEventListener("click", () => {
  if (!currentJob) return;
  sendBtn.setAttribute("disabled", "true");
  chrome.runtime.sendMessage({ type: "MANUAL_SEND_JOB", job: currentJob }, (res) => {
    sendBtn.removeAttribute("disabled");
    if (res?.success) {
      showToast("Sent to JobTracker desktop!", "success");
    } else {
      showToast(res?.error || "Failed to send to desktop", "error");
    }
  });
});

rescanBtn.addEventListener("click", rescanActiveTab);
emptyRescanBtn.addEventListener("click", rescanActiveTab);

// Toggle Settings
toggleSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

// Load settings into inputs
chrome.storage.local.get("settings", (data) => {
  const settings: ExtensionSettings = data.settings || {};
  if (settings.token) tokenInput.value = settings.token;
  if (typeof settings.autoCapture === "boolean") {
    autoCaptureCheck.checked = settings.autoCapture;
  }
});

// Save settings
saveSettingsBtn.addEventListener("click", async () => {
  const settings: ExtensionSettings = {
    token: tokenInput.value.trim(),
    autoCapture: autoCaptureCheck.checked,
    serverUrl: "http://127.0.0.1:41724",
  };
  await chrome.storage.local.set({ settings });
  showToast("Settings saved!", "success");

  // Recheck connection
  chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
    updateConnectionStatus(Boolean(res?.success));
  });
});

// Test Connection
testConnectionBtn.addEventListener("click", () => {
  testConnectionBtn.setAttribute("disabled", "true");
  chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
    testConnectionBtn.removeAttribute("disabled");
    if (res?.success) {
      updateConnectionStatus(true);
      showToast(res.message, "success");
    } else {
      updateConnectionStatus(false);
      showToast(res?.message || "Connection failed", "error");
    }
  });
});

// Init
loadStatus();
