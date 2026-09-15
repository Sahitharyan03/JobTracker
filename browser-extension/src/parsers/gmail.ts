/**
 * Gmail In-Page Detector & Full Recruiter Email Inbox Scanner
 * Passively observes Gmail DOM, accurately extracts thread and email list data,
 * matches against tracked JobTracker applications, and executes instant batch / single sync.
 */

import { classifyRecruiterEmail, type EmailClassification, type EmailStage } from "./emailClassifier";

export interface TrackedApplication {
  id: number;
  company: string;
  role: string;
  status: string;
  work_type?: string;
  location?: string;
  created_at?: string;
}

export interface MatchedEmailUpdate {
  applicationId?: number;
  company: string;
  role?: string;
  previousStatus?: string;
  newStatus: EmailStage;
  confidence: number;
  subject: string;
  sender: string;
  snippet: string;
  dateStr?: string;
}

let lastScannedEmailId = "";
let currentBanner: HTMLElement | null = null;
let currentModal: HTMLElement | null = null;
let floatingControl: HTMLElement | null = null;

export function isGmailPage(): boolean {
  return (
    window.location.hostname === "mail.google.com" ||
    window.location.hostname.endsWith(".mail.google.com")
  );
}

/**
 * Extract data from an open email thread
 */
export function extractGmailEmailData(): {
  subject: string;
  senderName: string;
  senderEmail: string;
  body: string;
  emailId: string;
} | null {
  if (!isGmailPage()) return null;

  // 1. Locate email subject
  let subject = "";
  const subjectEl =
    document.querySelector<HTMLElement>("h2.hP") ||
    document.querySelector<HTMLElement>("div[role='main'] h2") ||
    document.querySelector<HTMLElement>("div.ha h2") ||
    document.querySelector<HTMLElement>("span.bog") ||
    document.querySelector<HTMLElement>("[data-legacy-thread-id] h2") ||
    document.querySelector<HTMLElement>("div.y6 span");

  if (subjectEl?.innerText?.trim()) {
    subject = subjectEl.innerText.trim();
  } else if (
    document.title &&
    !document.title.startsWith("Inbox") &&
    !document.title.startsWith("Gmail")
  ) {
    subject = document.title
      .replace(/\s*-\s*[^@\s]+@[^\s]+\s*-\s*Gmail$/i, "")
      .replace(/\s*-\s*Gmail$/i, "")
      .trim();
  }

  // 2. Locate active email sender
  let senderName = "";
  let senderEmail = "";
  const senderEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      "span.gD, span[email], span[data-hovercard-id], span.g2, div.adn span.gD, span.go",
    ),
  );

  if (senderEls.length > 0) {
    const latestSenderEl = senderEls[senderEls.length - 1];
    senderName =
      latestSenderEl.getAttribute("name") ||
      latestSenderEl.innerText?.trim() ||
      "";
    senderEmail =
      latestSenderEl.getAttribute("email") ||
      latestSenderEl.getAttribute("data-hovercard-id") ||
      "";

    if (!senderEmail && latestSenderEl.innerText) {
      const emailMatch = latestSenderEl.innerText.match(/<([^>]+@[^>]+)>/);
      if (emailMatch) senderEmail = emailMatch[1];
    }
  }

  // 3. Locate active email body
  const bodyEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      "div.a3s.aiL, div.a3s, div.ii.gt, div.adn div[dir='ltr'], div[role='listitem'] div[dir='ltr']",
    ),
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
    const mainEl = document.querySelector<HTMLElement>("div[role='main']");
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

/**
 * Scan all visible email rows in Gmail inbox or search lists
 */
export function scanVisibleInboxRows(): MatchedEmailUpdate[] {
  if (!isGmailPage()) return [];

  const rows = Array.from(document.querySelectorAll<HTMLElement>("tr.zA"));
  const detectedList: MatchedEmailUpdate[] = [];

  for (const row of rows) {
    const senderEl = row.querySelector<HTMLElement>(
      "span.bA4 span.zF, span.yP, span.zF, span[email], span[name], div.yW span",
    );
    const subjectEl = row.querySelector<HTMLElement>("span.bog span, span.bog, div.y6 span");
    const snippetEl = row.querySelector<HTMLElement>("span.y2");
    const dateEl = row.querySelector<HTMLElement>("td.xW span, td.xW");

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
      snippet,
    );

    if (classification && classification.confidence >= 0.7) {
      detectedList.push({
        company: classification.company,
        newStatus: classification.stage,
        confidence: classification.confidence,
        subject: classification.subject,
        sender: classification.sender,
        snippet: classification.snippet,
        dateStr,
      });
    }
  }

  return detectedList;
}

/**
 * Match detected email updates against active tracked JobTracker applications
 */
