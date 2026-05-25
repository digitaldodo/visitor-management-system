import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const distDir = path.join(rootDir, "dist");
const buildTime = new Date();
const apiBaseUrl = resolveBuildApiBaseUrl(process.env.API_BASE_URL);

if (!apiBaseUrl) {
  throw new Error("API_BASE_URL is required to build the static frontend.");
}

const buildMeta = createBuildMeta(buildTime);

await rm(distDir, { recursive: true, force: true });
await copyWorkspace(rootDir, distDir);
await writeGeneratedAssets(distDir, apiBaseUrl, buildMeta);
await rewriteFiles(distDir, buildMeta.assetToken);
await writeRouteAliases(distDir);

console.log(`AccessFlow frontend prepared in ${distDir}`);
console.log(`Version: ${buildMeta.version}`);

function createBuildMeta(timestamp) {
  const year = timestamp.getUTCFullYear();
  const month = pad(timestamp.getUTCMonth() + 1);
  const day = pad(timestamp.getUTCDate());
  const hours = pad(timestamp.getUTCHours());
  const minutes = pad(timestamp.getUTCMinutes());
  const seconds = pad(timestamp.getUTCSeconds());
  const revision = String(process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "").trim().slice(0, 12);

  return {
    version: `${year}.${month}.${day}.${hours}${minutes}${seconds}`,
    assetToken: `${year}${month}${day}_${hours}${minutes}${seconds}`,
    builtAt: timestamp.toISOString(),
    revision: revision || null,
  };
}

function resolveBuildApiBaseUrl(value) {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) {
    return "";
  }
  if (isRenderBuild()) {
    if (isLocalApiBaseUrl(normalized)) {
      throw new Error("Render builds must not use a local API_BASE_URL.");
    }
    if (new URL(normalized).host.toLowerCase() !== productionApiHost()) {
      throw new Error("Render builds must use the active AccessFlow production API_BASE_URL.");
    }
  }
  return normalized;
}

function normalizeApiBaseUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    return "";
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return "";
  }

  const pathName = url.pathname.replace(/\/+$/, "");
  if (!pathName || pathName === "/") {
    url.pathname = "/api/v1";
  } else if (pathName !== "/api/v1") {
    return "";
  } else {
    url.pathname = "/api/v1";
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function isRenderBuild() {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_NAME);
}

function isLocalApiBaseUrl(value) {
  const host = new URL(value).hostname.toLowerCase();
  return /(?:^|\.)localhost$|^127\.0\.0\.1$|^\[::1\]$/.test(host);
}

function productionApiHost() {
  return new URL("https://accessflow-api-goww.onrender.com/api/v1").host.toLowerCase();
}

async function copyWorkspace(sourceDir, targetDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "scripts") {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyWorkspace(sourcePath, targetPath);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { force: true });
  }
}

async function writeGeneratedAssets(targetDir, apiUrl, meta) {
  const assetsJsDir = path.join(targetDir, "assets", "js");
  const manifestPath = path.join(targetDir, "assets", "app-manifest.json");
  const runtimeEnv = {
    apiBaseUrl: apiUrl,
    visitorApiBaseUrl: apiUrl,
    appVersion: meta.version,
    appAssetToken: meta.assetToken,
    appBuildTimestamp: meta.builtAt,
    appBuildRevision: meta.revision,
  };

  await mkdir(assetsJsDir, { recursive: true });
  await writeFile(
    path.join(assetsJsDir, "env.js"),
    [
      `window.ACCESSFLOW_ENV = Object.freeze(${JSON.stringify(runtimeEnv, null, 2)});`,
      "window.ACCESSFLOW_RUNTIME_ENV = window.ACCESSFLOW_ENV;",
      `window.API_BASE_URL = ${JSON.stringify(apiUrl)};`,
      "window.VISITOR_API_BASE_URL = window.API_BASE_URL;",
      `window.APP_VERSION = ${JSON.stringify(meta.version)};`,
      `window.APP_ASSET_TOKEN = ${JSON.stringify(meta.assetToken)};`,
      `window.APP_BUILD_TIMESTAMP = ${JSON.stringify(meta.builtAt)};`,
      `window.APP_BUILD_REVISION = ${JSON.stringify(meta.revision)};`,
    ].join("\n"),
  );

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        app: "AccessFlow",
        version: meta.version,
        assetToken: meta.assetToken,
        builtAt: meta.builtAt,
        revision: meta.revision,
      },
      null,
      2,
    ),
  );
}

