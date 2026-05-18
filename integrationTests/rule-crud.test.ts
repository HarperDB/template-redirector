/**
 * Verifies CRUD operations on the Rule and Hosts tables (redirect rules).
 * Both tables are directly exported via REST. Each test creates its own data.
 */
import { suite, test, before, after } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { setupHarperWithFixture, teardownHarper, type ContextWithHarper } from '@harperfast/integration-testing';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, '..');

function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function makeRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path: '/old-path',
    redirectURL: '/new-path',
    statusCode: 301,
    version: 1,
    host: '',
    regex: false,
    ...overrides,
  };
}

suite('Rule and Hosts CRUD', (ctx: ContextWithHarper) => {
  before(async () => {
    await setupHarperWithFixture(ctx, fixtureDir);
  });

  after(async () => {
    await teardownHarper(ctx);
  });

  test('POST /Rule creates a redirect rule', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);
    const rule = makeRule({ path: '/about', redirectURL: '/about-us' });

    const res = await fetch(`${httpURL}/Rule/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(rule),
    });

    ok(res.ok, `expected successful creation, got HTTP ${res.status}`);
  });

  test('GET /Rule/:id returns the created rule', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);
    const rule = makeRule({ id: 'get-test-rule', path: '/blog', redirectURL: '/blog-new' });

    await fetch(`${httpURL}/Rule/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(rule),
    });

    const getRes = await fetch(`${httpURL}/Rule/get-test-rule`, {
      headers: { Authorization: auth },
    });

    strictEqual(getRes.status, 200);
    const body = await getRes.json() as { id: string; path: string; redirectURL: string };
    strictEqual(body.id, 'get-test-rule');
    strictEqual(body.path, '/blog');
    strictEqual(body.redirectURL, '/blog-new');
  });

  test('DELETE /Rule/:id removes the rule', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);
    const rule = makeRule({ id: 'delete-test-rule', path: '/delete-me', redirectURL: '/gone' });

    await fetch(`${httpURL}/Rule/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(rule),
    });

    const deleteRes = await fetch(`${httpURL}/Rule/delete-test-rule`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    ok(deleteRes.ok, `expected successful delete, got HTTP ${deleteRes.status}`);

    const getRes = await fetch(`${httpURL}/Rule/delete-test-rule`, {
      headers: { Authorization: auth },
    });
    strictEqual(getRes.status, 404);
  });

  test('GET /Rule returns an array of rules', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    await fetch(`${httpURL}/Rule/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(makeRule({ path: '/list-test', redirectURL: '/list-new' })),
    });

    const res = await fetch(`${httpURL}/Rule/`, {
      headers: { Authorization: auth },
    });

    strictEqual(res.status, 200);
    const body = await res.json();
    ok(Array.isArray(body), 'GET /Rule should return an array');
    ok((body as unknown[]).length >= 1, 'should have at least one rule');
  });

  test('POST /Hosts creates a host entry', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const res = await fetch(`${httpURL}/Hosts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ host: 'example.com', hostOnly: true }),
    });

    ok(res.ok, `expected successful creation, got HTTP ${res.status}`);
  });

  test('GET /Hosts/:host returns the host entry', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    await fetch(`${httpURL}/Hosts/test.example.com`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ host: 'test.example.com', hostOnly: false }),
    });

    const getRes = await fetch(`${httpURL}/Hosts/test.example.com`, {
      headers: { Authorization: auth },
    });

    strictEqual(getRes.status, 200);
    const body = await getRes.json() as { host: string; hostOnly: boolean };
    strictEqual(body.host, 'test.example.com');
    strictEqual(body.hostOnly, false);
  });
});
