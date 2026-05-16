window.API_BASE_URL = "https://accessflow-api-goww.onrender.com/api/v1";
window.VISITOR_API_BASE_URL = window.API_BASE_URL;
window.APP_VERSION = window.APP_VERSION || "dev-local";
window.APP_ASSET_TOKEN = window.APP_ASSET_TOKEN || "dev-local";
window.APP_BUILD_TIMESTAMP = window.APP_BUILD_TIMESTAMP || null;
window.APP_BUILD_REVISION = window.APP_BUILD_REVISION || null;
window.ACCESSFLOW_ENV = Object.freeze({
  apiBaseUrl: window.API_BASE_URL,
  visitorApiBaseUrl: window.VISITOR_API_BASE_URL,
  appVersion: window.APP_VERSION,
  appAssetToken: window.APP_ASSET_TOKEN,
  appBuildTimestamp: window.APP_BUILD_TIMESTAMP,
  appBuildRevision: window.APP_BUILD_REVISION,
});
window.ACCESSFLOW_RUNTIME_ENV = window.ACCESSFLOW_ENV;
