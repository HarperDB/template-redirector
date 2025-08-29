import Papa from 'papaparse';
import { parseURLPath } from './parse.js';
import { CheckRedirect } from './check_redirect.js';
import { allowedUserRoles } from './constants.js';

/**
 * Class for the /redirect endpoint custom functionality.
 *
 * Handles importing, validating, and persisting redirect rules from
 * CSV or JSON input. Also ensures de-duplication and versioning.
 */
export class Redirect extends databases.redirects.rule {
	/**
	 * Checks whether a user is allowed to read redirect rules.
	 * @param {Object} user - The user object containing role information.
	 * @returns {boolean} - True if the user has a permitted role, false otherwise.
	 */
	allowRead(user) {
		logger.info(`Checking read access for user: ${user?.role?.id}`);
		return allowedUserRoles.includes(user?.role?.id);
	}

	/**
	 * Imports redirect rules from CSV or JSON input.
	 * - CSV input is parsed via Papa Parse.
	 * - JSON input is assumed to already contain redirect objects.
	 *
	 * @param {Object} data - Request data containing contentType and raw data (see data/example.json for format).
	 * @returns {Promise<Object>} - Summary of import with success message and skipped items.
	 */
	async post(data) {
		let json;
		if (data.contentType === 'text/csv') {
			json = Papa.parse(data.data, {
				header: true,
				skipEmptyLines: true,
			});
		} else {
			json = data;
		}

		const results = await this.processRedirects(json.data);

		return {
			message: `Successfully loaded ${results.success} redirects.`,
			skipped: results.skipped,
		};
	}

	/**
	 * Validates, normalizes, and persists an array of redirect objects.
	 * Skips duplicates or invalid entries.
	 *
	 * @param {Array<Object>} redirects - Redirect rules from CSV or JSON.
	 * @returns {Promise<Object>} - Processing results (success count and skipped list).
	 */
	async processRedirects(redirects) {
		logger.info(`Processing ${redirects.length} redirects`);
		let success = 0;
		const skipped = [];

		// Default version comes from active DB version
		const defaultVersion = await this.getCurrentVersion();

		for (const item of redirects) {
			if (!this.validateRedirect(item, skipped)) continue;

			const [host, path, querystring] = parseURLPath(item.path);

			item.host = host || item.host;
			item.path = path + querystring;
			item.version = typeof item.version === 'number' ? item.version : defaultVersion;

			const query = {
				conditions: [
					{ attribute: 'path', value: item.path },
					{ attribute: 'host', value: item.host },
					{ attribute: 'version', value: item.version },
				],
			};

			const result = [];
			for await (const record of databases.redirects.rule.search(query)) {
				result.push(record);
			}

			if (result.length != 0) {
				skipped.push({ reason: 'Duplicate record', item });
			} else {
				const postObject = this.createPostObject(item);

				try {
					await databases.redirects.rule.post(postObject);
					success++;
				} catch (e) {
					skipped.push({ reason: e.message, item });
				}
			}
		}

		logger.info(`Successfully processed ${success} and skipped ${skipped.length} redirects`);
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
	validateRedirect(item, skipped) {
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
	createPostObject(item) {
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

		return {
			utcStartTime: start,
			utcEndTime: end,
			path: item.path,
			host: item.host,
			version: version,
			redirectURL: item.redirectURL,
			operations: item.operations,
			statusCode: item.statusCode ? Number(item.statusCode) : 301,
			regex: item.regex ? Number(item.regex) === 1 : false,
		};
	}

	/**
	 * Retrieves the current active redirect version.
	 * Falls back to the default version if none exist.
	 *
	 * @returns {Promise<number>} - The current active version number.
	 */
	async getCurrentVersion() {
		const conditions = [{ attribute: 'activeVersion', value: 0, comparator: 'greater_than' }];

		const searchResult = await databases.redirects.version.search(conditions);

		const result = [];
		for await (const record of searchResult) {
			result.push(record);
		}

		return result.length === 0 ? CheckRedirect.DEFAULT_VERSION : result[0].activeVersion;
	}
}
