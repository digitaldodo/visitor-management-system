import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('admin mobile screens remain route-specific exports', async () => {
  const screen = await source('screens/admin/AdminOperationalScreen.tsx');

  [
    'AdminDashboardScreen',
    'AdminAnalyticsScreen',
    'AdminApprovalsScreen',
    'AdminVisitorsScreen',
    'AdminWorkforceScreen',
    'AdminReportsScreen',
    'AdminOrganizationScreen',
  ].forEach((exportName) => {
    assert.match(screen, new RegExp(`export function ${exportName}\\(`));
  });
});

test('runtime provider delegates extracted state helpers', async () => {
  const provider = await source('runtime/OperationalRuntimeProvider.tsx');

  assert.match(provider, /from '\.\/operationalRuntimeState'/);
  assert.doesNotMatch(provider, /function isSameDevicePosture/);
  assert.match(provider, /<OperationalRuntimeContext.Provider/);
});