async function rewriteFiles(targetDir, assetToken) {
  const entries = await readdir(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await rewriteFiles(fullPath, assetToken);
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (![".html", ".js", ".css"].includes(extension)) {
      continue;
    }

    const content = await readFile(fullPath, "utf8");
    let nextContent = content;

    if (extension === ".html") {
      nextContent = rewriteHtmlAssets(nextContent, assetToken, fullPath, targetDir);
    }
    if (extension === ".js") {
      nextContent = rewriteJavaScriptImports(nextContent, assetToken);
    }
    if (extension === ".css") {
      nextContent = rewriteCssImports(nextContent, assetToken);
    }

    if (nextContent !== content) {
      await writeFile(fullPath, nextContent);
    }
  }
}

async function writeRouteAliases(targetDir) {
  const aliases = [
    {
      source: "index.html",
      routes: ["auth", "login", "visitor/login", "visitor/register", "visitor/sign-in"],
    },
    {
      source: "pages/admin/index.html",
      routes: [
        "admin",
        "admin/dashboard",
        "admin/employees",
        "admin/departments",
        "admin/visitor-access",
        "admin/visitors",
        "admin/workforce-approvals",
        "admin/attendance-presence",
        "admin/emergency-ops",
        "admin/reports",
        "admin/notifications",
        "admin/organization-settings",
        "admin/platform-analytics",
        "admin/organizations",
        "admin/tenant-health",
        "admin/global-audit",
        "admin/workforce-oversight",
        "admin/security-monitoring",
        "admin/platform-settings",
        "admin/homepage-settings",
        "admin/homepage-controls",
        "admin/system-monitoring",
        "admin/runtime-status",
        "admin/feature-flags",
        "admin/api-health",
      ],
    },
    {
      source: "pages/employee/index.html",
      routes: [
        "employee",
        "employee/dashboard",
        "employee/badge",
        "employee/requests",
        "employee/presence",
        "employee/history",
        "employee/profile",
        "employee/notifications",
        "employee/settings",
      ],
    },
    {
      source: "pages/security/index.html",
      routes: [
        "security",
        "security/dashboard",
        "security/verification",
        "security/scanner",
        "security/visitors",
        "security/checkins",
        "security/approvals",
        "security/incidents",
        "security/emergency",
        "security/notifications",
        "security/logs",
        "security/settings",
        "security/profile",
        "security/visitor-registration",
        "security/queue",
        "security/monitoring",
        "security/check-in",
        "security/photo",
        "security/qr",
        "security/badges",
        "security/employee-check-in",
        "security/workforce-onboarding",
        "security/employee-attendance",
        "security/workforce-logs",
      ],
    },
    {
      source: "pages/visitor/index.html",
      routes: [
        "visitor",
        "visitor/dashboard",
        "visitor/badge",
        "visitor/requests",
        "visitor/history",
        "visitor/profile",
        "visitor/notifications",
        "visitor/settings",
        "visitor/pre-registration",
      ],
    },
    {
      source: "pages/forgot-password/index.html",
      routes: ["forgot-password"],
    },
    {
      source: "pages/verify-otp/index.html",
      routes: ["verify-otp"],
    },
    {
      source: "pages/verify-email/index.html",
      routes: ["verify-email"],
    },
    {
      source: "pages/invite/index.html",
      routes: ["visitor-invite", "pre-registration"],
    },
    {
      source: "pages/reset-password/index.html",
      routes: ["reset-password"],
    },
  ];

  for (const alias of aliases) {
    const sourcePath = path.join(targetDir, alias.source);
    const content = await readFile(sourcePath, "utf8");
    for (const route of alias.routes) {
      await writeRouteAlias(targetDir, route, content);
    }
  }
}

