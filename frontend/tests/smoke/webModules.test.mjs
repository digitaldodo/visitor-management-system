import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('portal stylesheet remains a manifest of focused foundation partials', async () => {
  const portalCss = await source('css/shared/portal.css');

  assert.match(portalCss, /portal\/layout\/shell\.css/);
  assert.match(portalCss, /portal\/components\/forms\.css/);
  assert.match(portalCss, /portal\/pages\/visitor\.css/);
  assert.match(portalCss, /portal\/utilities\/responsive\.css/);
});

test('workflow enum entrypoint keeps compatibility re-exports', async () => {
  const workflowEnums = await source('js/shared/workflowEnums.js');

  assert.match(workflowEnums, /from "\.\/roleFormatting\.js"/);
  assert.match(workflowEnums, /from "\.\/statusFormatting\.js"/);
  assert.match(workflowEnums, /from "\.\/workflowLabels\.js"/);
  assert.match(workflowEnums, /from "\.\/badgeUtils\.js"/);
});

test('admin portal keeps route-based workspace architecture', async () => {
  const dashboard = await source('js/admin/dashboard.js');

  assert.match(dashboard, /function workspaceTemplate\(routeKey\)/);
  assert.match(dashboard, /case "visitor-access"/);
  assert.match(dashboard, /case "workforce-approvals"/);
  assert.match(dashboard, /case "organization-settings"/);
});
