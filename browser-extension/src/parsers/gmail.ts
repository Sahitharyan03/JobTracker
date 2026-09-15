/**
 * Gmail In-Page Detector & Recruiter Email Assistant
 * Passively observes Gmail DOM when reading emails, accurately extracts
 * email metadata, runs classification, and provides interactive 1-click status sync.
 */

import { classifyRecruiterEmail, type EmailClassification } from "./emailClassifier";

let lastScannedEmailId = "";
let currentBanner: HTMLElement | null = null;

export function isGmailPage(): boolean {
  return window.location.hostname.includes("mail.google.com");
}

export function extractGmailEmailData(): {
  subject: string;
  senderName: string;
  senderEmail: string;
  body: string;
  emailId: string;
} | null {
  // 1. Locate email subject
  const subjectEl =
    document.querySelector<HTMLElement>("h2.hP") ||
    document.querySelector<HTMLElement>("div[role='main'] h2") ||
    document.querySelector<HTMLElement>("div.ha h2");

  const subject = subjectEl?.innerText?.trim() || "";

  // 2. Locate active email sender
  const senderEl =
    document.querySelector<HTMLElement>("span.gD") ||
    document.querySelector<HTMLElement>("span[email]");

  const senderName = senderEl?.getAttribute("name") || senderEl?.innerText?.trim() || "";
  const senderEmail = senderEl?.getAttribute("email") || "";

  // 3. Locate active email body (last message in thread is usually the latest reply)
  const bodyEls = Array.from(
    document.querySelectorAll<HTMLElement>("div.a3s.aiL, div.a3s, div[dir='ltr']"),
  );

  const activeBodyEl = bodyEls[bodyEls.length - 1];
  const body = activeBodyEl?.innerText?.trim() || "";

  if (!subject && !body) {
    return null;
  }

  // Create a fingerprint for this specific email view
  const emailId = `${subject}__${senderEmail}__${body.slice(0, 100)}`;
  return { subject, senderName, senderEmail, body, emailId };
}

export function scanGmailAndSync(
  onStatusDetected: (classification: EmailClassification) => void,
) {
  if (!isGmailPage()) return;

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

function removeBanner() {
  if (currentBanner && currentBanner.parentNode) {
    currentBanner.parentNode.removeChild(currentBanner);
    currentBanner = null;
  }
}

function getStageBadgeStyle(stage: string): { bg: string; color: string; label: string; icon: string } {
  switch (stage) {
    case "offer":
      return { bg: "rgba(16, 185, 129, 0.15)", color: "#10b981", label: "Offer Received", icon: "verified" };
    case "interview":
      return { bg: "rgba(217, 119, 6, 0.15)", color: "#f59e0b", label: "Interview Stage", icon: "event" };
    case "screening":
      return { bg: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", label: "Assessment / Screening", icon: "code" };
    case "rejected":
      return { bg: "rgba(239, 68, 68, 0.15)", color: "#ef4444", label: "Not Moving Forward", icon: "cancel" };
    case "applied":
      return { bg: "rgba(99, 102, 241, 0.15)", color: "#6366f1", label: "Application Acknowledged", icon: "mark_email_read" };
    default:
      return { bg: "rgba(107, 114, 128, 0.15)", color: "#9ca3af", label: "Update Detected", icon: "info" };
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
    z-index: 999999;
    max-width: 380px;
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.45);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    animation: jtSlideDown 250ms ease-out;
  `;

  banner.innerHTML = `
    <style>
      @keyframes jtSlideDown {
        from { opacity: 0; transform: translateY(-12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .jt-btn-primary {
        background: #4f46e5;
        color: #ffffff;
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: background 150ms;
      }
      .jt-btn-primary:hover {
        background: #4338ca;
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
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px;">🎯</span>
        <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #a1a1aa;">JobTracker Sync</span>
      </div>
      <button class="jt-btn-close" id="jt-dismiss-btn" title="Dismiss">✕</button>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
      <div style="font-size: 14px; font-weight: 800; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${classification.company}
      </div>
      <div style="background: ${badge.bg}; color: ${badge.color}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; white-space: nowrap;">
        ${badge.label}
      </div>
    </div>

    ${classification.snippet ? `
      <div style="font-size: 11px; color: #d4d4d8; line-height: 1.4; background: #27272a; border-radius: 6px; padding: 8px; margin-bottom: 10px; border-left: 3px solid ${badge.color}; font-style: italic;">
        "${classification.snippet}"
      </div>
    ` : ""}

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px;">
      <span style="font-size: 10px; color: #71717a; font-weight: 600;">
        Match confidence: ${(classification.confidence * 100).toFixed(0)}%
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
    applyBtn.innerText = "✓ Updated!";
    applyBtn.style.background = "#10b981";
    setTimeout(() => removeBanner(), 1200);
    onConfirm(classification);
  });

  dismissBtn?.addEventListener("click", () => {
    removeBanner();
  });
}
