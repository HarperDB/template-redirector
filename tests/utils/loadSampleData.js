/**
 * @module loadSampleData
 * Script for uploading CSV or JSON data to a redirect endpoint via HTTP POST.
 *
 * This script dynamically reads a specified file (either `.csv` or `.json`),
 * determines the correct `Content-Type` header based on the file type,
 * and sends the contents to a configured endpoint (`/redirect`).
 *
 * ## Environment Variables
 * The following must be defined in a `.env` file or environment:
 * - `HOST`: Target hostname (e.g., `api.example.com`)
 * - `PORT`: (Optional) Port number; defaults to `9926`
 * - `HDB_USERNAME`: Username for basic authentication
 * - `HDB_PASSWORD`: Password for basic authentication
 *
 * ## Usage
 * Run the script from the command line:
 *
 * ```bash
 * node tests/utils/loadSampleData.js <file-path> <file-type>
 * ```
 *
 * **Parameters:**
 * - `<file-path>`: Path to the file you wish to send (e.g., `./data/sample/example.csv`)
 * - `<file-type>`: Must be either `csv` or `json`
 */

import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const HOST = process.env.HOST;
const PORT = process.env.PORT || 9926;
const HDB_USERNAME = process.env.HDB_USERNAME || 'HDB_ADMIN';
const HDB_PASSWORD = process.env.HDB_PASSWORD || 'password';

const args = process.argv.slice(2);

if (args.length < 2) {
	console.error('Usage: node tests/utils/loadSampleData.js <file-path> <file-type>');
	process.exit(1);
}

const [filePath, fileType] = args;

// Validate file type
if (!['csv', 'json'].includes(fileType)) {
	console.error('Error: file type must be either "csv" or "json"');
	process.exit(1);
}

// Read the file contents
let fileContent;
try {
	fileContent = fs.readFileSync(filePath, 'utf8');
} catch (err) {
	console.error(`Error reading file: ${err.message}`);
	process.exit(1);
}

// Determine content type
const contentType = fileType === 'csv' ? 'text/csv' : 'application/json';

const url = `https://${HOST}:${PORT}/redirect`;

async function loadSampleData() {
	try {
		const options = {
			method: 'POST',
			headers: {
				'Content-Type': contentType,
				'Authorization': 'Basic ' + Buffer.from(`${HDB_USERNAME}:${HDB_PASSWORD}`).toString('base64'),
			},
			body: fileContent,
		};

		const resp = await fetch(url, options);
		console.log(`Response Status: ${resp.status}`);
		return resp;
	} catch (e) {
		console.error(`Request failed: ${e.message}`);
		return null;
	}
}

loadSampleData();
