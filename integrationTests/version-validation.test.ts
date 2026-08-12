/**
 * Verifies the Version resource custom validation that enforces activeVersion >= 0.
 * Invalid values (negative numbers, non-numbers) must return 400.
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

suite('Version validation', (ctx: ContextWithHarper) => {
  before(async () => {
    await setupHarperWithFixture(ctx, fixtureDir);
  });

  after(async () => {
    await teardownHarper(ctx);
  });

  test('POST /Version with valid activeVersion creates a version entry', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const res = await fetch(`${httpURL}/Version/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ id: 'v-valid-1', activeVersion: 1 }),
    });

    ok(res.ok, `expected success, got HTTP ${res.status}`);
  });

  test('POST /Version with activeVersion=0 is valid', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const res = await fetch(`${httpURL}/Version/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ id: 'v-valid-zero', activeVersion: 0 }),
    });

    ok(res.ok, `activeVersion=0 should be valid, got HTTP ${res.status}`);
  });

  test('POST /Version with negative activeVersion returns 400', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const res = await fetch(`${httpURL}/Version/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ id: 'v-invalid-neg', activeVersion: -1 }),
    });

    strictEqual(res.status, 400);
    const body = await res.json() as { message?: string };
    ok(body.message, 'error response should include a message');
  });

  test('PUT /Version/:id with negative activeVersion returns 400', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    // Create a valid version first
    await fetch(`${httpURL}/Version/v-put-test`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ id: 'v-put-test', activeVersion: 1 }),
    });

    const res = await fetch(`${httpURL}/Version/v-put-test`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ id: 'v-put-test', activeVersion: -5 }),
    });

    strictEqual(res.status, 400);
  });

  test('GET /Version/:id returns the created version', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    await fetch(`${httpURL}/Version/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ id: 'v-get-test', activeVersion: 42 }),
    });

    const getRes = await fetch(`${httpURL}/Version/v-get-test`, {
      headers: { Authorization: auth },
    });

    strictEqual(getRes.status, 200);
    const body = await getRes.json() as { id: string; activeVersion: number };
    strictEqual(body.id, 'v-get-test');
    strictEqual(body.activeVersion, 42);
  });
});
