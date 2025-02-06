import 'dotenv/config'
import fs from 'fs'

const HOST = process.env.HOST
const SCHEME = process.env.SCHEME

const csvfile = 'data/example.csv'
const csv_content = fs.readFileSync( csvfile, 'utf8' )

const url = `${SCHEME}://${HOST}/redirect`

try {
  const options = {
    method: "POST",
    headers: {
      "Content-type": "text/csv"
    },
    body: csv_content
  }
  const resp = await fetch( url, options )
  const data = await resp.json()
  console.log( data )
}
catch( e ) {
  console.log( e.message )
}
