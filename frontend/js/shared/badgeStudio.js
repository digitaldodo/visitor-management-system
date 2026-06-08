import { formatDate, formatDateOnly, formatStatus, timezoneLabel } from "./formatters.js";

const BRAND_LOGO = new URL("../../assets/branding/logo-dark.png", import.meta.url).href;
const BRAND_ICON = new URL("../../assets/branding/logo-icon.png", import.meta.url).href;
const FONT_STACK = "Aptos, 'Segoe UI', 'Helvetica Neue', sans-serif";
const FALLBACK_PHOTO = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">
    <defs>
      <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="#dce7f7"/>
        <stop offset="100%" stop-color="#eef2f8"/>
      </linearGradient>
    </defs>
    <rect width="480" height="600" rx="48" fill="url(#bg)"/>
    <circle cx="240" cy="200" r="92" fill="#9fb5d1"/>
    <path d="M120 474c24-78 72-122 120-122s96 44 120 122" fill="#9fb5d1"/>
  </svg>
`);
const badgeAssetCache = new Map();

export function badgeMarkup(pass, options = {}) {
  const visitDate = formatDateOnly(pass.scheduledStartTime || pass.approvedAt || pass.issuedAt);
  const accessWindow = accessWindowLabel(pass);
  const expiry = formatDate(pass.expiresAt);
  const issuedAt = formatDate(pass.issuedAt);
  const tone = badgeTone(pass);
  const statusLabel = pass.validityStatus || pass.statusLabel || formatStatus(pass.status);
  const checkInState = pass.checkInState || deriveCheckInState(pass);
  const hostDepartment = pass.hostEmployeeDepartment || "Workplace team";
  const purpose = pass.purposeOfVisit || "General visit";
  const typeLabel = visitorTypeLabel(pass.visitorType);

  return `
    <article class="enterprise-badge enterprise-badge--${tone} ${isRecurring(pass) ? "enterprise-badge--recurring" : ""}" data-badge-card>
      <div class="enterprise-badge__hero">
        <div class="enterprise-badge__brandlockup">
          <img class="enterprise-badge__brand-icon" src="${escapeHtml(BRAND_ICON)}" alt="AccessFlow" />
          <div>
            <p class="enterprise-badge__eyebrow">Enterprise Visitor Access</p>
            <h3>${escapeHtml(pass.organizationName || "AccessFlow")}</h3>
            <p class="enterprise-badge__subtle">${escapeHtml(pass.organizationCode || "Managed workplace access")}</p>
          </div>
        </div>
        <div class="enterprise-badge__status-stack">
          <span class="enterprise-badge__chip enterprise-badge__chip--neutral">${escapeHtml(typeLabel)}</span>
          <span class="enterprise-badge__chip enterprise-badge__chip--${tone}">${escapeHtml(statusLabel)}</span>
          <span class="enterprise-badge__subtle">${escapeHtml(checkInState)}</span>
        </div>
      </div>

      <div class="enterprise-badge__layout">
        <section class="enterprise-badge__identity-panel">
          <img class="enterprise-badge__photo" src="${escapeHtml(pass.photoUrl || FALLBACK_PHOTO)}" alt="${escapeHtml(pass.fullName)} photo" />
          <div class="enterprise-badge__identity-copy">
            <p class="enterprise-badge__eyebrow">Visitor</p>
            <h4>${escapeHtml(pass.fullName || "Visitor")}</h4>
            <p class="enterprise-badge__company">${escapeHtml(pass.companyName || "Independent visitor")}</p>
            <div class="enterprise-badge__callout">
              <strong>${escapeHtml(checkInState)}</strong>
              <span>${escapeHtml(pass.valid ? "Access approved for entry verification." : "Checkpoint review required before entry.")}</span>
            </div>
          </div>
        </section>

        <section class="enterprise-badge__details">
          <div class="enterprise-badge__detail-grid">
            ${detailTile("Host employee", pass.hostEmployee || "Front desk assigned")}
            ${detailTile("Host team", hostDepartment)}
            ${detailTile("Visitor type", typeLabel)}
            ${detailTile("Vendor", pass.vendorCompanyName || pass.companyName || "Not recorded")}
            ${detailTile("Visit date", visitDate)}
            ${detailTile("Access window", accessWindow)}
            ${detailTile("Badge ID", pass.badgeId || "Pending issuance")}
            ${detailTile("Pass code", pass.passCode || "Pending issuance")}
            ${detailTile("Expires", expiry)}
          </div>
          <div class="enterprise-badge__purpose">
            <span>Visit purpose</span>
            <strong>${escapeHtml(purpose)}</strong>
          </div>
        </section>

        <aside class="enterprise-badge__qr-panel">
          <img class="enterprise-badge__brand-wordmark" src="${escapeHtml(BRAND_LOGO)}" alt="AccessFlow" />
          <div class="enterprise-badge__qr-frame">
            <img class="enterprise-badge__qr" src="${escapeHtml(pass.qrImageDataUri)}" alt="Visitor QR code" />
          </div>
          <div class="enterprise-badge__scan-copy">
            <strong>Security checkpoint</strong>
            <span>Scan to validate this badge against the live AccessFlow approval record.</span>
          </div>
        </aside>
      </div>

      <footer class="enterprise-badge__footer">
        <span>Badge reference ${escapeHtml(pass.badgeId || pass.passCode || "AccessFlow")}</span>
        <span>${escapeHtml(options.footerNote || "Present photo ID if requested by security.")}</span>
      </footer>
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
          <p class="enterprise-badge-dialog__lead">Operational badge view for entry, print, and export.</p>
        </div>
        <button class="icon-button" type="button" data-badge-action="close" aria-label="Close visitor badge">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
        </button>
      </div>
      <div class="enterprise-badge-sheet">
        <div class="enterprise-badge-sheet__viewport">
          <div class="enterprise-badge-preview" data-badge-preview-root>
            <div class="enterprise-badge-preview__frame">
              <div class="enterprise-badge-preview__loading" data-badge-preview-loading>
                <strong>Rendering badge preview</strong>
                <span>Preparing the print-safe layout and QR surface.</span>
              </div>
              <img class="enterprise-badge-preview__image is-hidden" data-badge-preview-image alt="${escapeHtml(pass.fullName)} badge preview" />
            </div>
            <div class="enterprise-badge-preview__meta">
              <span>Badge reference ${escapeHtml(pass.badgeId || pass.passCode || "AccessFlow")}</span>
              <span>Preview matches print, PDF, and PNG export output.</span>
              ${pass.verificationUrl ? `<code>${escapeHtml(pass.verificationUrl)}</code>` : ""}
            </div>
          </div>
        </div>
      </div>
      <div class="enterprise-badge__actions">
        <button class="button button--ghost" type="button" data-badge-action="print">Print badge</button>
        <button class="button button--ghost" type="button" data-badge-action="png">Download PNG</button>
        <button class="button button--primary" type="button" data-badge-action="pdf">Download PDF</button>
        ${options.includeRecordPrint ? `<button class="button button--ghost" type="button" data-badge-action="record-print">Record print</button>` : ""}
      </div>
    </div>
  `;
}

export async function hydrateBadgePreview(root, pass) {
  const previewRoot = root?.querySelector("[data-badge-preview-root]");
  const image = root?.querySelector("[data-badge-preview-image]");
  const loading = root?.querySelector("[data-badge-preview-loading]");
  if (!previewRoot || !image || !loading || !pass) {
    return;
  }

  previewRoot.dataset.state = "loading";
  try {
    const asset = await getBadgeAsset(pass);
    image.src = asset.imageDataUrl;
    image.width = asset.canvas.width;
    image.height = asset.canvas.height;
    image.classList.remove("is-hidden");
    previewRoot.dataset.state = "ready";
    loading.remove();
  } catch (error) {
    previewRoot.dataset.state = "error";
    loading.innerHTML = `
      <strong>Preview unavailable</strong>
      <span>${escapeHtml(error?.message || "Badge preview could not be rendered.")}</span>
    `;
  }
}

export async function downloadBadge(pass, format) {
  const { canvas } = await getBadgeAsset(pass);
  if (format === "pdf") {
    const pdfBlob = createPdfFromCanvas(canvas);
    triggerDownload(pdfBlob, safeFileName(pass, "pdf"));
    return;
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  triggerDownload(blob, safeFileName(pass, "png"));
}

export async function printBadge(pass) {
  if (!pass) {
    return;
  }

  const { imageDataUrl } = await getBadgeAsset(pass);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.className = "badge-print-frame";
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.inset = "0";

  const cleanup = () => {
    window.setTimeout(() => {
      frame.remove();
    }, 200);
  };

  frame.addEventListener("load", () => {
    const printWindow = frame.contentWindow;
    const printDocument = printWindow?.document;
    const image = printDocument?.querySelector("[data-print-badge-image]");
    if (!printWindow || !printDocument || !image) {
      cleanup();
      return;
    }

    const triggerPrint = () => {
      let finished = false;
      const finalize = () => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
      };
      printWindow.addEventListener("afterprint", finalize, { once: true });
      window.setTimeout(finalize, 4000);
      printWindow.focus();
      printWindow.print();
    };

    if (image.complete) {
      triggerPrint();
      return;
    }
    image.addEventListener("load", triggerPrint, { once: true });
    image.addEventListener("error", cleanup, { once: true });
  }, { once: true });

  frame.srcdoc = renderPrintDocument(pass, imageDataUrl);
  document.body.append(frame);
}

async function getBadgeAsset(pass) {
  const cacheKey = badgeAssetKey(pass);
  if (!badgeAssetCache.has(cacheKey)) {
    badgeAssetCache.set(cacheKey, (async () => {
      const canvas = await createBadgeCanvas(pass);
      return {
        canvas,
        imageDataUrl: canvas.toDataURL("image/png"),
      };
    })());
  }
  return badgeAssetCache.get(cacheKey);
}

function badgeAssetKey(pass) {
  return [
    pass.visitorId || "",
    pass.badgeId || "",
    pass.passCode || "",
    pass.issuedAt || "",
    pass.expiresAt || "",
    pass.verificationUrl || pass.qrPayload || "",
  ].join("::");
}

async function createBadgeCanvas(pass) {
  const width = 2480;
  const height = 1564;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#eef3f8";
  context.fillRect(0, 0, width, height);

  shadowPanel(context, 80, 80, width - 160, height - 160, 44);
  roundRect(context, 80, 80, width - 160, height - 160, 44, "#ffffff");
  roundRect(context, 80, 80, 560, height - 160, 44, "#0f1f33");
  roundRect(context, 620, 80, width - 700, 188, 44, "#f5f8fc");

  const [logo, icon, photo, qr] = await Promise.all([
    loadImage(BRAND_LOGO),
    loadImage(BRAND_ICON),
    loadImage(pass.photoUrl || FALLBACK_PHOTO),
    loadImage(pass.qrImageDataUri),
  ]);

  context.drawImage(icon, 130, 130, 78, 78);
  context.drawImage(logo, 226, 140, 220, 58);
  context.fillStyle = "#d9e7ff";
  context.font = `700 28px ${FONT_STACK}`;
  context.fillText("ENTERPRISE VISITOR ACCESS", 130, 240);

  drawImageCover(context, photo, 130, 310, 360, 450, 36);
  context.fillStyle = "#ffffff";
  context.font = `700 58px ${FONT_STACK}`;
  wrapText(context, pass.fullName || "Visitor", 130, 850, 360, 62);
  context.fillStyle = "#bed1ea";
  context.font = `600 32px ${FONT_STACK}`;
  wrapText(context, pass.companyName || "Independent visitor", 130, 972, 360, 38);

  roundRect(context, 130, 1090, 360, 168, 28, "rgba(255,255,255,0.08)");
  context.fillStyle = "#e2ebf7";
  context.font = `700 24px ${FONT_STACK}`;
  context.fillText("CHECKPOINT STATE", 160, 1140);
  context.fillStyle = "#ffffff";
  context.font = `700 36px ${FONT_STACK}`;
  wrapText(context, deriveCheckInState(pass), 160, 1190, 300, 40);

  context.fillStyle = "#0f1728";
  context.font = `700 40px ${FONT_STACK}`;
  context.fillText(pass.organizationName || "AccessFlow", 690, 165);
  context.fillStyle = "#52627a";
  context.font = `600 24px ${FONT_STACK}`;
  context.fillText(pass.organizationCode || "Managed visitor operations", 690, 208);

  const tone = tonePalette(pass);
  roundRect(context, 1890, 122, 380, 92, 26, tone.surface);
  context.fillStyle = tone.text;
  context.font = `700 34px ${FONT_STACK}`;
  context.fillText(pass.validityStatus || pass.statusLabel || formatStatus(pass.status), 1930, 178);

  const detailOriginX = 690;
  const detailOriginY = 340;
  const cardWidth = 470;
  const cardHeight = 168;
  const detailCards = [
    ["Host employee", pass.hostEmployee || "Front desk assigned"],
    ["Host team", pass.hostEmployeeDepartment || "Workplace team"],
    ["Visitor type", visitorTypeLabel(pass.visitorType)],
    ["Vendor", pass.vendorCompanyName || pass.companyName || "Not recorded"],
    ["Visit date", formatDateOnly(pass.scheduledStartTime || pass.approvedAt || pass.issuedAt)],
    ["Access window", accessWindowLabel(pass)],
    ["Badge ID", pass.badgeId || "Pending issuance"],
    ["Expires", `${formatDate(pass.expiresAt)} ${timezoneLabel(pass.organizationTimezone || "UTC")}`],
  ];

  detailCards.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawMetaCard(
      context,
      detailOriginX + (column * (cardWidth + 32)),
      detailOriginY + (row * (cardHeight + 24)),
      cardWidth,
      cardHeight,
      label,
      value
    );
  });

  roundRect(context, 1690, 340, 560, 560, 34, "#f6f9fc");
  roundRect(context, 1730, 380, 480, 480, 28, "#ffffff");
  drawImageContain(context, qr, 1780, 430, 380, 380);
  context.fillStyle = "#64748b";
  context.font = `700 24px ${FONT_STACK}`;
  context.fillText("Scan to validate this badge live", 1778, 850);

  roundRect(context, 690, 1260, 1560, 166, 30, "#f6f9fc");
  context.fillStyle = "#64748b";
  context.font = `700 24px ${FONT_STACK}`;
  context.fillText("VISIT PURPOSE", 740, 1320);
  context.fillStyle = "#071120";
  context.font = `700 36px ${FONT_STACK}`;
  wrapText(context, pass.purposeOfVisit || "General visit", 740, 1374, 980, 42);
  context.fillStyle = "#64748b";
  context.font = `600 24px ${FONT_STACK}`;
  wrapText(context, "Present photo identification if requested by security. Badge remains valid only while the approved AccessFlow visit window is active.", 1500, 1320, 680, 34);

  return canvas;
}

function createPdfFromCanvas(canvas) {
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.99);
  const jpegBytes = base64ToBytes(jpegDataUrl.split(",")[1]);
  const pagePadding = 18;
  const pageWidth = 792;
  const imageWidth = pageWidth - (pagePadding * 2);
  const imageHeight = Math.round((canvas.height / canvas.width) * imageWidth);
  const pageHeight = imageHeight + (pagePadding * 2);
  const imageX = pagePadding;
  const imageY = pagePadding;
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
  const content = `q\n${imageWidth} 0 0 ${imageHeight} ${imageX} ${imageY} cm\n/Im0 Do\nQ`;
  startObject();
  pushText(`5 0 obj << /Length ${encoder.encode(content).length} >> stream\n${content}\nendstream\nendobj\n`);

  const xrefOffset = length;
  pushText(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => pushText(`${String(offset).padStart(10, "0")} 00000 n \n`));
  pushText(`trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

