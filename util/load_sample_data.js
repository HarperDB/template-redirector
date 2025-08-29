import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const HOST = process.env.HOST;
const SCHEME = process.env.SCHEME;

const csvfile = 'data/example.csv';
const csv_content = fs.readFileSync(csvfile, 'utf8');

const url = `${SCHEME}://${HOST}/redirect`;
console.info(`Loading sample data to ${url}`);

try {
	const options = {
		method: 'POST',
		headers: {
			'Content-type': 'text/csv',
		},
		body: csv_content,
	};
	const resp = await fetch(url, options);
	const data = await resp.json();
	console.info('Sample data loaded successfully:', data);
} catch (e) {
	console.error(`Error loading sample data:`, e);
}
