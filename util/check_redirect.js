import querystring from 'node:querystring';
import { parseOperations, parseParams } from './parse.js';
import { allowedUserRoles } from '../utils/constants.js';
import { getCurrentVersion, getHostData } from './get_current_config.js';

/**
 * Class representing the checkredirect functionality.
 * Handles checking if a given URL has a redirect rule.
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

	static parsePath(path, context, query) {
		return query.get('path') ?? context?.headers?.get('path');
	}

	/**
	 * Checks if a given URL has a redirect rule.
	 * @returns {Object|null} The redirect rule if found, null otherwise.
	 */
	async get(query) {
		const context = this.getContext();

		/* Query string parameters take priority */
		var path = this.getId();

		// Log the path if the httplog extension is in use
		context.httplog?.addCustomField(path);

		var [host, path, qstring] = parseURLPath(path);

		const paramsConfig = {
			qs: { type: 'String', default: '' },
			v: { type: 'Int', default: null },
			h: { type: 'String', default: '' },
			ho: { type: 'Bool', default: null },
			t: { type: 'Int', default: null },
			si: { type: 'Bool', default: false },
		};

		const params = parseParams(query, paramsConfig);
		const qs = params.qs;
		const version = params.v || (await getCurrentVersion());
		const t = params.t;
		host = params.h || host;
		var hostOnly = params.ho;
		if (hostOnly == null) {
			hostOnly = (await getHostData(host)) || 0;
		}

		if (qs == 'm') {
			path += qstring;
		}

		const searchResult = await this.searchRedirect(path, host, version, hostOnly, t, params.si);

		if (searchResult) {
			var ops = {};

			var finalRedirect = searchResult.redirectURL;

			if (searchResult.operations?.length > 0) {
				ops = parseOperations(searchResult.operations);
			}

			if (ops.hasOwnProperty('qs')) {
				const hasPreserve = ops.qs.hasOwnProperty('preserve');

				const preserve = ops.qs?.preserve == 1 ? true : false;

				if (hasPreserve && ops.qs.preserve == 1) {
					finalRedirect += qstring;
				} else if (hasPreserve && ops.qs.preserve == 0) {
					// NOOP
				} else if (ops.qs?.filter != undefined) {
					// grap the operation filter args as an array
					const filterArgs = Array.isArray(ops.qs.filter) ? ops.qs.filter : [ops.qs.filter];

					// Parse the query string from the Path (skip the '?')
					const q = querystring.parse(qstring.slice(1));

					// Remove the desired arguments
					for (const arg of filterArgs) {
						delete q[arg];
					}

					const newqs = querystring.stringify(q);

					if (newqs.length > 0) {
						finalRedirect += '?' + newqs;
					}
				}
			}

			if (searchResult) {
				server.recordAnalytics(true, 'redirect', path, redirect.redirectURL);
			}

			return { ...searchResult, redirectURL: finalRedirect };
		} else {
			return null;
		}
	}

	/**
	 * Searches for a redirect rule matching the given URL.
	 * @param {string} path - The URL to match against.
	 * @returns {Object|null} The matching redirect rule if found, null otherwise.
	 */
	async searchRedirect(path, host, version, hostOnly, t, ignoreSlash) {
		const path2 = path.endsWith('/') ? path.slice(0, path.length - 1) : path + '/';

		// Get ALL of the redirects that match the path as well as the path variant with
		// or without a slash
		const ignoreSlashConditions = [
			{
				operator: 'or',
				conditions: [
					{ attribute: 'path', comparator: 'equals', value: path },
					{ attribute: 'path', comparator: 'equals', value: path2 },
				],
			},
		];

		const defaultConditions = [{ attribute: 'path', comparator: 'equals', value: path }];

		const searchResult = await databases.redirects.rule.search({
			conditions: ignoreSlash ? ignoreSlashConditions : defaultConditions,
		});

		const results = await Array.fromAsync(searchResult);

		let match = false;

		// Filter out
		const filtered = results
			.filter((row) => row.version == version) // filter out incorrect versions
			.filter((row) => !(hostOnly && row.host != host)) // filter out hostOnly and host does not match
			.filter((row) => !(row.host?.length > 0 && host?.length == 0)) // filter out rows with hosts and no host passed in
			.filter((row) => this.isRedirectValid(row, t)) // filter out rows that do not match the right time
			.filter((row) => {
				if (row.host !== host && row.host.length == 0) {
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

		if (filtered.length == 1) {
			return filtered[0];
		}
		if (filtered.length == 2) {
			const row = filtered.filter((row) => row.path === path);
			if (row) {
				return row[0];
			}
		}

		{
			const conditions = [{ attribute: 'regex', comparator: 'equals', value: true }];
			const regexSearchResult = await databases.redirects.rule.search(conditions);
			const regexes = await Array.fromAsync(regexSearchResult);

			for (const regexRecord of regexes) {
				const re = new RegExp(regexRecord.path);

				if (path.match(re)) {
					if (this.isRedirectValid(regexRecord, t)) {
						const newPath = path.replace(re, regexRecord.redirectURL);
						return {
							...regexRecord,
							redirectURL: newPath,
						};
					}
				}
			}
		}

		return null;
	}

	/**
	 * Checks if a redirect rule is currently valid based on its time constraints.
	 * @param {Object} redirect - The redirect rule to check.
	 * @returns {boolean} True if the redirect is valid, false otherwise.
	 */
	isRedirectValid(redirect, t) {
		const now = t || Math.floor(Date.now() / 1000);

		return (
			(!redirect.utcStartTime || now >= redirect.utcStartTime) &&
			(!redirect.utcEndTime || now <= redirect.utcEndTime)
		);
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
