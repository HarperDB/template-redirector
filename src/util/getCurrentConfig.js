import CheckRedirect from '../resources/CheckRedirect.js';

/**
 * Retrieves the current active redirect version for the provided hostname.
 * Falls back to the default version if none exist.
 *
 * @param {string|null} hostname - Hostname to check for exact version match.
 * @returns {Promise<number>} - The current active version number.
 */
export const getCurrentVersion = async (hostname = null) => {
	const searchResult = await databases.redirects.Version.search({});

	let version = CheckRedirect.DEFAULT_VERSION;
	if (!searchResult) {
		return version;
	}

	const host = hostname && hostname !== '' ? hostname.trim().toLowerCase() : '';
	for await (const record of searchResult) {
		// Only consider valid versions
		if (typeof record.activeVersion !== 'number' || record.activeVersion < 0) continue;

		if (record.hostname) {
			if (record.hostname !== host) continue;
			version = record.activeVersion;
			break; // Exact hostname match found, use this version
		} else {
			// Use as default but continue searching for a specific hostname match
			version = record.activeVersion;
		}
	}

	return version;
};

/**
 * Retrieves host configuration for `hostOnly` mode.
 * Falls back to DEFAULT_HOST_ONLY if no record found.
 *
 * @param {string} host - Hostname to check.
 * @returns {Promise<boolean>} - True if host-only mode is enabled for host.
 */
export const getHostData = async (host) => {
	const result = await databases.redirects.Hosts.get(host);

	if (!result) {
		return CheckRedirect.DEFAULT_HOST_ONLY;
	}

	return result.hostOnly;
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
		(!redirect.utcStartTime || now >= redirect.utcStartTime) && (!redirect.utcEndTime || now <= redirect.utcEndTime)
	);
};