function safeFileName(pass, extension) {
  const name = String(pass.fullName || "visitor-badge")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  const badgeId = String(pass.badgeId || pass.passCode || "badge")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return `accessflow-badge-${badgeId || "badge"}-${name || "visitor"}.${extension}`;
}

function renderPrintDocument(pass, imageDataUrl) {
  const title = escapeHtml(`AccessFlow badge - ${pass.fullName || pass.badgeId || "visitor"}`);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        background: #ffffff;
        margin: 0;
        min-height: 100%;
        padding: 0;
      }

      body {
        font-family: Aptos, "Segoe UI", "Helvetica Neue", sans-serif;
      }

      .print-badge-page {
        align-items: center;
        display: flex;
        justify-content: center;
        min-height: 100vh;
        padding: 6mm;
        width: 100%;
      }

      .print-badge-card {
        aspect-ratio: 2480 / 1564;
        display: block;
        inline-size: min(100%, 255mm);
        max-inline-size: 255mm;
        page-break-inside: avoid;
      }

      .print-badge-card img {
        display: block;
        height: auto;
        image-rendering: crisp-edges;
        image-rendering: -webkit-optimize-contrast;
        max-inline-size: 100%;
        width: 100%;
      }

      @page {
        margin: 6mm;
        size: auto landscape;
      }

      @media print {
        html,
        body {
          height: auto;
        }

        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .print-badge-page {
          min-height: auto;
          padding: 0;
        }

        .print-badge-card {
          inline-size: min(100%, 255mm);
          margin: 0 auto;
        }
      }
    </style>
  </head>
  <body>
    <main class="print-badge-page" aria-label="AccessFlow visitor badge print layout">
      <figure class="print-badge-card">
        <img src="${imageDataUrl}" alt="${escapeHtml(pass.fullName || "Visitor")} badge" data-print-badge-image />
      </figure>
    </main>
  </body>
