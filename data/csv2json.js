import Papa from 'papaparse'
import fs from 'fs'

const csv = fs.readFileSync('example.csv', 'utf8');

const json = Papa.parse( csv, { header: true, skipEmptyLines: true } )

fs.writeFileSync( 'example.json', JSON.stringify(json) );

