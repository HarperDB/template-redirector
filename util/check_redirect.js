import { performance } from 'node:perf_hooks';
import querystring from 'node:querystring';
import { parseOperations, parseParams, parseQuery } from './parse.js';
import { allowedUserRoles } from '../utils/constants.js';
import { getCurrentVersion, getHostData, isRedirectValid } from './get_current_config.js';
import { buildSearchConditions } from './search_conditions.js';

/**
 * Class for the /checkredirect endpoint custom functionality.
 *
 * Responsibilities:
 * - Authorize read access based on user role.
 * - Parse request context (path, host, query string).
 * - Look up redirect rules by path, host, version, and query string.
 * - Support filtering by time, host-only mode, and query string behavior.
 * - Apply redirect operations (e.g., preserving or filtering query params).
 */
export class CheckRedirect extends databases.redirects.rule {
	static DEFAULT_VERSION = 0;
	static DEFAULT_HOST_ONLY = false;

	/**
	 * Checks if a given user can read redirect rules.
	 * @param {Object} user - The user object containing role information.
	 * @returns {boolean} - True if the user's role is allowed.
	 */
	allowRead(user) {
		return allowedUserRoles.includes(user?.role?.id);
	}

	/**
	 * Checks whether a given request path/host/version has a redirect rule.
	 * Applies query string operations (preserve, ignore, filter) if configured.
	 * Records analytics if a redirect is found.
	 *
	 * @param {Object} query - Request query parameters.
	 * @returns {Promise<Object|null>} - Redirect rule with final URL, or null if not found.
	 */
	async get(query) {
		const t1 = performance.now();
		const context = this.getContext();
		const queryPath = this.getId();
		let [host, path, qString] = parseQuery(queryPath, query, context);
		logger.info('Checking redirect for query:', { host, path, qString });

		if (path === '') {
			// Return if no path provided to find redirect
			return null;
		}

		const paramsConfig = {
			qs: { type: 'String', default: 'm' },
			v: { type: 'Int', default: null },
			h: { type: 'String', default: '' },
			ho: { type: 'Bool', default: null },
			t: { type: 'Int', default: null },
			si: { type: 'Bool', default: false },
		};

		// Parse params with defaults
		const params = parseParams(query, paramsConfig);
		const qs = params.qs; // 'i' ignore or defaults to match ('m')
		const version = params.v || (await getCurrentVersion());
		const t = params.t;
		const si = params.si; // ignore trailing slash, defaults to false
		host = params.h || host;

		// Host-only behavior: use param, fallback to host settings
		let hostOnly = params.ho; // match for exact host, defaults to false
		if (hostOnly === null) {
			hostOnly = (await getHostData(host)) || 0;
		}

		// Perform rule lookup
		const t2 = performance.now();
		let searchResult;
		const searchObj = { path, host, version, hostOnly, t, si, qs, qString };
		searchResult = await this.searchStaticRedirect(searchObj);
		if (!searchResult) {
			searchResult = await this.searchRegexRedirect(searchObj);
		}

		if (searchResult) {
			const t3 = performance.now();
			let ops = {};
			let finalRedirect = searchResult.redirectURL;

			// Parse redirect operations if configured
			if (searchResult.operations?.length > 0) {
				ops = parseOperations(searchResult.operations);
			}

			// Apply query string operations
			if (ops.hasOwnProperty('qs')) {
				const hasPreserve = ops.qs.hasOwnProperty('preserve');
				const preserve = parseInt(ops.qs?.preserve, 10) === 1;

				if (hasPreserve && preserve) {
					// Append full query string
					finalRedirect += qString;
				} else if (hasPreserve && !preserve) {
					// Ignore query string (NOOP)
				} else if (ops.qs?.filter != undefined) {
					// Filter specific query params
					const filterArgs = Array.isArray(ops.qs.filter) ? ops.qs.filter : [ops.qs.filter];

					// Parse the query string into an object (skip the '?')
					const q = querystring.parse(qString.slice(1));

					// Remove the desired arguments
					for (const arg of filterArgs) {
						delete q[arg];
					}

					// Rebuild query string if anything remains
					const newQs = querystring.stringify(q);
					if (newQs.length > 0) {
						finalRedirect += '?' + newQs;
					}
				}
			}

			const t4 = performance.now();
			server.recordAnalytics(t3 - t2, 'redirect-search-timing', usedRegexSearch);
			server.recordAnalytics(t4 - t1, 'redirect-timing', usedRegexSearch);
			server.recordAnalytics(true, 'redirect', path, 'GET', finalRedirect);

			return { ...searchResult, redirectURL: finalRedirect };
		} else {
			const t3 = performance.now();
			server.recordAnalytics(t3 - t2, 'redirect-search-timing', usedRegexSearch);
			server.recordAnalytics(t3 - t1, 'redirect-timing', usedRegexSearch);

			return null;
		}
	}

