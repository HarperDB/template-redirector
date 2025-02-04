import Papa from 'papaparse';
import { URL } from 'node:url';

const { hdb_analytics } = databases.system;

/**
 * Class representing the redirect functionality.
 * Handles importing and processing of redirect rules from CSV data.
 */
export class redirect extends databases.redirects.rule {
	/**
	 * Processes the incoming CSV data and creates redirect rules.
	 * @param {Object} data - The request data containing CSV content.
	 * @returns {Object} A summary of the import process.
	 */
	async post(data) {

    const json = Papa.parse(data.data, {
			header: true,
			skipEmptyLines: true
		});

		const results = await this.processRedirects(json.data);

		return {
			message: `Successfully loaded ${results.success} redirects.`,
			skipped: results.skipped
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

		for (const item of redirects) {

      
			if (!this.validateRedirect(item, skipped)) continue;

			item.redirectURL = this.stripDomain(item.redirectURL);

			const postObject = this.createPostObject(item);

			try {
				await databases.redirects.rule.post(postObject);
				success++;
			} catch (e) {
				skipped.push({ reason: e.message, item });
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
		return true;
	}

	/**
	 * Creates a post object for the redirect rule.
	 * @param {Object} item - The redirect item from the CSV.
	 * @returns {Object} An object formatted for posting to the database.
	 */
	createPostObject(item) {
		return {
			utcStartTime: item.utcStartTime ? item.utcStartTime * 1000 : undefined,
			utcEndTime: item.utcEndTime ? item.utcEndTime * 1000 : undefined,
			path: item.path,
			redirectURL: item.redirectURL,
			statusCode: item.statusCode ? Number(item.statusCode) : 301,
		};
	}

	/**
	 * Removes the domain from a URL, leaving only the path and query.
	 * @param {string} url - The full URL.
	 * @returns {string} The URL path and query without the domain.
	 */
	stripDomain(url) {
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return url;
		}
		const parsedUrl = new URL(url);
		return parsedUrl.pathname + parsedUrl.search;
	}
}

/**
 * Class representing the checkredirect functionality.
 * Handles checking if a given URL has a redirect rule.
 */
export class checkredirect extends Resource {
	/**
	 * Checks if a given URL has a redirect rule.
	 * @returns {Object|null} The redirect rule if found, null otherwise.
	 */
	async get(query) {
		const context = this.getContext();

    const path = this.stripDomain(
			query.get("path")
				? query.get("path")
				: (context?.headers?.get('path') ?? '')
		);

    const searchResult = await this.searchRedirect(path);

    
		if (searchResult) {
			await this.recordRedirect(searchResult, path);
		}

		return searchResult;
	}

	/**
	 * Searches for a redirect rule matching the given URL.
	 * @param {string} path - The URL to match against.
	 * @returns {Object|null} The matching redirect rule if found, null otherwise.
	 */
	async searchRedirect(path) {
		const conditions = [
			{ attribute: 'path', comparator: 'equals', value: path }
		];

		const searchResult = await databases.redirects.rule.search(conditions);

		for await (const r of searchResult) {
			if (this.isRedirectValid(r)) {
				return r;
			}
		}

		return null;
	}

	/**
	 * Checks if a redirect rule is currently valid based on its time constraints.
	 * @param {Object} redirect - The redirect rule to check.
	 * @returns {boolean} True if the redirect is valid, false otherwise.
	 */
	isRedirectValid(redirect) {
		const now = Date.now();
		return (!redirect.utcStartTime || now >= redirect.utcStartTime) &&
			(!redirect.utcEndTime || now <= redirect.utcEndTime);
	}

	/**
	 * Records analytics for a successful redirect and updates the last accessed time.
	 * @param {Object} redirect - The redirect rule that was matched.
	 * @param {string} path - The URL that was matched.
	 */
	async recordRedirect(redirect, path) {
		server.recordAnalytics(true, 'redirect', path, redirect.redirectURL);
		if (!redirect.lastAccessed || redirect.lastAccessed <= Date.now() - (30 * 1000)) {
			await databases.redirects.rule.patch({ id: redirect.id, lastAccessed: Date.now() });
		}
	}

	/**
	 * Removes the domain from a URL, leaving only the path and query.
	 * @param {string} url - The full URL.
	 * @returns {string} The URL path and query without the domain.
	 */
	stripDomain(url) {
		if (!url) return '';
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return url;
		}
		const parsedUrl = new URL(url);
		return parsedUrl.pathname + parsedUrl.search;
	}
}

/**
 * Class representing the redirectmetrics functionality.
 * Handles retrieval of redirect usage metrics.
 */
export class redirectmetrics extends Resource {
	/**
	 * Retrieves redirect metrics based on the provided query.
	 * @param {Object} query - The query parameters for filtering metrics.
	 * @returns {Array} An array of metric objects matching the query.
	 */
	async get(query) {
		const baseConditions = [
			{ attribute: 'metric', value: 'redirect', comparator: 'equals' },
			{ attribute: 'id', value: [Date.now() - (90 * 1000), Date.now()], comparator: 'between' }
		];

		if (query?.conditions) {
			query.conditions.push(baseConditions[0]);
			return hdb_analytics.search(query);
		} else {
			return hdb_analytics.search({ conditions: baseConditions });
		}
	}
}
