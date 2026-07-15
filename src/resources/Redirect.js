import { performance } from 'node:perf_hooks';
import Papa from 'papaparse';
import { allowedUserRoles, USE_STATIC_ONLY } from '../util/constants.js';
import { parseURLPath } from '../util/parse.js';
import { getCurrentVersion } from '../util/getCurrentConfig.js';
import { getRegexPrefix } from '../util/regexHelpers.js';

/**
 * Class for the /redirect endpoint custom functionality.
 *
 * Handles importing, validating, and persisting redirect rules from
 * CSV or JSON input. Also ensures de-duplication and versioning.
 *
 * OPTIONS:
 *  - USE_STATIC_ONLY: If true, only static paths are processed (no regex).
 */
export default class Redirect extends databases.redirects.Rule {
	// Write validated redirects to the database in batches
	static PROCESS_BATCH_SIZE = 100;

	/**
	 * Checks whether a user is allowed to post redirect rules.
	 * @param {Object} user - The user object containing role information.
	 * @returns {boolean} - True if the user has a permitted role, false otherwise.
	 */
	allowCreate(user) {
		return allowedUserRoles.includes(user?.role?.id);
	}

	/**
	 * Imports redirect rules from CSV or JSON input.
	 * - CSV input is parsed via Papa Parse.
	 * - JSON input is assumed to already contain redirect objects.
	 *
	 * @param {Object} target - Target identifier
	 * @param {Promise<Object>} data - Request data containing contentType and raw data (see data/example.json for format).
	 * @returns {Promise<Object>} - Summary of import with success message and skipped items.
	 */
	static async post(target, data) {
		const body = await data;
		const t1 = performance.now();
		let json;

		if (body.contentType === 'text/csv') {
			json = Papa.parse(body.data, {
				header: true,
				skipEmptyLines: true,
			});
		} else {
			json = body;
		}

		const results = await this.processRedirects(json.data);

		const t2 = performance.now();
		server.recordAnalytics(t2 - t1, 'redirect-upload-timing', USE_STATIC_ONLY);

		return {
			message: `Successfully loaded ${results.success} redirects.`,
			skipped: results.skipped,
		};
	}

	/**
	 * Validates, normalizes, and persists an array of redirect objects.
	 * Skips duplicates or invalid entries. Writes to DB in batches.
	 *
	 * @param {Array<Object>} redirects - Redirect rules from CSV or JSON.
	 * @returns {Promise<Object>} - Processing results (success count and skipped list).
	 */
	static async processRedirects(redirects) {
		const batchSize = this.PROCESS_BATCH_SIZE;
		logger.info(`Processing ${redirects.length} redirects (batch size: ${batchSize})`);

		let success = 0;
		const skipped = [];

		// Default version comes from active DB version
		const defaultVersion = await getCurrentVersion();

		// Track duplicates/loops within the current upload (host+version scoped)
		const seenPaths = new Set(); // key: `${version}||${host}||${path}`

		let batch = [];
		for (const item of redirects) {
			const t1 = performance.now();
			try {
				if (!this.validateRedirect(item, skipped)) continue;

				item.regex = item.regex ? Number(item.regex) === 1 : false;
				if (item.regex && USE_STATIC_ONLY) {
					skipped.push({ reason: 'regex not allowed in static mode', item });
					continue;
				}

				const [host, path, querystring] = parseURLPath(item.path);

				item.host = host || item.host || '';
				item.path = path + (querystring || '');
				item.version = typeof item.version === 'number' ? item.version : defaultVersion;

				// Check for duplicates/loops within this upload
				const pathKey = `${item.version}||${item.host}||${item.path}`;
				const redirectKey = `${item.version}||${item.host}||${item.redirectURL}`;

				// 1) Exact duplicate path in this upload
				if (seenPaths.has(pathKey)) {
					skipped.push({ reason: 'Duplicate record or would create redirect chain/loop', item });
					continue;
				}

				// 2) Potential loop/chain within this upload:
				if (seenPaths.has(redirectKey)) {
					skipped.push({
						reason: 'Duplicate record or would create redirect chain/loop',
						item,
					});
					continue;
				}

				// Mark as seen
				seenPaths.add(pathKey);

				// Query to check for duplicate or looping redirects already in the DB
				const dupQuery = {
					conditions: [
						{
							operator: 'or',
							conditions: [
								{ attribute: 'path', comparator: 'equals', value: item.path },
								{ attribute: 'path', comparator: 'equals', value: item.redirectURL },
							],
						},
						{ attribute: 'host', comparator: 'equals', value: item.host },
						{ attribute: 'version', comparator: 'equals', value: item.version },
					],
				};

				let hasDuplicates = false;
				for await (const _ of databases.redirects.Rule.search(dupQuery)) {
					hasDuplicates = true;
					skipped.push({ reason: 'Duplicate record or would create redirect chain/loop', item });
					break;
				}

				if (hasDuplicates) continue;

				const postObject = this.createPostObject(item);
				batch.push({ postObject });
				success++;

				const t2 = performance.now();
				server.recordAnalytics(t2 - t1, 'redirect-upload-process-timing', item.regex);

				if (batch.length >= batchSize) {
					await this.flushBatch(batch);
				}
			} catch (e) {
				skipped.push({ reason: e.message, item });
			}
		}

		if (batch.length > 0) {
			await this.flushBatch(batch);
		}

		return { success, skipped };
	}

