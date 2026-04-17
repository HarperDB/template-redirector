/**
 * @module csv2json
 * Script for converting a CSV file to JSON using PapaParse.
 *
 * This script reads a specified CSV file, converts its contents into JSON format
 * (with headers as keys), and writes the resulting data to an output JSON file.
 *
 * ## Usage
 * Run from the command line:
 *
 * ```bash
 * node tests/utils/csv2json.js <input-csv-path> <output-json-path>
 * ```
 *
 * **Parameters:**
 * - `<input-csv-path>`: Path to the input CSV file (e.g., `./data/input.csv`)
 * - `<output-json-path>`: Path for the output JSON file (e.g., `./data/output.json`)
 */

import Papa from 'papaparse';
import fs from 'fs';

const args = process.argv.slice(2);

if (args.length < 2) {
	console.error('Usage: node tests/utils/csv2json.js <input-csv-path> <output-json-path>');
	process.exit(1);
}

const [inputPath, outputPath] = args;

function convertCsvToJson() {
	let csvData;
	try {
		csvData = fs.readFileSync(inputPath, 'utf8');
	} catch (err) {
		console.error(`Error reading input file: ${err.message}`);
		process.exit(1);
	}

	const parsed = Papa.parse(csvData, {
		header: true,
		skipEmptyLines: true,
	});

	try {
		fs.writeFileSync(outputPath, JSON.stringify(parsed.data, null, 2));
		console.log(`Successfully converted "${inputPath}" to "${outputPath}"`);
	} catch (err) {
		console.error(`Error writing output file: ${err.message}`);
		process.exit(1);
	}
}

convertCsvToJson();
