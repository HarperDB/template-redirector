import fs from 'fs';
import https from 'https';
import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';

const TEST_DOMAIN = process.env.TEST_DOMAIN || 'https://localhost:9926';
const HDB_ADMIN_USERNAME = process.env.HDB_ADMIN_USERNAME || 'HDB_ADMIN';
const HDB_ADMIN_PASSWORD = process.env.HDB_ADMIN_PASSWORD || 'password';

let authAgent;
beforeAll(() => {
	const insecureAgent = new https.Agent({ rejectUnauthorized: false });
	const authToken = Buffer.from(`${HDB_ADMIN_USERNAME}:${HDB_ADMIN_PASSWORD}`).toString('base64');
	const authHeader = `Basic ${authToken}`;

	authAgent = (method, path) =>
		request(TEST_DOMAIN)[method](path).agent(insecureAgent).set('Authorization', authHeader);
});

const jsonfile = 'data/sample/example.json';
const csvfile = 'data/sample/example.csv';
const jsonData = fs.readFileSync(jsonfile, 'utf8');
const csvData = fs.readFileSync(csvfile, 'utf8');

// Test the /Version endpoint
describe('/Version endpoint', () => {
	const hostname = 'www.example.com';
	let id;

	describe('Clear all entries from Version table', () => {
		it('Should execute a successful DELETE request to clear table', async () => {
			const res = await authAgent('delete', '/Version/');
			expect([200, 204]).toContain(res.status);
		});

		it('Should return no results after deletion', async () => {
			const res = await authAgent('get', '/Version/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
		});
	});

	describe('Add new entry to Version table', () => {
		const version = 1;
		it('Should execute a successful POST request to add version', async () => {
			const res = await authAgent('post', '/Version/').send({ activeVersion: version, hostname: hostname });
			expect([200, 201]).toContain(res.status);
			expect(typeof res.body).toBe('number');
			id = res.body;
		});

		it('Should return the correct version after addition', async () => {
			const res = await authAgent('get', `/Version?hostname=${hostname}`);
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body[0].activeVersion).toBe(version);
		});
	});

	describe('Update existing entry in Version table', () => {
		const version = 0;
		it('Should execute a successful PUT request to update version', async () => {
			const res = await authAgent('put', `/Version/${id}`).send({ activeVersion: version });
			expect([200, 204]).toContain(res.status);
		});

		it('Should return the correct version after update', async () => {
			const res = await authAgent('get', `/Version/${id}`);
			expect(res.status).toBe(200);
			expect(res.body.activeVersion).toBe(version);
		});
	});

	describe('Should not allow invalid activeVersion values', () => {
		const invalidValues = [-1, 'string', null, undefined, {}, []];

		invalidValues.forEach((value) => {
			it(`Should return 400 for POST with activeVersion=${JSON.stringify(value)}`, async () => {
				const res = await authAgent('post', '/Version/').send({ activeVersion: value, hostname: hostname });
				expect(res.status).toBe(400);
				expect(res.body).toHaveProperty('message', 'Invalid activeVersion value, must be a non-negative number.');
			});

			it(`Should return 400 for PUT with activeVersion=${JSON.stringify(value)}`, async () => {
				const res = await authAgent('put', `/Version/${id}`).send({ activeVersion: value });
				expect(res.status).toBe(400);
				expect(res.body).toHaveProperty('message', 'Invalid activeVersion value, must be a non-negative number.');
			});

			it(`Should return 400 for PATCH with activeVersion=${JSON.stringify(value)}`, async () => {
				const res = await authAgent('patch', `/Version/${id}`).send({ activeVersion: value });
				expect(res.status).toBe(400);
				expect(res.body).toHaveProperty('message', 'Invalid activeVersion value, must be a non-negative number.');
			});
		});
	});

	describe('Delete existing entry in Version table', () => {
		it('Should execute a successful DELETE request to remove a version', async () => {
			const res = await authAgent('delete', `/Version/${id}`);
			expect([200, 204]).toContain(res.status);
		});

		it('Should return no results after deletion', async () => {
			const res = await authAgent('get', `/Version/${id}`);
			expect(res.status).toBe(404);
		});
	});
});

