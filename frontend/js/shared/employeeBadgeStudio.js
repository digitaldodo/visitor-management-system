import { formatDate } from "./formatters.js?v=20260515-scheduling";

const BRAND_LOGO = new URL("../../assets/branding/logo-dark.png", import.meta.url).href;
const BRAND_ICON = new URL("../../assets/branding/logo-icon.png", import.meta.url).href;
const FONT_STACK = "Aptos, 'Segoe UI', 'Helvetica Neue', sans-serif";
const FALLBACK_PHOTO = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">
    <rect width="480" height="600" rx="48" fill="#eef4fb"/>
    <circle cx="240" cy="205" r="92" fill="#9bb0ca"/>
    <path d="M116 488c28-82 74-126 124-126s96 44 124 126" fill="#9bb0ca"/>
  </svg>
`);

export function employeeBadgeDialogMarkup(badge) {
  return `
    <div class="visitor-modal__dialog visitor-modal__dialog--badge" role="dialog" aria-modal="true" aria-label="Employee badge">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Employee Badge</p>
          <h2>${escapeHtml(badge.fullName)}</h2>
          <p class="enterprise-badge-dialog__lead">Reusable workforce credential for access and presence operations.</p>
        </div>
        <button class="icon-button" type="button" data-employee-badge-action="close" aria-label="Close employee badge">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
        </button>
      </div>
      <div class="employee-badge-sheet">
        ${employeeBadgeMarkup(badge)}
      </div>
      <div class="enterprise-badge__actions">
        <button class="button button--ghost" type="button" data-employee-badge-action="print">Print badge</button>
        <button class="button button--ghost" type="button" data-employee-badge-action="png">Download PNG</button>
        <button class="button button--primary" type="button" data-employee-badge-action="pdf">Download PDF</button>
      </div>
    </div>
  `;
}

export function employeeBadgeMarkup(badge) {
  return `
    <article class="employee-badge" data-employee-badge-card>
      <header class="employee-badge__header">
        <div class="employee-badge__brand">
          <img src="${escapeHtml(BRAND_ICON)}" alt="AccessFlow" />
          <div>
            <p>Enterprise Workforce Access</p>
            <h3>${escapeHtml(badge.organizationName || "AccessFlow")}</h3>
            <span>${escapeHtml(badge.organizationCode || "Managed organization")}</span>
          </div>
        </div>
        <span class="status-badge status-badge--${badge.active ? "approved" : "rejected"}">${badge.active ? "Active" : "Disabled"}</span>
      </header>
      <section class="employee-badge__body">
        <img class="employee-badge__photo" src="${escapeHtml(badge.employeePhotoUrl || FALLBACK_PHOTO)}" alt="${escapeHtml(badge.fullName)} photo" />
        <div class="employee-badge__identity">
          <p>Employee</p>
          <h4>${escapeHtml(badge.fullName || "Employee")}</h4>
          <strong>${escapeHtml(badge.employeeId || "Employee ID pending")}</strong>
          <span>${escapeHtml(badge.department || "Unassigned department")} · ${escapeHtml(badge.designation || "Designation not set")}</span>
        </div>
        <div class="employee-badge__qr">
          <img src="${escapeHtml(badge.qrImageDataUri)}" alt="Static employee QR" />
          <span>Reusable access QR</span>
        </div>
      </section>
      <dl class="employee-badge__meta">
        <div><dt>Employee type</dt><dd>${escapeHtml(badge.employeeType || "Not set")}</dd></div>
        <div><dt>Shift</dt><dd>${escapeHtml(badge.shiftName || "General Shift")}</dd></div>
        <div><dt>Timing</dt><dd>${escapeHtml(formatShift(badge))}</dd></div>
        <div><dt>Issued</dt><dd>${escapeHtml(formatDate(badge.issuedAt))}</dd></div>
      </dl>
    </article>
  `;
}

export async function downloadEmployeeBadge(badge, format) {
  const canvas = await createEmployeeBadgeCanvas(badge);
  if (format === "pdf") {
    triggerDownload(createPdfFromCanvas(canvas), fileName(badge, "pdf"));
    return;
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  triggerDownload(blob, fileName(badge, "png"));
}

export async function printEmployeeBadge(badge) {
  const canvas = await createEmployeeBadgeCanvas(badge);
  const imageDataUrl = canvas.toDataURL("image/png");
  const frame = document.createElement("iframe");
  frame.className = "badge-print-frame";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;inset:0";
  frame.srcdoc = `<!doctype html><html><head><title>${escapeHtml(badge.fullName || "Employee badge")}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh}.card{width:min(100%,210mm)}img{width:100%;display:block}@page{margin:8mm;size:auto landscape}</style></head><body><main class="card"><img src="${imageDataUrl}" alt="Employee badge" /></main></body></html>`;
  frame.addEventListener("load", () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 4000);
  }, { once: true });
  document.body.append(frame);
}

async function createEmployeeBadgeCanvas(badge) {
  const width = 1680;
  const height = 1040;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eef3f8";
  ctx.fillRect(0, 0, width, height);
  roundRect(ctx, 60, 60, width - 120, height - 120, 34, "#ffffff");
  roundRect(ctx, 60, 60, 420, height - 120, 34, "#102033");
  const [logo, icon, photo, qr] = await Promise.all([
    loadImage(BRAND_LOGO),
    loadImage(BRAND_ICON),
    loadImage(badge.employeePhotoUrl || FALLBACK_PHOTO),
    loadImage(badge.qrImageDataUri),
  ]);
  ctx.drawImage(icon, 102, 106, 72, 72);
  ctx.drawImage(logo, 190, 116, 205, 54);
  ctx.fillStyle = "#cde1ff";
  ctx.font = `700 24px ${FONT_STACK}`;
  ctx.fillText("WORKFORCE ACCESS", 102, 220);
  drawImageCover(ctx, photo, 112, 300, 300, 374, 26);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 46px ${FONT_STACK}`;
  wrapText(ctx, badge.fullName || "Employee", 112, 760, 300, 52);
  ctx.fillStyle = "#b8cbe6";
  ctx.font = `700 30px ${FONT_STACK}`;
  wrapText(ctx, badge.employeeId || "Employee ID pending", 112, 870, 300, 36);
  ctx.fillStyle = "#101828";
  ctx.font = `700 42px ${FONT_STACK}`;
  ctx.fillText(badge.organizationName || "AccessFlow", 550, 145);
  ctx.fillStyle = "#52627a";
  ctx.font = `600 24px ${FONT_STACK}`;
  ctx.fillText(badge.organizationCode || "Managed workforce", 550, 186);
  const details = [
    ["Department", badge.department || "Unassigned"],
    ["Designation", badge.designation || "Not set"],
    ["Employee type", badge.employeeType || "Not set"],
    ["Shift", badge.shiftName || "General Shift"],
    ["Timing", formatShift(badge)],
  ];
  details.forEach(([label, value], index) => {
    const x = 550 + (index % 2) * 375;
    const y = 260 + Math.floor(index / 2) * 142;
    drawMeta(ctx, x, y, 330, 112, label, value);
  });
  roundRect(ctx, 1210, 250, 330, 330, 26, "#f6f9fc");
  drawImageContain(ctx, qr, 1260, 300, 230, 230);
  ctx.fillStyle = "#344054";
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.fillText("Static employee QR", 1270, 555);
  roundRect(ctx, 550, 750, 990, 128, 24, "#f6f9fc");
  ctx.fillStyle = "#607187";
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.fillText("CHECKPOINT USE", 590, 800);
  ctx.fillStyle = "#101828";
  ctx.font = `700 28px ${FONT_STACK}`;
  wrapText(ctx, "First scan checks in. Next scan checks out. Disabled accounts invalidate immediately.", 590, 846, 850, 34);
  return canvas;
}

