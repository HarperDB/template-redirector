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
	 * @param {object} target - Target identifier
	 * @param {Promise<object>} data - Version object to create
	 * @param {object} context - Request context
	 * @returns {object} - Response object with status and data
	 */
	static async post(target, data, context) {
		const body = await data;
		if (typeof body.activeVersion !== 'number' || body.activeVersion < 0) {
			return {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
				data: { message: 'Invalid activeVersion value, must be a non-negative number.' },
			};
		}

		return super.post(target, body, context);
	}

	/**
	 * Validates and updates an existing version entry.
	 * @param {object} target - Target identifier
	 * @param {Promise<object>} data - Version object to update
	 * @param {object} context - Request context
	 * @returns {object} - Response object with status and data
	 */
	static async put(target, data, context) {
		const body = await data;
		if (typeof body.activeVersion !== 'number' || body.activeVersion < 0) {
			return {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
				data: { message: 'Invalid activeVersion value, must be a non-negative number.' },
			};
		}

		return super.put(target, body, context);
	}

	/**
	 * Validates and updates an existing version entry.
	 * @param {object} target - Target identifier
	 * @param {Promise<object>} data - Version object to update
	 * @param {object} context - Request context
	 * @returns {object} - Response object with status and data
	 */
	static async patch(target, data, context) {
		const body = await data;
		if (typeof body.activeVersion !== 'number' || body.activeVersion < 0) {
			return {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
				data: { message: 'Invalid activeVersion value, must be a non-negative number.' },
			};
		}

		return super.patch(target, body, context);
	}
}
