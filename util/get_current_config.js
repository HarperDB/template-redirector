import { CheckRedirect } from '../resources/check_redirect.js';

/**
 * Retrieves the current active redirect version.
 * Falls back to the default version if none exist.
 *
 * @returns {Promise<number>} - The current active version number.
 */
export const getCurrentVersion = async () => {
	const conditions = [{ attribute: 'activeVersion', value: 0, comparator: 'greater_than' }];

	const searchResult = await databases.redirects.version.search(conditions);

	const result = [];
	for await (const record of searchResult) {
		result.push(record);
	}

	return result.length === 0 ? CheckRedirect.DEFAULT_VERSION : result[0].activeVersion;
};

/**
 * Retrieves host configuration for `hostOnly` mode.
 * Falls back to DEFAULT_HOST_ONLY if no record found.
 *
 * @param {string} host - Hostname to check.
 * @returns {Promise<boolean>} - True if host-only mode is enabled for host.
 */
export const getHostData = async (host) => {
	const conditions = [{ attribute: 'host', value: host }];

	const searchResult = await databases.redirects.hosts.search(conditions);

	const result = [];
	for await (const record of searchResult) {
		result.push(record);
	}

	return result.length === 0 ? this.constructor.DEFAULT_HOST_ONLY : result[0].hostOnly;
};

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
export const isRedirectValid = (redirect, t) => {
	const now = t || Math.floor(Date.now() / 1000);

	return (
		(!redirect.utcStartTime || now >= redirect.utcStartTime) &&
		(!redirect.utcEndTime || now <= redirect.utcEndTime)
	);
};
