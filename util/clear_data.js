import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const HOST = process.env.HOST;
const SCHEME = process.env.SCHEME;

const csvfile = 'data/example.csv';
const csv_content = fs.readFileSync(csvfile, 'utf8');

const url = `${SCHEME}://${HOST}/redirect/?path==*`;
console.info(`Clearing all redirect rules for service: ${url}`);

try {
	const options = {
		method: 'DELETE',
	};
	const resp = await fetch(url, options);

	if (resp.status == 204) {
		console.info('Success');
	} else {
		console.error(`Error: ${resp.status}`);
	}
} catch (e) {
	console.error(`Error clearing redirect rules:`, e);
}