	/**
	 * Search for a static redirect rule that matches the given criteria.
	 *
	 * The criteria are passed as a single `searchObj`, which controls scope (host/version),
	 * path handling (slash-insensitive, host-only), and query-string behavior.
	 *
	 * @param {Object} searchObj - Search criteria.
	 * @param {string} searchObj.path - The path to search for.
	 * @param {string} searchObj.host - The host to search for.
	 * @param {number} searchObj.version - The version to search for.
	 * @param {boolean} searchObj.hostOnly - Whether to only match the host.
	 * @param {number} searchObj.t - Timestamp to check redirect validity.
	 * @param {boolean} searchObj.si - Whether to ignore trailing slashes.
	 * @param {string} searchObj.qs - Whether to include query strings.
	 * @param {string} searchObj.qString - The query string value.
	 * @returns {Promise<Object|null>} A single matched redirect rule or `null` if none.
	 */
	async searchStaticRedirect(searchObj) {
		// Build search conditions
		const { path, t, qs, qString } = searchObj;
		const conditions = buildSearchConditions({
			...searchObj,
			isRegexSearch: false,
		});

		// Search DB for matching rules
		const searchResults = await databases.redirects.rule.search({
			conditions: conditions,
		});
		const results = await Array.fromAsync(searchResults);

		// Apply filters for time validity
		const filtered = results.filter((row) => isRedirectValid(row, t));

		if (filtered.length === 1) {
			return filtered[0];
		}

		if (filtered.length > 1) {
			if (qs === 'i') {
				// Select row with path matching (ignore query string)
				const row = filtered.filter((row) => row.path === path);
				if (row) {
					return row[0];
				}
			} else {
				// Select row with path and query string matching
				const row = filtered.filter((row) => row.path === path + qString);
				if (row) {
					return row[0];
				}
			}
		}

		return null;
	}

	/**
	 * Search for a regex redirect rule that matches the given criteria.
	 *
	 * The criteria are passed as a single `searchObj`, which controls scope (host/version),
	 * path handling (slash-insensitive, host-only), and query-string behavior.
	 *
	 * @param {Object} searchObj - Search criteria.
	 * @param {string} searchObj.path - The path to search for.
	 * @param {string} searchObj.host - The host to search for.
	 * @param {number} searchObj.version - The version to search for.
	 * @param {boolean} searchObj.hostOnly - Whether to only match the host.
	 * @param {number} searchObj.t - Timestamp to check redirect validity.
	 * @param {boolean} searchObj.si - Whether to ignore trailing slashes.
	 * @param {string} searchObj.qs - Whether to include query strings.
	 * @param {string} searchObj.qString - The query string value.
	 * @returns {Promise<Object|null>} A single matched redirect rule or `null` if none.
	 */
	async searchRegexRedirect(searchObj) {
		// Build search conditions
		const { path, t } = searchObj;
		const conditions = buildSearchConditions({ ...searchObj, isRegexSearch: true });
		const searchResults = await databases.redirects.rule.search({
			conditions: conditions,
		});

		let regexMatches = [];
		for await (const regexRecord of searchResults) {
			if (!isRedirectValid(regexRecord, t)) {
				continue;
			}

			const re = new RegExp(regexRecord.path);
			if (!re) continue;

			const match = path.match(re);
			if (match) {
				const newPath = path.replace(re, regexRecord.redirectURL);
				regexMatches.push({ ...regexRecord, redirectURL: newPath, match });
			}
		}

		if (regexMatches.length === 1) {
			delete regexMatches[0].match;
			return regexMatches[0];
		}

		if (regexMatches.length > 1) {
			// Select row with the longest matched substring
			const best = regexMatches.reduce((a, b) => (a.match[0].length >= b.match[0].length ? a : b));
			if (best) {
				delete best.match;
				return best;
			}
		}

		return null;
	}
}
