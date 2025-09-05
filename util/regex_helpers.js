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