</html>`;
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

function drawMetaCard(context, x, y, width, height, label, value) {
  roundRect(context, x, y, width, height, 24, "#f6f9fc");
  context.fillStyle = "#607187";
  context.font = `700 24px ${FONT_STACK}`;
  context.fillText(String(label || "").toUpperCase(), x + 34, y + 48);
  context.fillStyle = "#071120";
  context.font = `700 34px ${FONT_STACK}`;
  wrapText(context, value, x + 34, y + 102, width - 68, 40);
}

function shadowPanel(context, x, y, width, height, radius) {
  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.12)";
  context.shadowBlur = 36;
  context.shadowOffsetY = 22;
  roundRect(context, x, y, width, height, radius, "#ffffff");
  context.restore();
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

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function detailTile(label, value) {
  return `
    <article class="enterprise-badge__detail-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function accessWindowLabel(pass) {
  if (isRecurring(pass)) {
    const start = pass.validityStartDate ? formatDate(pass.validityStartDate) : null;
    const end = pass.validityEndDate ? formatDate(pass.validityEndDate) : null;
    const dates = start && end ? `${start} to ${end}` : end ? `Until ${end}` : "During recurring validity";
    const time = pass.allowedEntryStartTime && pass.allowedEntryEndTime
      ? `, ${pass.allowedEntryStartTime}-${pass.allowedEntryEndTime}`
      : "";
    return `${dates}${time}`;
  }
  const start = pass.accessWindowStartTime ? formatDate(pass.accessWindowStartTime) : pass.scheduledStartTime ? formatDate(pass.scheduledStartTime) : null;
  const end = pass.accessWindowEndTime ? formatDate(pass.accessWindowEndTime) : pass.scheduledEndTime ? formatDate(pass.scheduledEndTime) : null;
  if (start && end) {
    return `${start} to ${end} ${timezoneLabel(pass.organizationTimezone || "UTC")}`;
  }
  if (end) {
    return `Until ${end}`;
  }
  return "Open until badge expiry";
}

