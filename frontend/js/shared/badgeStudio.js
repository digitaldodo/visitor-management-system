import { formatDate, formatDateOnly, formatStatus } from "./formatters.js";

const BRAND_LOGO = new URL("../../assets/branding/logo-dark.png", import.meta.url).href;
const FALLBACK_PHOTO = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300">
    <rect width="240" height="300" rx="24" fill="#e5e7eb"/>
    <circle cx="120" cy="102" r="48" fill="#94a3b8"/>
    <path d="M56 252c10-42 38-66 64-66s54 24 64 66" fill="#94a3b8"/>
  </svg>
`);

export function badgeMarkup(pass, options = {}) {
  const statusLabel = pass.validityStatus || formatStatus(pass.status);
  const visitDate = formatDateOnly(pass.scheduledStartTime || pass.approvedAt || pass.issuedAt);
  const checkInTime = pass.checkInTime ? formatDate(pass.checkInTime, { timeStyle: "short" }) : "Pending";
  return `
    <article class="enterprise-badge ${options.compact ? "enterprise-badge--compact" : ""}" data-badge-card>
      <header class="enterprise-badge__header">
        <div class="enterprise-badge__brand">
          <img src="${escapeHtml(BRAND_LOGO)}" alt="AccessFlow" />
          <div>
            <strong>${escapeHtml(pass.organizationName || "AccessFlow")}</strong>
            <span>Visitor Management Badge</span>
          </div>
        </div>
        <div class="enterprise-badge__status ${pass.valid ? "is-valid" : "is-invalid"}">
          <span>Validity</span>
          <strong>${escapeHtml(statusLabel)}</strong>
        </div>
      </header>

      <div class="enterprise-badge__body">
        <div class="enterprise-badge__identity">
          <img class="enterprise-badge__photo" src="${escapeHtml(pass.photoUrl || FALLBACK_PHOTO)}" alt="${escapeHtml(pass.fullName)} photo" />
          <div>
            <p class="enterprise-badge__eyebrow">Visitor</p>
            <h3>${escapeHtml(pass.fullName)}</h3>
            <p>${escapeHtml(pass.companyName || "Unlisted organization")}</p>
            <dl class="enterprise-badge__meta">
              ${metaRow("Host", pass.hostEmployee || "Unassigned")}
              ${metaRow("Department", pass.hostEmployeeDepartment || "Not recorded")}
              ${metaRow("Purpose", pass.purposeOfVisit || "Visit")}
              ${metaRow("Date", visitDate)}
              ${metaRow("Check-in", checkInTime)}
              ${metaRow("Expires", formatDate(pass.expiresAt))}
            </dl>
          </div>
        </div>

        <div class="enterprise-badge__qr-block">
          <img class="enterprise-badge__qr" src="${escapeHtml(pass.qrImageDataUri)}" alt="Visitor QR code" />
          <dl class="enterprise-badge__codes">
            ${metaRow("Badge ID", pass.badgeId || "Not issued")}
            ${metaRow("QR Code", pass.passCode || "Pending")}
            ${metaRow("Org", pass.organizationCode || pass.organizationName || "AccessFlow")}
          </dl>
        </div>
      </div>
    </article>
  `;
}

export function badgeDialogMarkup(pass, options = {}) {
  return `
    <div class="visitor-modal__dialog visitor-modal__dialog--badge" role="dialog" aria-modal="true" aria-label="Visitor badge">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Visitor Badge</p>
          <h2>${escapeHtml(pass.fullName)}</h2>
        </div>
        <button class="icon-button" type="button" data-badge-action="close" aria-label="Close visitor badge">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
        </button>
      </div>
      ${badgeMarkup(pass)}
      <div class="enterprise-badge__actions">
        <button class="button button--ghost" type="button" data-badge-action="print">Print badge</button>
        <button class="button button--ghost" type="button" data-badge-action="png">Download PNG</button>
        <button class="button button--primary" type="button" data-badge-action="pdf">Download PDF</button>
        ${options.includeRecordPrint ? `<button class="button button--ghost" type="button" data-badge-action="record-print">Record print</button>` : ""}
      </div>
    </div>
  `;
}

export async function downloadBadge(pass, format) {
  const canvas = await createBadgeCanvas(pass);
  if (format === "pdf") {
    const pdfBlob = createPdfFromCanvas(canvas);
    triggerDownload(pdfBlob, safeFileName(pass, "pdf"));
    return;
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  triggerDownload(blob, safeFileName(pass, "png"));
}

export function printBadge(element) {
  element?.classList.add("is-print-target");
  window.print();
  window.setTimeout(() => element?.classList.remove("is-print-target"), 300);
}

async function createBadgeCanvas(pass) {
  const width = 1400;
  const height = 880;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f3f5f9";
  context.fillRect(0, 0, width, height);

  roundRect(context, 56, 56, width - 112, height - 112, 32, "#ffffff");
  roundRect(context, 56, 56, width - 112, 166, 32, "#0f172a");

  const [logo, photo, qr] = await Promise.all([
    loadImage(BRAND_LOGO),
    loadImage(pass.photoUrl || FALLBACK_PHOTO),
    loadImage(pass.qrImageDataUri),
  ]);

  context.drawImage(logo, 88, 95, 180, 48);
  context.fillStyle = "#ffffff";
  context.font = "700 34px Inter, Segoe UI, Arial, sans-serif";
  context.fillText(pass.organizationName || "AccessFlow", 292, 118);
  context.font = "500 22px Inter, Segoe UI, Arial, sans-serif";
  context.fillStyle = "#c7d2fe";
  context.fillText("Visitor Management Badge", 292, 152);

  const statusText = pass.validityStatus || formatStatus(pass.status);
  roundRect(context, width - 350, 90, 210, 70, 22, pass.valid ? "#dcfce7" : "#fee2e2");
  context.fillStyle = pass.valid ? "#166534" : "#991b1b";
  context.font = "700 24px Inter, Segoe UI, Arial, sans-serif";
  context.fillText(statusText, width - 320, 135);

  drawImageCover(context, photo, 100, 250, 280, 340, 24);
  drawImageContain(context, qr, width - 410, 280, 250, 250);

  context.fillStyle = "#0f172a";
  context.font = "700 48px Inter, Segoe UI, Arial, sans-serif";
  context.fillText(pass.fullName || "Visitor", 430, 300);
  context.font = "500 28px Inter, Segoe UI, Arial, sans-serif";
  context.fillStyle = "#475467";
  context.fillText(pass.companyName || "Unlisted organization", 430, 346);

  const visitDate = formatDateOnly(pass.scheduledStartTime || pass.approvedAt || pass.issuedAt);
  const checkInTime = pass.checkInTime ? formatDate(pass.checkInTime, { timeStyle: "short" }) : "Pending";
  const meta = [
    ["Host", pass.hostEmployee || "Unassigned"],
    ["Department", pass.hostEmployeeDepartment || "Not recorded"],
    ["Purpose", pass.purposeOfVisit || "Visit"],
    ["Date", visitDate],
    ["Check-in", checkInTime],
    ["Expires", formatDate(pass.expiresAt)],
    ["Badge ID", pass.badgeId || "Not issued"],
    ["QR Code", pass.passCode || "Pending"],
  ];

  let x = 430;
  let y = 410;
  meta.forEach(([label, value], index) => {
    drawLabelValue(context, x, y, label, value, 360);
    if (index % 2 === 1) {
      x = 430;
      y += 110;
    } else {
      x = 790;
    }
  });

  context.fillStyle = "#667085";
  context.font = "500 22px Inter, Segoe UI, Arial, sans-serif";
  context.fillText(pass.organizationCode || "AccessFlow", width - 408, 575);
  context.fillText("Scan at security checkpoint", width - 408, 605);

  return canvas;
}

function createPdfFromCanvas(canvas) {
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.98);
  const jpegBytes = base64ToBytes(jpegDataUrl.split(",")[1]);
  const pageWidth = 595;
  const pageHeight = Math.round((canvas.height / canvas.width) * pageWidth);
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let length = 0;

  const pushText = (text) => {
    const bytes = encoder.encode(text);
    parts.push(bytes);
    length += bytes.length;
  };
  const pushBytes = (bytes) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const startObject = () => {
    offsets.push(length);
  };

  pushText("%PDF-1.3\n");
  startObject();
  pushText("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  startObject();
  pushText("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  startObject();
  pushText(`3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >> endobj\n`);
  startObject();
  pushText(`4 0 obj << /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >> stream\n`);
  pushBytes(jpegBytes);
  pushText("\nendstream\nendobj\n");
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;
  startObject();
  pushText(`5 0 obj << /Length ${encoder.encode(content).length} >> stream\n${content}\nendstream\nendobj\n`);

  const xrefOffset = length;
  pushText(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => pushText(`${String(offset).padStart(10, "0")} 00000 n \n`));
  pushText(`trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

function safeFileName(pass, extension) {
  const name = String(pass.fullName || "visitor-badge").trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
  return `${name || "visitor-badge"}-${String(pass.badgeId || pass.passCode || "pass").toLowerCase()}.${extension}`;
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

async function loadImage(src) {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  return image;
}

function drawLabelValue(context, x, y, label, value, width) {
  context.fillStyle = "#667085";
  context.font = "700 20px Inter, Segoe UI, Arial, sans-serif";
  context.fillText(label.toUpperCase(), x, y);
  context.fillStyle = "#101828";
  context.font = "600 26px Inter, Segoe UI, Arial, sans-serif";
  wrapText(context, value, x, y + 38, width, 32);
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let currentY = y;
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = candidate;
    }
  });
  if (line) {
    context.fillText(line, x, currentY);
  }
}

function roundRect(context, x, y, width, height, radius, fill) {
  context.save();
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.restore();
}

function drawImageCover(context, image, x, y, width, height, radius) {
  context.save();
  roundClip(context, x, y, width, height, radius);
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

function drawImageContain(context, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function roundClip(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.clip();
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function metaRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
