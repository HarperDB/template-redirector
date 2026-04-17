/**
 * Retrieves the path, host, and query string from the request.
 * @param {string} queryPath - ID portion of request URL.
 * @param {Object} query - The request query parameters.
 * @param {Object} context - The request context with headers.
 * @returns {Array<string>} - Array containing host, path, and query string.
 */
export const parseQuery = (queryPath, query, context) => {
	let host = '';
	let path = '';
	let queryString = '';
	const qsHeader = context?.headers?.get('x-query-string') ?? '';

	if (query.get('path')) {
		// If path param provided, try to parse like full url
		[host, path, queryString] = parseURLPath(query.get('path'));
	} else if (context?.headers?.get('path')) {
		// If path header provided, try to parse like full url
		[host, path, queryString] = parseURLPath(context.headers.get('path'));
	} else if (queryPath) {
		// Try parsing from queryPath
		[host, path, queryString] = parseURLPath(queryPath);
	}

	if (path !== '' && queryString === '') {
		// If path not empty but queryString is empty, check if path includes query string
		const split = path.split('?');
		path = split[0];
		queryString = split[1] || '';
	}

	if (host === '') {
		// If host is empty, get from header
		host = context?.headers?.get('host') ?? '';
	}

	if (qsHeader !== '') {
		// If query string header is set, use it instead
		queryString = qsHeader;
	}

	if (queryString !== '' && !queryString.startsWith('?')) {
		// Ensure query string starts with '?'
		queryString = '?' + queryString;
	}

	return [host, path, queryString];
};

/**
 * Parses query parameters against a provided configuration.
 *
 * - Applies default values if a parameter is missing.
 * - Converts boolean-like values (`1` → true, otherwise false) when `type` is `"Bool"`.
 *
 * @param {URLSearchParams} query - Parsed query string parameters.
 * @param {Object<string, { type: string, default: any }>} config - Config map with type and default values.
 * @returns {Object<string, any>} - Normalized parameter object.
 */
export const parseParams = (query, config) => {
	const params = {};

	for (const [key, value] of Object.entries(config)) {
		if (query.get(key) !== undefined) {
			// Convert booleans explicitly, otherwise use raw value
			if (value.type === 'Bool') {
				params[key] = parseInt(query.get(key), 10) === 1 ? true : false;
			} else {
				params[key] = query.get(key);
			}
		} else {
			// Apply default from config when missing
			params[key] = value.default;
		}
	}

	return params;
};

/**
 * Parses an encoded operations string into a structured object.
 *
 * Input format:
 *   - Multiple operations separated by `|`
 *   - Each operation formatted as `name:key=value&key=value`
 *   - Repeated parameters for the same key become arrays.
 *
 * Example:
 *   "qs:filter=arg1&filter=arg4"
 *
 * Output:
 *   {
 *     qs: { filter: ["arg1", "arg4"] }
 *   }
 *
 * @param {string} ops - Encoded operations string.
 * @returns {Object<string, Object>} - Parsed operations object.
 */
export const parseOperations = (ops) => {
	const opdata = {};
	const operations = ops.split('|'); // Not currently used (preserve priority then filter)

	for (const op of operations) {
		const [name, data] = op.split(':');

		opdata[name] = {};

		if (data) {
			// Split into key=value params
			const params = data.split('&');
			for (const param of params) {
				const [key, value] = param.split('=');

				// Merge repeated params into arrays
				if (Object.hasOwn(opdata[name], key)) {
					if (Array.isArray(opdata[name][key])) {
						opdata[name][key].push(value);
					} else {
						const arr = [opdata[name][key], value];
						opdata[name][key] = arr;
					}
				} else {
					opdata[name][key] = value;
				}
			}
		}
	}

	return opdata;
};

/**
 * Parses a URL or path fragment into host, path, and query string.
 *
 * Accepts:
 *   - `/path/segments`
 *   - `//schemeless.urls.com/path/segments`
 *   - `https?://full.urls.com/path/segments`
 *
 * Behavior:
 *   - Adds a fake host when parsing bare paths.
 *   - Detects and preserves host only if input had a scheme.
 *
 * @param {string} url - Input URL or path fragment.
 * @returns {[string, string, string]} - Tuple of [host, pathname, querystring].
 */
export const parseURLPath = (url) => {
	let fullUrl = false;
	let parsedUrl;

	// Handle schemeless URLs (`//example.com`)
	if (url.startsWith('//')) {
		url = 'https:' + url;
	}

	// If no scheme is provided, treat as path fragment
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		// Add placeholder host for parsing
		parsedUrl = new URL(url, 'https://placeholder.com/');
	} else {
		parsedUrl = new URL(url);
		fullUrl = true;
	}

	// Return [host, path, query] (omit host if fragment only)
	return [fullUrl ? parsedUrl.host : '', parsedUrl.pathname, parsedUrl.search];
};

/**
 * Validates & normalizes a URL-like string.
 *
 * Accepts:
 *  - Full URL:            "https://example.com/foo//bar?x=1#h"
 *  - Schemeless URL:      "//example.com/foo//bar?x=1#h"
 *  - Path fragment:       "/foo//bar?x=1#h"
 *
 * Behavior:
 *  - Normalizes the pathname (collapses multiple slashes to one, ensures a single leading "/").
 *  - Preserves search and hash.
 *  - Returns a full URL if input had a scheme (or was schemeless), otherwise returns a fragment.
 *
 * @param {string} input - The URL-like string to validate and normalize.
 * @returns {string} - Full URL or URL fragment depending on input.
 */
export const validateURLPath = (input) => {
	let url = String(input ?? '').trim();
	if (url === '') return '/';

	let isFullUrl = false;
	let parsed;

	// If schemeless, temporarily add https: so URL() can parse it
	if (url.startsWith('//')) {
		url = 'https:' + url;
		isFullUrl = true; // treat schemeless as full for the return value
	}

	// If it already has a scheme, mark as full URL
	const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url);
	if (hasScheme) {
		isFullUrl = true;
	}

	try {
		// Use a placeholder base to parse fragments; URL will also normalize dot-segments
		parsed = isFullUrl ? new URL(url) : new URL(url, 'https://placeholder.com/');
	} catch {
		// Fallback: treat as a raw path fragment and normalize slashes
		const normalized = normalizePathname('/' + url.replace(/^\/+/, ''));
		return normalized;
	}

	// Normalize only the pathname; leave protocol/host/query/hash intact
	parsed.pathname = normalizePathname(parsed.pathname);

	if (isFullUrl) {
		// Return full URL: origin + normalized path + query + hash
		return parsed.origin + parsed.pathname + parsed.search + parsed.hash;
	}

	// Return fragment: normalized path + query + hash (no placeholder host)
	return parsed.pathname + parsed.search + parsed.hash;
};

/**
 * Collapses multiple slashes in a pathname and ensures a single leading "/".
 * Does not strip a trailing slash (preserves it if present).
 * @param {string} pathname - The pathname to normalize.
 * @returns {string} - The normalized pathname.
 */
const normalizePathname = (pathname) => {
	// Ensure string and trim
	let p = String(pathname || '').trim();

	// ensure URL.pathname always starts with "/"
	p = '/' + p.replace(/^\/+/, '');

	// Collapse duplicate slashes within the path (not affecting protocol)
	p = p.replace(/\/{2,}/g, '/');

	return p;
};
