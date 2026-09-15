/**
 * Gmail In-Page Detector & Recruiter Email Assistant
 * Passively observes Gmail DOM when reading emails, accurately extracts
 * email metadata, runs classification, and provides interactive 1-click status sync.
 */

import { classifyRecruiterEmail, type EmailClassification } from "./emailClassifier";

let lastScannedEmailId = "";
let currentBanner: HTMLElement | null = null;

export function isGmailPage(): boolean {
  return (
    window.location.hostname === "mail.google.com" ||
    window.location.hostname.endsWith(".mail.google.com")
  );
}

export function extractGmailEmailData(): {
  subject: string;
  senderName: string;
  senderEmail: string;
  body: string;
  emailId: string;
} | null {
  // If not on Gmail, exit early
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
    // Gmail sets document.title to "Subject - email@gmail.com - Gmail" or "Subject - Gmail"
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
    // Take the latest sender in the conversation thread
    const latestSenderEl = senderEls[senderEls.length - 1];
    senderName =
      latestSenderEl.getAttribute("name") ||
      latestSenderEl.innerText?.trim() ||
      "";
    senderEmail =
      latestSenderEl.getAttribute("email") ||
      latestSenderEl.getAttribute("data-hovercard-id") ||
      "";

    // If sender email is inside text e.g. <recruiter@company.com>
    if (!senderEmail && latestSenderEl.innerText) {
      const emailMatch = latestSenderEl.innerText.match(/<([^>]+@[^>]+)>/);
      if (emailMatch) senderEmail = emailMatch[1];
    }
  }

  // 3. Locate active email body (search all message containers)
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
      // Use the latest message body, or combine thread if latest is short
      const latestBody = visibleBodies[visibleBodies.length - 1].innerText.trim();
      if (latestBody.length > 60 || visibleBodies.length === 1) {
        body = latestBody;
      } else {
        body = visibleBodies.map((b) => b.innerText.trim()).join("\n\n---\n\n");
      }
    }
  }

  // Fallback to role="main" container if specific body classes differ
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

export function scanGmailAndSync(
  onStatusDetected: (classification: EmailClassification) => void,
) {
  if (!isGmailPage()) return;
  // Only render banner in top-level frame to prevent iframe clipping
  if (window.top !== window.self) return;

  const data = extractGmailEmailData();
  if (!data) {
    removeBanner();
    return;
  }

  if (data.emailId === lastScannedEmailId) {
    return;
  }

  lastScannedEmailId = data.emailId;
  console.log("[JobTracker] Scanning Gmail email view:", {
    subject: data.subject,
    sender: data.senderName || data.senderEmail,
    bodyLength: data.body.length,
  });

  const classification = classifyRecruiterEmail(
    data.subject,
    data.senderName,
    data.senderEmail,
    data.body,
  );

  if (classification) {
    console.log("[JobTracker] Recruiter email classified:", classification);
    renderGmailBanner(classification, (confirmed) => {
      onStatusDetected(confirmed);
    });
  } else {
    console.log("[JobTracker] Email did not match recruiter criteria. Banner dismissed.");
    removeBanner();
  }
}

export function removeBanner() {
  if (currentBanner && currentBanner.parentNode) {
    currentBanner.parentNode.removeChild(currentBanner);
    currentBanner = null;
  }
}

function getStageBadgeStyle(stage: string): { bg: string; color: string; label: string; icon: string } {
  switch (stage) {
    case "offer":
      return { bg: "rgba(16, 185, 129, 0.2)", color: "#34d399", label: "Offer Received", icon: "🎉" };
    case "interview":
      return { bg: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", label: "Interview Stage", icon: "📅" };
    case "screening":
      return { bg: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", label: "Assessment / Screening", icon: "💻" };
    case "rejected":
      return { bg: "rgba(239, 68, 68, 0.2)", color: "#f87171", label: "Not Moving Forward", icon: "🛑" };
    case "applied":
      return { bg: "rgba(99, 102, 241, 0.2)", color: "#818cf8", label: "Application Received", icon: "📬" };
    default:
      return { bg: "rgba(107, 114, 128, 0.2)", color: "#9ca3af", label: "Status Update", icon: "ℹ️" };
  }
}

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