async function writeRouteAlias(targetDir, route, content) {
  const routePath = path.join(targetDir, ...route.split("/"), "index.html");
  await mkdir(path.dirname(routePath), { recursive: true });
  await writeFile(routePath, content);
}

function rewriteHtmlAssets(content, assetToken, htmlFilePath, targetDir) {
  return content.replace(/(?<prefix>\b(?:src|href)=["'])(?<value>[^"']+)(?<suffix>["'])/gi, (match, prefix, value, suffix) => {
    const cleaned = stripQueryAndHash(value);
    if (!isLocalAsset(cleaned) || !isHtmlAsset(cleaned)) {
      return match;
    }

    const rootPath = toRootAbsoluteAssetPath(cleaned, htmlFilePath, targetDir);
    const nextValue = isVersionedHtmlAsset(rootPath)
      ? withVersion(rootPath, assetToken, hashFragment(value))
      : `${rootPath}${hashFragment(value)}`;
    return `${prefix}${nextValue}${suffix}`;
  });
}

function rewriteJavaScriptImports(content, assetToken) {
  const patterns = [
    /(from\s*["'])([^"']+)(["'])/g,
    /(import\s*["'])([^"']+)(["'])/g,
    /(import\s*\(\s*["'])([^"']+)(["']\s*\))/g,
  ];

  return patterns.reduce(
    (value, pattern) => value.replace(pattern, (match, prefix, specifier, suffix) => {
      if (!isRelativeModule(specifier)) {
        return match;
      }
      return `${prefix}${withVersion(specifier, assetToken)}${suffix}`;
    }),
    content,
  );
}

function rewriteCssImports(content, assetToken) {
  return content
    .replace(/(@import\s+url\(\s*["']?)([^"')]+)(["']?\s*\))/g, (match, prefix, specifier, suffix) => {
      if (!isLocalAsset(specifier)) {
        return match;
      }
      return `${prefix}${withVersion(specifier, assetToken)}${suffix}`;
    })
    .replace(/(@import\s+["'])([^"']+)(["'])/g, (match, prefix, specifier, suffix) => {
      if (!isLocalAsset(specifier)) {
        return match;
      }
      return `${prefix}${withVersion(specifier, assetToken)}${suffix}`;
    });
}

function withVersion(value, assetToken, hash = "") {
  const cleaned = stripQueryAndHash(value);
  return `${cleaned}?v=${assetToken}${hash}`;
}

function stripQueryAndHash(value) {
  return String(value).replace(/[?#].*$/, "");
}

function isLocalAsset(value) {
  const normalized = stripQueryAndHash(value);
  return !/^(?:[a-z]+:)?\/\//i.test(normalized) && !normalized.startsWith("data:");
}

function isHtmlAsset(value) {
  return /\.(?:css|js|png|jpe?g|webp|svg|ico|json)$/i.test(stripQueryAndHash(value));
}

function isVersionedHtmlAsset(value) {
  return /\.(?:css|js)$/i.test(stripQueryAndHash(value));
}

function isRelativeModule(value) {
  return /^\.{1,2}\//.test(stripQueryAndHash(value)) && /\.js$/i.test(stripQueryAndHash(value));
}

function toRootAbsoluteAssetPath(value, htmlFilePath, targetDir) {
  if (value.startsWith("/")) {
    return value.replace(/\\/g, "/");
  }

  const relativeHtmlDir = path.relative(targetDir, path.dirname(htmlFilePath)).split(path.sep).join("/");
  const basePath = relativeHtmlDir ? `/${relativeHtmlDir}/` : "/";
  return new URL(value, `https://accessflow.local${basePath}`).pathname;
}

function hashFragment(value) {
  const hashIndex = String(value).indexOf("#");
  return hashIndex === -1 ? "" : String(value).slice(hashIndex);
}

function pad(value) {
  return String(value).padStart(2, "0");
}