export function matchWithTrackedApplications(
  scannedUpdates: MatchedEmailUpdate[],
  trackedApps: TrackedApplication[],
): MatchedEmailUpdate[] {
  const matched: MatchedEmailUpdate[] = [];

  for (const update of scannedUpdates) {
    const compLower = update.company.toLowerCase().trim();
    if (!compLower) continue;

    // Find best match in tracked applications
    const match = trackedApps.find((app) => {
      const appComp = app.company.toLowerCase().trim();
      return (
        appComp === compLower ||
        appComp.includes(compLower) ||
        compLower.includes(appComp)
      );
    });

    if (match) {
      matched.push({
        ...update,
        applicationId: match.id,
        role: match.role,
        previousStatus: match.status,
      });
    } else {
      // Also include high-confidence recruiter emails even if not pre-registered
      matched.push(update);
    }
  }

  // Deduplicate by company + newStatus
  const unique = new Map<string, MatchedEmailUpdate>();
  for (const m of matched) {
    const key = `${m.company.toLowerCase()}__${m.newStatus}`;
    if (!unique.has(key) || (m.confidence > (unique.get(key)?.confidence || 0))) {
      unique.set(key, m);
    }
  }

  return Array.from(unique.values());
}

/**
 * Perform single email thread scan & sync banner
 */
export function scanGmailAndSync(
  onStatusDetected: (classification: EmailClassification) => void,
) {
  if (!isGmailPage()) return;
  if (window.top !== window.self) return;

  // Mount or update floating control badge on Gmail
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
    data.body,
  );

  if (classification) {
    renderGmailBanner(classification, (confirmed) => {
      onStatusDetected(confirmed);
    });
  } else {
    removeBanner();
  }
}

export function removeBanner() {
  if (currentBanner && currentBanner.parentNode) {
    currentBanner.parentNode.removeChild(currentBanner);
    currentBanner = null;
  }
}

export function removeModal() {
  if (currentModal && currentModal.parentNode) {
    currentModal.parentNode.removeChild(currentModal);
    currentModal = null;
  }
}

