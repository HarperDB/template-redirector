import Papa from 'papaparse';
import { allowedUserRoles } from '../utils/constants.js';
import { parseURLPath } from '../utils/parse.js';
import { getCurrentVersion } from './get_current_config.js';

/**
 * Class representing the redirect functionality.
 * Handles importing and processing of redirect rules from CSV data.
 */
export class Redirect extends databases.redirects.rule {
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
	 * Processes the incoming CSV data and creates redirect rules.
	 * @param {Object} data - The request data containing CSV or JSON content.
	 * @returns {Object} A summary of the import process.
	 */
	async post(data) {
		var json;

		if (data.contentType == 'text/csv') {
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
	 * Processes an array of redirect objects.
	 * @param {Array} redirects - An array of redirect objects from the CSV.
	 * @returns {Object} The results of the processing, including success count and skipped items.
	 */
	async processRedirects(redirects) {
		let success = 0;
		const skipped = [];

		const defaultVersion = await getCurrentVersion();

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

		return { success, skipped };
	}

	/**
	 * Validates a single redirect object.
	 * @param {Object} item - The redirect object to validate.
	 * @param {Array} skipped - An array to store skipped items.
	 * @returns {boolean} True if the redirect is valid, false otherwise.
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
	 * Creates a post object for the redirect rule.
	 * @param {Object} item - The redirect item from the CSV.
	 * @returns {Object} An object formatted for posting to the database.
	 */
	createPostObject(item) {
		var start = parseInt(item.utcStartTime);
		if (isNaN(start)) {
			start = undefined;
		}
		var end = parseInt(item.utcEndTime);
		if (isNaN(end)) {
			end = undefined;
		}
		var version = parseInt(item.version);
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
			regex: item.isRegex == 1 ? true : false,
		};
	}
}
