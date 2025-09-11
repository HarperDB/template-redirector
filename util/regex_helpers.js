import { validateURL } from './url_helpers.js';

/**
 * Returns the first token after trimming any leading non-alphanumerics.
 * The token is [A-Za-z0-9]+ with an optional single hyphen or underscore followed by [A-Za-z0-9]+.
 * Stops at a second '-', '_' or any other non-alphanumeric symbol.
 *
 * Examples:
 * getRegexPrefix('/long-page-name-here')        // "long-page"
 * getRegexPrefix('/somepath.html')             // "somepath"
 * getRegexPrefix('/another_page_name12345')   // "another_page"
 * getRegexPrefix('/page123.name456')         // "page123"
 * getRegexPrefix('/path.name123.html')      // "path"
 *
 * @remarks
 * These examples illustrate one possible interpretation.
 * You should customize the logic based on your project's specific URL patterns
 * to extract a meaningful prefix. This will improve regex matching performance
 * and reduce timing overhead for your application.
 */
export function getRegexPrefix(str = '') {
	const s = String(str).replace(/^[^A-Za-z0-9]+/, '');
	const m = s.match(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)?/);
	return m ? m[0] : '';
}

/**
 * Processes a batch of regex rules against a given path.
 * @param {Array} batch - The batch of regex rules to process.
 * @param {string} path - The path to test against the regex rules.
 * @returns {Promise<{ matches: Array, perfectMatch: Object|null }>} - The matching results and optional perfect match.
 */
export const processRegexBatch = async (batch, path) => {
	let perfectMatch = null;
	const matches = [];

	const CONCURRENCY_LIMIT = 10;
	const chunks = [];

	for (let i = 0; i < batch.length; i += CONCURRENCY_LIMIT) {
		chunks.push(batch.slice(i, i + CONCURRENCY_LIMIT));
	}

	for (const chunk of chunks) {
		const chunkPromises = chunk.map(async (regexRecord, index) => {
			try {
				// Attempt to compile the regex from db string
				const re = compileRegExp(regexRecord.path);
				if (!re) return null;

				const match = path.match(re);
				if (match) {
					const newPath = path.replace(re, regexRecord.redirectURL);
					const matchResult = {
						...regexRecord,
						redirectURL: validateURLPath(newPath),
						match: match,
					};

					const isPerfect = match[0] === path;
					return { result: matchResult, isPerfect, index };
				}
			} catch (e) {
				logger.warn('Failed to compile regex:', e);
			}
			return null;
		});

		const chunkResults = await Promise.all(chunkPromises);
		const validResults = chunkResults.filter(Boolean);

		const perfectMatchIndex = validResults.findIndex((result) => result.isPerfect);
		if (perfectMatchIndex !== -1 && !perfectMatch) {
			perfectMatch = validResults[perfectMatchIndex].result;
		}

		if (perfectMatch) {
			// Early exit if perfect match is found
			break;
		} else {
			matches.push(...validResults.map((r) => r.result));
		}
	}

	return { matches, perfectMatch };
};

/**
 * Compile a simplified path pattern into a real RegExp.
 * - Treat trailing "*" as ".*" (prefix match).
 * - Otherwise require an exact match.
 * - Escapes regex meta-chars in the literal portion.
 * - Optional: case-insensitive match (set `flags` to 'i' if needed).
 */
function compileRegExp(simple, flags = '') {
	if (typeof simple !== 'string') {
		simple = String(simple ?? '');
	}

	// Sanitize: remove leading ^, trailing $ or .* or * and unescape backslashes
	// (keeps a single trailing * if present interpret it as wildcard)
	let s = simple.trim();
	s = s.replace(/^\^+/, ''); // leading ^
	s = s.replace(/(?:\.\*)+$/, ''); // trailing .*
	s = s.replace(/\$+$/, ''); // trailing $
	s = s.replace(/\\+/g, ''); // remove backslashes

	// Keep a terminal '*' if present so we can treat it as wildcard
	const hasStar = s.endsWith('*');
	if (hasStar) {
		s = s.slice(0, -1);
	}

	// Ensure it’s a path and escape regex metachars
	s = '/' + s.replace(/^\/+/, '');
	const escaped = s.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');

	const source = hasStar ? `^${escaped}.*` : `^${escaped}`;
	return new RegExp(source, flags);
}
