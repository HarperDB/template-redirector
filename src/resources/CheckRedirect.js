import { performance } from 'node:perf_hooks';
import querystring from 'node:querystring';
import { parseOperations, parseParams, parseQuery } from '../util/parse.js';
import { allowedUserRoles, USE_STATIC_ONLY } from '../util/constants.js';
import { getCurrentVersion, getHostData, isRedirectValid } from '../util/getCurrentConfig.js';
import { buildSearchConditions } from '../util/searchConditions.js';
import { getRegexPrefix, processRegexBatch } from '../util/regexHelpers.js';

/**
 * Class for the /checkredirect endpoint custom functionality.
 *
 * Responsibilities:
 * - Authorize read access based on user role.
 * - Parse request context (path, host, query string).
 * - Look up redirect rules by path, host, version, and query string.
 * - Support filtering by time, host-only mode, and query string behavior.
 * - Apply redirect operations (e.g., preserving or filtering query params).
 *
 * OPTIONS:
 *  - USE_STATIC_ONLY: If true, only static paths are searched (no regex).
 */
export default class CheckRedirect extends databases.redirects.Rule {
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
	 * @param {Object} target - Target identifier (path or object with id).
	 * @param {Object} context - Request context.
	 * @returns {Promise<Object|null>} - Redirect rule with final URL, or null if not found.
	 */
	static async get(target, context) {
		const t1 = performance.now();
		const queryPath = typeof target === 'string' ? target : target?.id;
		let [host, path, qString] = parseQuery(queryPath, target, context);
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
		const params = parseParams(target, paramsConfig);
		const qs = params.qs; // 'i' ignore or defaults to match ('m')
		const version = params.v || (await getCurrentVersion(host));
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
		let usedRegexSearch = false;
		const searchOptions = {
			path: path.trim().toLowerCase(),
			host: host !== '' ? host.trim().toLowerCase() : '',
			version,
			hostOnly,
			t,
			si,
			qs,
			qString: qString !== '' ? qString.trim().toLowerCase() : '',
		};

		searchResult = await this.searchStaticRedirect(searchOptions);
		if (!searchResult && !USE_STATIC_ONLY) {
			usedRegexSearch = true;
			searchResult = await this.searchRegexRedirect(searchOptions);
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
			if (Object.hasOwn(ops, 'qs') && qString.length > 0) {
				const hasPreserve = Object.hasOwn(ops.qs, 'preserve');
				const hasFilter = Object.hasOwn(ops.qs, 'filter');
				const preserve = parseInt(ops.qs?.preserve, 10) === 1;

				if (hasPreserve && preserve) {
					// Append full query string
					finalRedirect += qString;
				} else if (hasPreserve && !preserve) {
					// Ignore query string (NOOP)
				} else if (hasFilter) {
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
	static async searchStaticRedirect(searchObj) {
		// Build search conditions
		const { path, host, t, si, qs, qString } = searchObj;
		const conditions = buildSearchConditions({
			...searchObj,
			isRegexSearch: false,
			regexPrefix: '',
		});

		// Search DB for matching rules
		const searchResults = await databases.redirects.Rule.search({
			conditions: conditions,
		});
		const results = await Array.fromAsync(searchResults);

		// Apply filters for time validity
		const filtered = results.filter((row) => isRedirectValid(row, t));

		if (filtered.length === 0) return null;

		// Prefer exact host matches, fall back to empty host matches
		const exactHostMatches = filtered.filter((row) => row.host === host);
		const emptyHostMatches = filtered.filter((row) => !row.host);

		// Find best match within a candidate set based on path/query string
		const findBestMatch = (candidates) => {
			if (candidates.length === 0) return null;
			if (candidates.length === 1) return candidates[0];

			const altPath = path.endsWith('/') ? path.slice(0, path.length - 1) : path + '/';
			const paths = [path];
			if (si) paths.push(altPath);

			// Try to find exact match based on query string behavior
			// Check alternative paths if slash-insensitive
			for (const p of paths) {
				if (qs === 'i') {
					// Select row with path matching (ignore query string)
					const row = candidates.filter((row) => row.path === p);
					if (row.length > 0) return row[0];
				} else {
					// Select row with path and query string matching
					const row = candidates.filter((row) => row.path === p + qString);
					if (row.length > 0) return row[0];
				}
			}
			return null;
		};

		return findBestMatch(exactHostMatches) ?? findBestMatch(emptyHostMatches);
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
	static async searchRegexRedirect(searchObj) {
		const BATCH_SIZE = 100;

		// Build search conditions
		const { path, t } = searchObj;
		const regexPrefix = getRegexPrefix(path);
		const conditions = buildSearchConditions({ ...searchObj, isRegexSearch: true, regexPrefix });

		// Search DB for matching rules
		const searchResults = await databases.redirects.Rule.search({
			conditions: conditions,
		});

		let regexMatches = [];
		let batch = [];
		for await (const regexRecord of searchResults) {
			if (!isRedirectValid(regexRecord, t)) {
				continue;
			}

			batch.push(regexRecord);
			if (batch.length >= BATCH_SIZE) {
				const { matches, perfectMatch } = await processRegexBatch(batch, path);
				if (perfectMatch) {
					delete perfectMatch.match;
					return perfectMatch;
				}

				regexMatches.push(...matches);
				batch = [];
			}
		}

		if (batch.length > 0) {
			const { matches, perfectMatch } = await processRegexBatch(batch, path);
			if (perfectMatch) {
				delete perfectMatch.match;
				return perfectMatch;
			}

			regexMatches.push(...matches);
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