function isRecurring(pass) {
  return pass?.visitorType === "RECURRING" || pass?.visitorType === "CONTRACTOR_VENDOR";
}

function visitorTypeLabel(type) {
  if (type === "RECURRING") {
    return "Recurring visitor";
  }
  if (type === "CONTRACTOR_VENDOR") {
    return "Contractor / vendor";
  }
  return "One-time visitor";
}

function deriveCheckInState(pass) {
  if (pass.checkOutTime) {
    return "Checked out";
  }
  if (pass.checkInTime) {
    return pass.validityStatus === "Overdue" ? "Checked in · overdue" : "Checked in";
  }
  if (pass.status === "APPROVED") {
    return "Pending check-in";
  }
  return pass.statusLabel || formatStatus(pass.status);
}

function badgeTone(pass) {
  const value = String(pass.validityStatus || pass.status || "").toUpperCase();
  if (value.includes("EXPIRED") || value.includes("REJECTED") || value.includes("DENIED")) {
    return "danger";
  }
  if (value.includes("OVERDUE") || value.includes("SCHEDULED") || value.includes("PENDING")) {
    return "warning";
  }
  if (value.includes("CHECKED OUT")) {
    return "neutral";
  }
  return "success";
}

function tonePalette(pass) {
  const tone = badgeTone(pass);
  if (tone === "danger") {
    return { surface: "#fff1f2", text: "#be123c" };
  }
  if (tone === "warning") {
    return { surface: "#fff7e8", text: "#9a6700" };
  }
  if (tone === "neutral") {
    return { surface: "#eef2f6", text: "#334155" };
  }
  return { surface: "#ecfdf3", text: "#166534" };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
