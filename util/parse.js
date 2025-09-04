// Helper function to parse query parameters in a standard way
export const parseParams = (query, config) => {
	const params = {};

	for (const [key, value] of Object.entries(config)) {
		if (query.get(key) !== undefined) {
			if (value.type === 'Bool') {
				params[key] = query.get(key) == 1 ? true : false;
			} else {
				params[key] = query.get(key);
			}
		} else {
			params[key] = value.default;
		}
	}

	return params;
};

export const parseOperations = (ops) => {
	const opdata = {};
	const operations = ops.split('|');

	for (const op of operations) {
		const [name, data] = op.split(':');

		opdata[name] = {};

		if (data) {
			const params = data.split('&');
			for (const param of params) {
				const [key, value] = param.split('=');
				if (opdata[name].hasOwnProperty(key)) {
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

/*
 * Accepts:
 *   /path/segments
 *   //schemeless.urls.com/path/segments
 *   https?://full.urls.com/path/segments
 */
export const parseURLPath = (url) => {
	var fullUrl = false;
	var parsedUrl;

	// the URL class wants things to start with a scheme
	if (url.startsWith('//')) {
		url = 'https:' + url;
	}

	// If it does nto start with a scheme it is just a path fragment,
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		// Add a fake host for parsing
		parsedUrl = new URL(url, 'https://placeholder.com/');
	} else {
		parsedUrl = new URL(url);
		fullUrl = true;
	}

	// Remove the fake host if necessary
	return [fullUrl ? parsedUrl.host : '', parsedUrl.pathname, parsedUrl.search];
};