function formatShift(badge) {
  return badge.shiftStartTime && badge.shiftEndTime ? `${badge.shiftStartTime} to ${badge.shiftEndTime}` : "Shift timing not set";
}

function fileName(badge, extension) {
  const id = String(badge.employeeId || "employee").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return `accessflow-employee-badge-${id}.${extension}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createPdfFromCanvas(canvas) {
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.99);
  const jpegBytes = base64ToBytes(jpegDataUrl.split(",")[1]);
  const pagePadding = 18;
  const pageWidth = 792;
  const imageWidth = pageWidth - (pagePadding * 2);
  const imageHeight = Math.round((canvas.height / canvas.width) * imageWidth);
  const pageHeight = imageHeight + (pagePadding * 2);
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let length = 0;
  const pushText = (text) => { const bytes = encoder.encode(text); parts.push(bytes); length += bytes.length; };
  const pushBytes = (bytes) => { parts.push(bytes); length += bytes.length; };
  const startObject = () => offsets.push(length);
  pushText("%PDF-1.3\n");
  startObject(); pushText("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  startObject(); pushText("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  startObject(); pushText(`3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >> endobj\n`);
  startObject(); pushText(`4 0 obj << /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >> stream\n`); pushBytes(jpegBytes); pushText("\nendstream\nendobj\n");
  const content = `q\n${imageWidth} 0 0 ${imageHeight} ${pagePadding} ${pagePadding} cm\n/Im0 Do\nQ`;
  startObject(); pushText(`5 0 obj << /Length ${encoder.encode(content).length} >> stream\n${content}\nendstream\nendobj\n`);
  const xrefOffset = length;
  pushText(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => pushText(`${String(offset).padStart(10, "0")} 00000 n \n`));
  pushText(`trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function loadImage(src) {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.src = src;
  if (typeof image.decode === "function") {
    await image.decode().catch(() => waitForImageLoad(image));
    return image;
  }
  await waitForImageLoad(image);
  return image;
}

function waitForImageLoad(image) {
  return new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
}

function drawMeta(ctx, x, y, width, height, label, value) {
  roundRect(ctx, x, y, width, height, 20, "#f6f9fc");
  ctx.fillStyle = "#607187";
  ctx.font = `700 19px ${FONT_STACK}`;
  ctx.fillText(String(label || "").toUpperCase(), x + 24, y + 38);
  ctx.fillStyle = "#101828";
  ctx.font = `700 26px ${FONT_STACK}`;
  wrapText(ctx, value, x + 24, y + 76, width - 48, 30);
}

function roundRect(ctx, x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawImageCover(ctx, image, x, y, width, height, radius) {
  ctx.save();
  roundClip(ctx, x, y, width, height, radius);
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawImageContain(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function roundClip(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.clip();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let currentY = y;
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = candidate;
    }
  });
  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
