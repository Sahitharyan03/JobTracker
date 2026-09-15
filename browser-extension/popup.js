"use strict";
(() => {
  // browser-extension/src/popup.ts
  var connectionPill = document.getElementById("connectionPill");
  var connectionText = document.getElementById("connectionText");
  var jobCard = document.getElementById("jobCard");
  var emptyCard = document.getElementById("emptyCard");
  var sourceBadge = document.getElementById("sourceBadge");
  var portalBadge = document.getElementById("portalBadge");
  var jobRole = document.getElementById("jobRole");
  var jobCompany = document.getElementById("jobCompany");
  var jobWorkType = document.getElementById("jobWorkType");
  var jobLocation = document.getElementById("jobLocation");
  var jobSalary = document.getElementById("jobSalary");
  var salaryWrapper = document.getElementById("salaryWrapper");
  var jobId = document.getElementById("jobId");
  var jobIdWrapper = document.getElementById("jobIdWrapper");
  var sendBtn = document.getElementById("sendBtn");
  var rescanBtn = document.getElementById("rescanBtn");
  var emptyRescanBtn = document.getElementById("emptyRescanBtn");
  var toggleSettingsBtn = document.getElementById("toggleSettingsBtn");
  var settingsPanel = document.getElementById("settingsPanel");
  var tokenInput = document.getElementById("tokenInput");
  var autoCaptureCheck = document.getElementById("autoCaptureCheck");
  var saveSettingsBtn = document.getElementById("saveSettingsBtn");
  var testConnectionBtn = document.getElementById("testConnectionBtn");
  var toastEl = document.getElementById("toast");
  var currentJob = null;
  var toastTimeout = null;
  function showToast(message, type = "success") {
    if (toastTimeout) window.clearTimeout(toastTimeout);
    toastEl.textContent = message;
    toastEl.className = `toast toast-${type}`;
    toastEl.classList.remove("hidden");
    toastTimeout = window.setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 3500);
  }
  function updateConnectionStatus(connected) {
    if (connected) {
      connectionPill.className = "status-pill status-connected";
      connectionText.textContent = "Connected";
    } else {
      connectionPill.className = "status-pill status-disconnected";
      connectionText.textContent = "Disconnected";
    }
  }
  function renderJob(job) {
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
  async function rescanActiveTab() {
    showToast("Scanning page...", "success");
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;
    chrome.tabs.sendMessage(activeTab.id, { type: "SCAN_CURRENT_PAGE" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderJob(null);
        showToast("Could not scan page (please refresh tab)", "error");
        return;
      }
      if (response.emailClassification) {
        const { company, stage, confidence } = response.emailClassification;
        showToast(`\u2709\uFE0F ${company}: ${stage.toUpperCase()} (${(confidence * 100).toFixed(0)}%)`, "success");
        chrome.runtime.sendMessage({
          type: "EMAIL_STATUS_DETECTED",
          classification: response.emailClassification
        });
        return;
      }
      if (response.job) {
        renderJob(response.job);
        showToast("Job details detected!", "success");
        chrome.runtime.sendMessage({ type: "JOB_DETECTED", job: response.job });
      } else {
        renderJob(null);
        showToast("No job posting or recruiter email found", "error");
      }
    });
  }
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
  toggleSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });
  chrome.storage.local.get("settings", (data) => {
    const settings = data.settings || {};
    if (settings.token) tokenInput.value = settings.token;
    if (typeof settings.autoCapture === "boolean") {
      autoCaptureCheck.checked = settings.autoCapture;
    }
  });
  saveSettingsBtn.addEventListener("click", async () => {
    const settings = {
      token: tokenInput.value.trim(),
      autoCapture: autoCaptureCheck.checked,
      serverUrl: "http://127.0.0.1:41724"
    };
    await chrome.storage.local.set({ settings });
    showToast("Settings saved!", "success");
    chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
      updateConnectionStatus(Boolean(res?.success));
    });
  });
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
  var gmailCard = document.getElementById("gmailCard");
  var gmailScanBtn = document.getElementById("gmailScanBtn");
  async function checkActiveTabForGmail() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url && activeTab.url.includes("mail.google.com")) {
        gmailCard?.classList.remove("hidden");
      } else {
        gmailCard?.classList.add("hidden");
      }
    } catch {
    }
  }
  gmailScanBtn?.addEventListener("click", async () => {
    showToast("Scanning mailbox on Gmail...", "success");
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;
    chrome.tabs.sendMessage(activeTab.id, { type: "TRIGGER_GMAIL_INBOX_SCAN" }, (res) => {
      if (res?.success) {
        showToast("Inbox scanner modal opened on Gmail!", "success");
      } else {
        showToast("Please refresh your Gmail tab and try again", "error");
      }
    });
  });
  loadStatus();
  checkActiveTabForGmail();
})();
