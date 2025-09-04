import { httpRequest } from 'http-request';
import { logger } from 'log';

const HARPER_TOKEN = '';

export async function onClientRequest(request) {
	try {
		const url = `https://${request.host}/checkredirect?h=${request.host}&path=${request.path}`;

		const requestHeaders = {
			Authorization: `Basic ${HARPER_TOKEN}`,
			'Content-Type': 'application/json',
			'X-Query-String': request.query,
		};

		const options = {
			timeout: 250,
			method: 'GET',
			headers: requestHeaders,
		};

		const response = await httpRequest(url, options);

		if (response.status === 200) {
			const data = await response.json();

			const responseHeaders = {
				Location: data.redirectUrl,
			};

			const body = '{}';

			logger.log(`Redirecting ${request.url} to ${data.redirectUrl}`);
			request.respondWith(data.statusCode, responseHeaders, body);
		} else {
			logger.log(`No redirect found for ${request.url}`);
		}
	} catch (exception) {
		logger.log(`Error occured while calling HDB: ${exception.message}`);
	}
}