function getStageBadgeStyle(stage: string): { bg: string; color: string; label: string; icon: string } {
  switch (stage) {
    case "offer":
      return { bg: "rgba(16, 185, 129, 0.2)", color: "#34d399", label: "Offer Received", icon: "🎉" };
    case "interview":
      return { bg: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", label: "Interview Scheduled", icon: "📅" };
    case "screening":
      return { bg: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", label: "Assessment / OA", icon: "💻" };
    case "rejected":
      return { bg: "rgba(239, 68, 68, 0.2)", color: "#f87171", label: "Not Moving Forward", icon: "🛑" };
    case "applied":
      return { bg: "rgba(99, 102, 241, 0.2)", color: "#818cf8", label: "Applied", icon: "📬" };
    default:
      return { bg: "rgba(107, 114, 128, 0.2)", color: "#9ca3af", label: "Status Update", icon: "ℹ️" };
  }
}

/**
 * Render single thread action banner
 */
function renderGmailBanner(
  classification: EmailClassification,
  onConfirm: (c: EmailClassification) => void,
) {
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
      <button class="jt-btn-close" id="jt-dismiss-btn" title="Dismiss">✕</button>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
      <div style="font-size: 15px; font-weight: 800; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${classification.company}
      </div>
      <div style="background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.color}40; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 9999px; white-space: nowrap;">
        ${badge.label}
      </div>
    </div>

    ${
      classification.snippet
        ? `
      <div style="font-size: 11px; color: #d4d4d8; line-height: 1.45; background: #27272a; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; border-left: 3px solid ${badge.color}; font-style: italic;">
        "${classification.snippet}"
      </div>
    `
        : ""
    }

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px;">
      <span style="font-size: 11px; color: #71717a; font-weight: 600;">
        Match: ${(classification.confidence * 100).toFixed(0)}%
      </span>
      <button class="jt-btn-primary" id="jt-apply-btn">
        Move to ${classification.stage.charAt(0).toUpperCase() + classification.stage.slice(1)} →
      </button>
    </div>
  `;

  document.body.appendChild(banner);
  currentBanner = banner;

  const applyBtn = banner.querySelector<HTMLButtonElement>("#jt-apply-btn");
  const dismissBtn = banner.querySelector<HTMLButtonElement>("#jt-dismiss-btn");

  applyBtn?.addEventListener("click", () => {
    applyBtn.innerText = "✓ Syncing...";
    applyBtn.style.background = "#10b981";
    setTimeout(() => removeBanner(), 1200);
    onConfirm(classification);
  });

  dismissBtn?.addEventListener("click", () => {
    removeBanner();
  });
}

/**
 * Mount floating persistent control pill on Gmail top bar
 */
export function ensureFloatingControlMounted() {
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
    <span style="font-size: 15px;">⚡</span>
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

/**
 * Trigger full inbox scan and open match review modal
 */
export async function triggerFullInboxScanAndModal() {
  const badge = floatingControl?.querySelector<HTMLElement>("#jt-scan-badge");
  if (badge) badge.innerText = "Scanning...";

  // 1. Scan visible inbox rows + current open thread
  const visibleUpdates = scanVisibleInboxRows();
  const openThreadData = extractGmailEmailData();
  if (openThreadData) {
    const threadClass = classifyRecruiterEmail(
      openThreadData.subject,
      openThreadData.senderName,
      openThreadData.senderEmail,
      openThreadData.body,
    );
    if (threadClass) {
      visibleUpdates.unshift({
        company: threadClass.company,
        newStatus: threadClass.stage,
        confidence: threadClass.confidence,
        subject: threadClass.subject,
        sender: threadClass.sender,
        snippet: threadClass.snippet,
        dateStr: "Active Thread",
      });
    }
  }

  // 2. Fetch tracked applications from desktop app
  chrome.runtime.sendMessage({ type: "GET_TRACKED_APPLICATIONS" }, (response) => {
    const trackedApps: TrackedApplication[] = response?.applications || [];
    const matchedUpdates = matchWithTrackedApplications(visibleUpdates, trackedApps);

    if (badge) badge.innerText = `${matchedUpdates.length} Found`;
    renderScanModal(matchedUpdates);
  });
}

/**
 * Render match review and batch sync modal on Gmail
 */
function renderScanModal(matchedUpdates: MatchedEmailUpdate[]) {
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
          <span style="font-size: 20px;">⚡</span>
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #ffffff;">Recruiter Emails & Status Sync</h3>
            <p style="margin: 0; font-size: 12px; color: #a1a1aa;">Scanned from your Gmail inbox & matched against JobTracker</p>
          </div>
        </div>
        <button id="jt-modal-close" style="background: transparent; border: none; color: #a1a1aa; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <div style="padding: 12px 20px; overflow-y: auto; flex: 1;">
        ${
          matchedUpdates.length === 0
            ? `
          <div style="text-align: center; padding: 40px 20px; color: #a1a1aa;">
            <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
            <div style="font-size: 15px; font-weight: 700; color: #ffffff;">No recruiter status updates found</div>
            <div style="font-size: 12px; margin-top: 4px;">Open your Job Search folder/inbox or click into a recruiter email to scan.</div>
          </div>
        `
            : matchedUpdates
                .map((item, idx) => {
                  const badge = getStageBadgeStyle(item.newStatus);
                  return `
            <div class="jt-item-row">
              <input type="checkbox" checked id="jt-check-${idx}" style="margin-top: 4px; accent-color: #4f46e5; width: 16px; height: 16px; cursor: pointer;" />
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                  <span style="font-size: 14px; font-weight: 800; color: #ffffff;">${item.company}</span>
                  <span style="background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.color}40; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">
                    ${item.previousStatus ? `${item.previousStatus} ➔ ` : ""}${badge.label}
                  </span>
                </div>
                <div style="font-size: 12px; color: #93c5fd; font-weight: 600; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${item.subject || "Recruiter update"}
                </div>
                ${
                  item.snippet
                    ? `
                  <div style="font-size: 11px; color: #d4d4d8; line-height: 1.4; background: #27272a; padding: 6px 8px; border-radius: 4px; border-left: 3px solid ${badge.color}; font-style: italic;">
                    "${item.snippet}"
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          `;
                })
                .join("")
        }
      </div>

      <div style="padding: 14px 20px; border-top: 1px solid #27272a; display: flex; align-items: center; justify-content: space-between; background: #121214;">
        <span style="font-size: 12px; color: #a1a1aa;">
          ${matchedUpdates.length} update(s) ready to sync
        </span>
        <div style="display: flex; gap: 8px;">
          <button id="jt-modal-cancel" style="background: #27272a; color: #d4d4d8; border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;">
            Close
          </button>
          ${
            matchedUpdates.length > 0
              ? `
            <button id="jt-modal-sync-all" class="jt-modal-btn-primary">
              Sync All to Kanban (${matchedUpdates.length}) →
            </button>
          `
              : ""
          }
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  currentModal = modal;

  modal.querySelector("#jt-modal-close")?.addEventListener("click", removeModal);
  modal.querySelector("#jt-modal-cancel")?.addEventListener("click", removeModal);

  const syncAllBtn = modal.querySelector<HTMLButtonElement>("#jt-modal-sync-all");
  syncAllBtn?.addEventListener("click", () => {
    syncAllBtn.innerText = "Syncing...";
    syncAllBtn.setAttribute("disabled", "true");

    const selectedUpdates = matchedUpdates.filter((_, idx) => {
      const checkbox = modal.querySelector<HTMLInputElement>(`#jt-check-${idx}`);
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
      matched_at: new Date().toISOString(),
    }));

    chrome.runtime.sendMessage({ type: "BATCH_STATUS_UPDATE", updates: payload }, (res) => {
      if (res?.success) {
        syncAllBtn.innerText = `✓ Updated ${res.updated_count || payload.length} Application(s)!`;
        syncAllBtn.style.background = "#10b981";
        setTimeout(() => removeModal(), 1500);
      } else {
        syncAllBtn.innerText = "Sync Failed";
        syncAllBtn.style.background = "#ef4444";
      }
    });
  });
}


