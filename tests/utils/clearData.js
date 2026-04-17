/**
 * @module clearData
 * Script for sending an HTTP DELETE request to a configured `/redirect` endpoint.
 *
 * It is used for clearing all redirect paths from the database.
 *
 * ## Environment Variables
 * The following environment variables must be defined in a `.env` file or environment:
 * - `HOST`: Target hostname or IP address (e.g., `api.example.com`)
 * - `PORT`: (Optional) Port number; defaults to `9926` if not provided
 * - `HDB_USERNAME`: Username for basic authentication
 * - `HDB_PASSWORD`: Password for basic authentication
 *
 * ## Usage
 * Run the script from the command line with Node.js:
 *
 * ```bash
 * node tests/utils/clearData.js
 * ```
 */

import dotenv from 'dotenv';

dotenv.config();
const HOST = process.env.HOST;
const PORT = process.env.PORT || 9926;
const HDB_USERNAME = process.env.HDB_USERNAME || 'HDB_ADMIN';
const HDB_PASSWORD = process.env.HDB_PASSWORD || 'password';

const url = `https://${HOST}:${PORT}/redirect/?path==*`;

async function clearData() {
	try {
		const options = {
			method: 'DELETE',
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${HDB_USERNAME}:${HDB_PASSWORD}`).toString('base64'),
			},
		};

		const resp = await fetch(url, options);

		if (resp.status === 204) {
			console.log('Success');
		} else {
			console.log(`Error: ${resp.status}`);
		}

		return resp;
	} catch (e) {
		console.log('Request failed:', e.message);
		return null;
	}
}

clearData();
