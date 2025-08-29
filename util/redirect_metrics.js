const { hdb_analytics } = databases.system;

/**
 * Class for the /redirectmetrics endpoint custom functionality.
 *
 * Responsibilities:
 * - Query the analytics store for recent "redirect" metric events.
 * - Restrict results to a short rolling time window (last 90 seconds).
 */
export class RedirectMetrics extends Resource {
	/**
	 * Retrieves redirect metrics form the last 90 seconds.
	 * @returns {Promise<Array<Object>>} - An array of metric objects matching the query.
	 */
	async get() {
		logger.info('Retrieving redirect metrics from the last 90 seconds');

		// Compute rolling time window: [now - 90s, now]
		const now = Date.now();
		const windowMs = 90 * 1000;
		const range = [now - windowMs, now];

		return await hdb_analytics.search({
			conditions: [
				{ attribute: 'metric', value: 'redirect', comparator: 'equals' },
				{ attribute: 'id', value: range, comparator: 'between' },
			],
		});
	}
}
