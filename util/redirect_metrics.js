import { allowedUserRoles, USE_STATIC_ONLY } from '../util/constants.js';

// Harper system db for recording analytics
const { hdb_analytics } = databases.system;

/**
 * Class for the /redirectmetrics endpoint custom functionality.
 *
 * Responsibilities:
 * - Query the analytics store for recent "redirect" metric events.
 * - Restrict results to a short rolling time window (last 60 seconds).
 */
export class RedirectMetrics extends Resource {
	/**
	 * Checks whether a user is allowed to read redirect rules.
	 * @param {Object} user - The user object containing role information.
	 * @returns {boolean} - True if the user has a permitted role, false otherwise.
	 */
	allowRead(user) {
		return allowedUserRoles.includes(user?.role?.id);
	}

	/**
	 * Retrieves redirect metrics form the last 60 seconds.
	 * @returns {Promise<Array<Object>>} - An array of metric objects matching the query.
	 */
	async get(query) {
		logger.info(`Retrieving redirect metrics for ${query}`);

		// Compute rolling time window: [now - 60s, now]
		const now = Date.now();
		const windowMs = 60 * 1000;
		const range = [now - windowMs, now];

		if (!query || query.get('type') === 'redirect') {
			logger.info('Retrieving redirect metrics from the last 60 seconds');

			return await hdb_analytics.search({
				conditions: [
					{ attribute: 'metric', value: 'redirect', comparator: 'equals' },
					{ attribute: 'id', value: range[0], comparator: 'greater_than_equal' },
				],
			});
		}

		const timingType = query.get('type');
		logger.info(`Retrieving ${timingType} metrics for last 60 seconds`);
		const conditions = [{ attribute: 'id', value: range[0], comparator: 'greater_than_equal' }];

		if (timingType === 'redirect-search-timing') {
			conditions.push({
				attribute: 'metric',
				value: 'redirect-search-timing',
				comparator: 'equals',
			});
		} else if (timingType === 'redirect-timing') {
			conditions.push({ attribute: 'metric', value: 'redirect-timing', comparator: 'equals' });
		} else if (timingType === 'redirect-upload-timing') {
			conditions.push({
				attribute: 'metric',
				value: 'redirect-upload-timing',
				comparator: 'equals',
			});
		} else if (timingType === 'redirect-upload-process-timing') {
			conditions.push({
				attribute: 'metric',
				value: 'redirect-upload-process-timing',
				comparator: 'equals',
			});
		} else {
			return {
				message: 'Invalid redirect timing type',
			};
		}

		const staticResults = await hdb_analytics.search({
			conditions: [...conditions, { attribute: 'path', value: false, comparator: 'equals' }],
		});

		let staticTiming = {};
		for await (const result of staticResults) {
			staticTiming = {
				metric: timingType,
				period: range,
				unit: 'ms',
				avg: result.mean.toFixed(3) || 0,
				p50: result.median.toFixed(3) || 0,
				p90: result.p90.toFixed(3) || 0,
				p95: result.p95.toFixed(3) || 0,
			};
			break;
		}

		let regexTiming = {};
		if (!USE_STATIC_ONLY) {
			const regexResults = await hdb_analytics.search({
				conditions: [...conditions, { attribute: 'path', value: true, comparator: 'equals' }],
			});

			for await (const result of regexResults) {
				regexTiming = {
					metric: timingType,
					period: range,
					unit: 'ms',
					avg: result.mean.toFixed(3) || 0,
					p50: result.median.toFixed(3) || 0,
					p90: result.p90.toFixed(3) || 0,
					p95: result.p95.toFixed(3) || 0,
				};
				break;
			}
		}

		return {
			staticTiming: staticTiming,
			regexTiming: USE_STATIC_ONLY ? 'Static Only Mode, No Regex Timing Data' : regexTiming,
		};
	}
}
