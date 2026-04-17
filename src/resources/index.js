import Redirect from './Redirect.js';
import CheckRedirect from './CheckRedirect.js';
import RedirectMetrics from './RedirectMetrics.js';

export const redirect = Redirect;
export const checkredirect = CheckRedirect;
export const redirectmetrics = RedirectMetrics;

/**
 * Class for the /Version endpoint custom functionality.
 *
 * Handles validation to ensure only non-negative active versions
 * are created or updated.
 */
export class Version extends databases.redirects.Version {
	/**
	 * Validates and creates a new version entry.
	 * @param {object} data - Version object to create
	 * @returns {object} - Response object with status and data
	 */
	async post(data) {
		if (typeof data.activeVersion !== 'number' || data.activeVersion < 0) {
			return {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
				data: { message: 'Invalid activeVersion value, must be a non-negative number.' },
			};
		}

		return super.post(data);
	}

	/**
	 * Validates and updates an existing version entry.
	 * @param {object} data - Version object to update
	 * @param {object} query - Query parameters for the update
	 * @returns {object} - Response object with status and data
	 */
	async put(data, query) {
		if (typeof data.activeVersion !== 'number' || data.activeVersion < 0) {
			return {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
				data: { message: 'Invalid activeVersion value, must be a non-negative number.' },
			};
		}

		return super.put(data, query);
	}

	/**
	 * Validates and updates an existing version entry.
	 * @param {object} data - Version object to update
	 * @param {object} query - Query parameters for the update
	 * @returns {object} - Response object with status and data
	 */
	async patch(data, query) {
		if (typeof data.activeVersion !== 'number' || data.activeVersion < 0) {
			return {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
				data: { message: 'Invalid activeVersion value, must be a non-negative number.' },
			};
		}

		return super.patch(data, query);
	}
}