// Test the /Hosts endpoint
describe('/Hosts endpoint', () => {
	const hostname = 'www.example.com';

	describe('Clear all entries from Hosts table', () => {
		it('Should execute a successful DELETE request to clear table', async () => {
			const res = await authAgent('delete', '/Hosts/');
			expect([200, 204]).toContain(res.status);
		});

		it('Should return no results after deletion', async () => {
			const res = await authAgent('get', '/Hosts/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
		});
	});

	describe('Add new entry to Hosts table', () => {
		const hostOnly = true;
		it('Should execute a successful POST request to add host', async () => {
			const res = await authAgent('post', '/Hosts/').send({ host: hostname, hostOnly });
			expect([200, 201]).toContain(res.status);
			expect(typeof res.body).toBe('string');
			expect(res.body).toBe(hostname);
		});

		it('Should return the correct host after addition', async () => {
			const res = await authAgent('get', `/Hosts/${hostname}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('host', hostname);
			expect(res.body).toHaveProperty('hostOnly', hostOnly);
		});
	});

	describe('Update existing entry in Hosts table', () => {
		const hostOnly = false;
		it('Should execute a successful PUT request to update host', async () => {
			const res = await authAgent('put', `/Hosts/${hostname}`).send({ hostOnly });
			expect([200, 204]).toContain(res.status);
		});

		it('Should return the correct host after update', async () => {
			const res = await authAgent('get', `/Hosts/${hostname}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('host', hostname);
			expect(res.body).toHaveProperty('hostOnly', hostOnly);
		});
	});

	describe('Delete existing entry in Hosts table', () => {
		it('Should execute a successful DELETE request to remove a host', async () => {
			const res = await authAgent('delete', `/Hosts/${hostname}`);
			expect([200, 204]).toContain(res.status);
		});

		it('Should return no results after deletion', async () => {
			const res = await authAgent('get', `/Hosts/${hostname}`);
			expect(res.status).toBe(404);
		});
	});
});

// Test the /redirect endpoint (Rule table)
describe('/redirect endpoint', () => {
	let entries = 0;
	describe('Load entries into the redirect table via CSV', () => {
		it('Should execute a successful HTTP request', async () => {
			const res = await authAgent('post', '/redirect').set('Content-type', 'text/csv').send(csvData);
			expect([200, 201]).toContain(res.status);
			expect(res.body.message).toMatch(/Successfully loaded \d+ redirects./);
			entries = parseInt(res.body.message.match(/Successfully loaded (\d+) redirects./)[1], 10);
		});

		it(`Should have correct number of items now`, async () => {
			const res = await authAgent('get', '/redirect/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(entries);
		});
	});

	describe('Load entries again into the redirect table via CSV to check exclusion of duplicate paths', () => {
		it('Should execute a successful HTTP request', async () => {
			const res = await authAgent('post', '/redirect').set('Content-type', 'text/csv').send(csvData);
			expect([200, 201]).toContain(res.status);
			expect(res.body.message).toMatch('Successfully loaded 0 redirects.');
		});

		it(`Should still have same number of items now`, async () => {
			const res = await authAgent('get', '/redirect/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(entries);
		});
	});

	describe('Clear the entries', () => {
		it('Should execute a successful DELETE request', async () => {
			const res = await authAgent('delete', '/redirect/');
			expect([200, 204]).toContain(res.status);
		});

		it('Should have zero items now', async () => {
			const res = await authAgent('get', '/redirect/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
			entries = 0;
		});
	});

	entries = 0;
	describe('Load entries into the redirect table via JSON', () => {
		it('Should execute a successful HTTP request', async () => {
			const res = await authAgent('post', '/redirect').set('Content-type', 'application/json').send(jsonData);
			expect([200, 201]).toContain(res.status);
			expect(res.body.message).toMatch(/Successfully loaded \d+ redirects./);
			entries = parseInt(res.body.message.match(/Successfully loaded (\d+) redirects./)[1], 10);
		});

		it(`Should have correct number of items now`, async () => {
			const res = await authAgent('get', '/redirect/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(entries);
		});
	});

	describe('Load entries again into the redirect table via JSON to check exclusion of duplicate paths', () => {
		it('Should execute a successful HTTP request', async () => {
			const res = await authAgent('post', '/redirect').set('Content-type', 'application/json').send(jsonData);
			expect([200, 201]).toContain(res.status);
			expect(res.body.message).toMatch('Successfully loaded 0 redirects.');
		});

		it(`Should still have same number of items now`, async () => {
			const res = await authAgent('get', '/redirect/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(entries);
		});
	});
});

// Test the /checkredirect endpoint
describe('/checkredirect endpoint', () => {
	describe('Check for a correct redirect response using query string', async () => {
		it('It should return the correct redirect URL', async () => {
			const path = '/shop/live-shopping';
			const redirect = '/s/events';
			const res = await authAgent('get', `/checkredirect?path=${path}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});
	});

	describe('Check for a correct redirect response using Path header', async () => {
		it('It should return the correct redirect URL', async () => {
			const path = '/shop/live-shopping';
			const redirect = '/s/events';
			const res = await authAgent('get', `/checkredirect`).set('Path', path);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});
	});

	describe('Check if a redirect does not exists using the query string', () => {
		it('It should return a 404', async () => {
			const path = '/fake/';
			const res = await authAgent('get', `/checkredirect?path=${path}`);
			expect(res.status).toBe(404);
		});
	});

	describe('Check if a redirect does not exists using the Path header', () => {
		it('It should return a 404', async () => {
			const path = '/fake/';
			const res = await authAgent('get', `/checkredirect`).set('Path', path);
			expect(res.status).toBe(404);
		});
	});

	describe('Check for a correct redirect using query with host parameter', async () => {
		it('It should return the correct redirect URL', async () => {
			const path = '/p/shirts/';
			const redirect = '/shop/mens-clothing/shirts?id=1234';
			const host = 'www.example.com';
			const res = await authAgent('get', `/checkredirect?h=${host}&path=${path}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});
	});

	describe('Check for a correct redirect using query with version parameter', async () => {
		it('It should return the correct redirect URL', async () => {
			const path = '/p/shoes/flats/';
			const redirect = '/shop/shoes/flats/v1';
			const version = 1;
			const res = await authAgent('get', `/checkredirect?v=${version}&path=${path}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});
	});

	describe('Check for a correct redirect using query with version parameter', async () => {
		it('It should return the correct redirect URL', async () => {
			const path = '/p/shoes/flats/';
			const redirect = '/shop/shoes/flats/v0';
			const res = await authAgent('get', `/checkredirect?path=${path}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});
	});

	describe('Check for slash handling (default behavior honors slash)', async () => {
		const path_no_slash = '/dir3/dir4';
		const path_slash = '/dir3/dir4/';
		const redirect_no_slash = '/dir3/dir4/dir5';
		const redirect_slash = '/dir3/dir4/dir6';

		it('Should match the no_slash', async () => {
			const res = await authAgent('get', `/checkredirect?path=${path_no_slash}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect_no_slash);
		});

		it('Should match the slash', async () => {
			const res = await authAgent('get', `/checkredirect?path=${path_slash}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect_slash);
		});
	});

	describe('Check for slash handling with ignore slash query string', async () => {
		const path_no_slash = '/dir2/file3';
		const path_slash = '/dir2/file3/';
		const redirect = '/dir2/other3';

		it('Should match the no_slash', async () => {
			const res = await authAgent('get', `/checkredirect?si=1&path=${path_no_slash}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});

		it('Should match the slash', async () => {
			const res = await authAgent('get', `/checkredirect?si=1&path=${path_slash}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});
	});

	describe('Check redirect observe query string rules', async () => {
		it('Should match and preserve the query string', async () => {
			const path = '/dir2/file3';
			const qString = '?arg1=val1&arg2=val2';
			const redirect = '/dir2/other3';
			const res = await authAgent('get', `/checkredirect?path=${path}`).set('X-Query-String', qString);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect + qString);
		});

		it('Should match and filter the query string', async () => {
			const path = '/dir2/file4';
			const qString = '?arg1=val1&arg2=val2';
			const redirect = '/dir2/other4?arg2=val2';
			const res = await authAgent('get', `/checkredirect?path=${path}`).set('X-Query-String', qString);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});
	});

	describe('Check a regex match', async () => {
		const path = '/dir1/fileX';
		const redirect = '/dir2/';

		it('Should match the simple regex', async () => {
			const res = await authAgent('get', `/checkredirect?path=${path}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});

		it('Should match and remove qs', async () => {
			const qString = '?foo=bar';
			const res = await authAgent('get', `/checkredirect?path=${path}`).set('X-Query-String', qString);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect + qString);
		});

		it('Should match correct regex when similar exists', async () => {
			const path = '/dir11/special-thing';
			const redirect = '/dir99/';
			const res = await authAgent('get', `/checkredirect?path=${path}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});

		it('Should match and remove qs', async () => {
			const path = '/dir11/special-thing';
			const qString = '?arg1=val1&arg2=val2';
			const redirect = '/dir99/';
			const res = await authAgent('get', `/checkredirect?path=${path}`).set('X-Query-String', qString);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});

		it('Should match more complex regex', async () => {
			const path = '/dir66/anything/file5';
			const redirect = '/magic/shopping/deals';
			const res = await authAgent('get', `/checkredirect?path=${path}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect);
		});

		it('Should match and filter qs', async () => {
			const path = '/dir66/anything/file5';
			const qString = '?top=1&foo=bar&fab=val5';
			const redirect = '/magic/shopping/deals';
			const res = await authAgent('get', `/checkredirect?path=${path}`).set('X-Query-String', qString);
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('redirectURL', redirect + '?foo=bar');
		});
	});
});

// Test the /Rule endpoint (for clearing out the Rule table)
describe('/Rule endpoint', () => {
	describe('Clear all entries from Rule table', () => {
		it('Should execute a successful DELETE request', async () => {
			const res = await authAgent('delete', '/Rule/');
			expect([200, 204]).toContain(res.status);
		});

		it('Should have zero items now', async () => {
			const res = await authAgent('get', '/Rule/');
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
		});
	});
});
