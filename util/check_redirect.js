import querystring from 'node:querystring';
import { parseOperations, parseParams, parseQuery } from './parse.js';
import { allowedUserRoles } from './constants.js';

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
		logger.info(`Checking read access for user: ${user?.role?.id}`);
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
		logger.info('Checking redirect for query:', query);
		const context = this.getContext();
		const queryPath = this.getId();
		let [host, path, qString] = parseQuery(queryPath, query, context);

		if (path === '') {
			// Return if no path provided to find redirect
			return null;
		}

		// Parameter configuration for parsing query options
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
		const version = params.v || (await this.getCurrentVersion());
		const t = params.t;
		const si = params.si; // ignore trailing slash, defaults to false
		host = params.h || host;

		// Host-only behavior: use param, fallback to host settings
		let hostOnly = params.ho; // match for exact host, defaults to false
		if (hostOnly === null) {
			hostOnly = (await this.getHostData(host)) || 0;
		}

		// Perform rule lookup
		const searchResult = await this.searchRedirect(
			path,
			host,
			version,
			hostOnly,
			t,
			si,
			qs,
			qString
		);

		if (searchResult) {
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

					// Parse the query string from the Path (skip the '?')
					const q = querystring.parse(qString.slice(1));

					// Remove the desired arguments
					for (const arg of filterArgs) {
						delete q[arg];
					}

					// Rebuild query string if anything remains
					const newqs = querystring.stringify(q);
					if (newqs.length > 0) {
						finalRedirect += '?' + newqs;
					}
				}
			}

			// Record analytics on successful redirect
			if (searchResult) {
				server.recordAnalytics(true, 'redirect', path, 'GET', finalRedirect);
			}

			return { ...searchResult, redirectURL: finalRedirect };
		} else {
			return null;
		}
	}

	/**
	 * Gets the current active redirect version from DB.
	 * Falls back to DEFAULT_VERSION if none found.
	 * @returns {Promise<number>} - The active version number.
	 */
	async getCurrentVersion() {
		const conditions = [{ attribute: 'activeVersion', value: 0, comparator: 'greater_than' }];

		const searchResult = await databases.redirects.version.search(conditions);

		const result = [];
		for await (const record of searchResult) {
			result.push(record);
		}

		return result.length === 0 ? this.constructor.DEFAULT_VERSION : result[0].activeVersion;
	}

	/**
	 * Searches for a redirect rule matching the given parameters.
	 * Supports:
	 * - Exact matches with/without trailing slash
	 * - Query string inclusion/exclusion
	 *
	 * @param {string} path - URL path to check.
	 * @param {string} host - Request host.
	 * @param {number} version - Redirect version (default is 0).
	 * @param {boolean} hostOnly - Whether to match only exact host (default is false).
	 * @param {number|null} t - Override timestamp for validity check.
	 * @param {boolean} ignoreSlash - Whether to ignore trailing slash differences (default is false).
	 * @param {string} qs - Query string mode ("i" = ignore, "m" = match, default = match).
	 * @param {string} qString - Raw query string from request.
	 * @returns {Promise<Object|null>} - The matched redirect rule, or null.
	 */
	async searchRedirect(path, host, version, hostOnly, t, ignoreSlash, qs, qString) {
		const pathNoSlash = path.endsWith('/') ? path.slice(0, path.length - 1) : path;
		const pathWithSlash = path.endsWith('/') ? path : path + '/';

		let conditionsArray = [{ attribute: 'path', comparator: 'equals', value: pathNoSlash }];
		// If ignoreSlash is false, add the pathWithSlash condition (defaults to false)
		if (!ignoreSlash) {
			conditionsArray.push({ attribute: 'path', comparator: 'equals', value: pathWithSlash });
		}

		// If query string is not 'i' for ignore, add query string as search condition (default includes)
		if (qs !== 'i') {
			conditionsArray.push({
				attribute: 'path',
				comparator: 'equals',
				value: pathNoSlash + qString,
			});
			if (!ignoreSlash) {
				conditionsArray.push({
					attribute: 'path',
					comparator: 'equals',
					value: pathWithSlash + qString,
				});
			}
		}

		// Search DB for matching rules
		const searchResult = await databases.redirects.rule.search({
			conditions:
				conditionsArray.length === 1
					? conditionsArray
					: [
							{
								operator: 'or',
								conditions: conditionsArray,
							},
					  ],
		});

		const results = await Array.fromAsync(searchResult);

		// Apply filters: version, host, time validity
		const filtered = this.filterSearchResults(results, version, host, hostOnly, t);

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

		// If no direct match found, check for regex matches
		{
			const conditions = [{ attribute: 'regex', comparator: 'equals', value: true }];
			const regexSearchResult = await databases.redirects.rule.search(conditions);
			const regexes = await Array.fromAsync(regexSearchResult);

			let regexMatches = [];
			for (const regexRecord of regexes) {
				const re = new RegExp(regexRecord.path);

				if (path.match(re)) {
					if (this.isRedirectValid(regexRecord, t)) {
						const newPath = path.replace(re, regexRecord.redirectURL);
						const match = {
							...regexRecord,
							redirectURL: newPath,
							match: path.match(re),
						};
						regexMatches.push(match);
					}
				}
			}

			if (regexMatches.length === 1) {
				delete regexMatches[0].match;
				return regexMatches[0];
			} else if (regexMatches.length > 1) {
				const best = regexMatches.reduce((a, b) =>
					a.match[0].length >= b.match[0].length ? a : b
				);
				if (best) {
					delete best.match;
					return best;
				}
			}
		}

		return null;
	}

	/**
	 * Checks whether a redirect rule is currently valid.
	 * Valid if:
	 * - `utcStartTime` is missing or now >= start.
	 * - `utcEndTime` is missing or now <= end.
	 *
	 * @param {Object} redirect - Redirect record.
	 * @param {number|null} t - Optional timestamp override.
	 * @returns {boolean} - True if valid, false otherwise.
	 */
	isRedirectValid(redirect, t) {
		const now = t || Math.floor(Date.now() / 1000);

		return (
			(!redirect.utcStartTime || now >= redirect.utcStartTime) &&
			(!redirect.utcEndTime || now <= redirect.utcEndTime)
		);
	}

	/**
	 * Retrieves host configuration for `hostOnly` mode.
	 * Falls back to DEFAULT_HOST_ONLY if no record found.
	 *
	 * @param {string} host - Hostname to check.
	 * @returns {Promise<boolean>} - True if host-only mode is enabled for host.
	 */
	async getHostData(host) {
		const conditions = [{ attribute: 'host', value: host }];

		const searchResult = await databases.redirects.hosts.search(conditions);

		const result = [];
		for await (const record of searchResult) {
			result.push(record);
		}

		return result.length === 0 ? this.constructor.DEFAULT_HOST_ONLY : result[0].hostOnly;
	}

	/**
	 * Filters redirect search results based on defined criteria.
	 * @param {Array<Object>} results - The search results to filter.
	 * @param {number} version - The version to match.
	 * @param {string} host - The host to match.
	 * @param {boolean} hostOnly - Whether to restrict to host-only matches.
	 * @param {number|null} t - The timestamp to use for validity checks.
	 * @returns {Array<Object>} - The filtered search results.
	 */
	filterSearchResults(results, version, host, hostOnly, t) {
		let match = false;
		const filtered = results
			.filter((row) => row.version === version) // filter out incorrect versions
			.filter((row) => !(hostOnly && row.host !== host)) // filter out hostOnly and host does not match
			.filter((row) => !(row.host?.length > 0 && host?.length === 0)) // filter out rows with hosts and no host passed in
			.filter((row) => this.isRedirectValid(row, t)) // filter out rows that don't match the time constraints
			.filter((row) => {
				if (row.host !== host && row.host.length === 0) {
					// Return rows that don't match the host but the row host is not set
					return true;
				}
				if (row.host === host) {
					// Return rows that match the host and record the match
					match = true;
					return true;
				}
			})
			.filter((row) => {
				if (match && row.host === host) {
					// Return rows that match the host where there was a match recorded above
					return true;
				}

				return !match; // If not match set above, return true
			});

		return filtered;
	}
}
