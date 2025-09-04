/**
 * Builds search conditions for a given path, host, and version.
 *
 * @param {Object} searchObj - Search criteria.
 * @param {string} searchObj.path - The path to search for.
 * @param {string} searchObj.host - The host to search for.
 * @param {number} searchObj.version - The version to search for.
 * @param {boolean} searchObj.hostOnly - Whether to only match the host.
 * @param {boolean} searchObj.si - Whether to ignore trailing slashes.
 * @param {string} searchObj.qs - Whether to include query strings.
 * @param {string} searchObj.qString - The query string value.
 * @returns {{}} - The constructed search conditions.
 */
export const buildSearchConditions = (searchObj) => {
	const { path, host, version, hostOnly, si, qs, qString, isRegexSearch } = searchObj;

	// Version is either default or active and must match
	const versionConditions = [{ attribute: 'version', comparator: 'equals', value: version }];

	// Always try to match on host
	const hostConditions = [{ attribute: 'host', comparator: 'equals', value: host }];
	if (!hostOnly) {
		// Match on empty host if not hostOnly
		hostConditions.push({ attribute: 'host', comparator: 'equals', value: '' });
	}

	if (!isRegexSearch) {
		const pathNoSlash = path.endsWith('/') ? path.slice(0, path.length - 1) : path;
		const pathWithSlash = path.endsWith('/') ? path : path + '/';

		const pathConditions = [{ attribute: 'path', comparator: 'equals', value: pathNoSlash }];
		// If si is false (default), add the pathWithSlash
		if (!si) {
			pathConditions.push({ attribute: 'path', comparator: 'equals', value: pathWithSlash });
		}

		// If qs is not 'i' for ignore, add query string (default tries to match)
		if (qs !== 'i' && qString !== '') {
			pathConditions.push({
				attribute: 'path',
				comparator: 'equals',
				value: pathNoSlash + qString,
			});
			if (!si) {
				pathConditions.push({
					attribute: 'path',
					comparator: 'equals',
					value: pathWithSlash + qString,
				});
			}
		}

		const allConditions = [
			{
				operator: 'and',
				conditions: [
					...versionConditions,
					{
						operator: 'or',
						conditions: hostConditions,
					},
					{
						operator: 'or',
						conditions: pathConditions,
					},
				],
			},
		];
		return allConditions;
	} else {
		// For regex searches, match on regex boolean vs path
		const regexConditions = [{ attribute: 'regex', comparator: 'equals', value: true }];

		const allConditions = [
			{
				operator: 'and',
				conditions: [
					...versionConditions,
					{
						operator: 'or',
						conditions: hostConditions,
					},
					...regexConditions,
				],
			},
		];
		return allConditions;
	}
};