	/**
	 * Validates a single redirect entry.
	 * Ensures required fields are present and version is an integer.
	 *
	 * @param {Object} item - The redirect object to validate.
	 * @param {Array<Object>} skipped - Collector array for skipped records.
	 * @returns {boolean} - True if valid, false otherwise.
	 */
	static validateRedirect(item, skipped) {
		if (!item.path) {
			skipped.push({ reason: 'missing path', item });
			return false;
		}
		if (!item.redirectURL) {
			skipped.push({ reason: 'missing redirectURL', item });
			return false;
		}
		if (item.version) {
			const parsed = parseInt(item.version);
			if (isNaN(parsed)) {
				skipped.push({ reason: 'version must be an integer', item });
				return false;
			}
			item.version = parsed;
		}
		return true;
	}

	/**
	 * Creates a normalized database-ready redirect rule object.
	 * Converts numeric and boolean fields into correct types.
	 *
	 * @param {Object} item - Redirect definition from CSV/JSON input.
	 * @returns {Object} - DB ready redirect object.
	 */
	static createPostObject(item) {
		let start = parseInt(item.utcStartTime);
		if (isNaN(start)) {
			start = undefined;
		}
		let end = parseInt(item.utcEndTime);
		if (isNaN(end)) {
			end = undefined;
		}
		let version = parseInt(item.version);
		if (isNaN(version)) {
			version = undefined;
		}

		let host = '';
		if (item.host && item.host.trim() !== '') {
			host = item.host.trim().toLowerCase();
		}

		let operations;
		if (item.operations && item.operations.trim() !== '') {
			operations = item.operations.trim().toLowerCase();
		}

		let statusCode = 301;
		if (item.statusCode && !isNaN(parseInt(item.statusCode, 10))) {
			statusCode = parseInt(item.statusCode, 10);
		}

		let regexPrefix;
		if (item.regex && !USE_STATIC_ONLY) {
			regexPrefix = getRegexPrefix(item.path);
		}

		return {
			utcStartTime: start,
			utcEndTime: end,
			path: item.path.trim().toLowerCase(),
			host,
			version,
			redirectURL: item.redirectURL.trim().toLowerCase(),
			operations,
			statusCode,
			regex: item.regex,
			regexPrefix,
		};
	}

	/**
	 * Flushes a batch of redirect rules to the database.
	 * @param {Array<Object>} batch - The batch of redirect rules to flush.
	 * @returns {Promise<void>}
	 */
	static async flushBatch(batch) {
		if (batch.length === 0) return;

		const t1 = performance.now();
		const posts = batch.map(({ postObject }) => databases.redirects.Rule.post(postObject));

		await Promise.allSettled(posts);
		const t2 = performance.now();

		logger.info(`Flushed batch of ${batch.length} in ${(t2 - t1).toFixed(3)}ms`);
		batch.length = 0;
		return;
	}
}
