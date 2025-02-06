import 'dotenv/config'
import fs from 'fs'

const HOST = process.env.HOST
const SCHEME = process.env.SCHEME

const csvfile = 'data/example.csv'
const csv_content = fs.readFileSync( csvfile, 'utf8' )

const url = `${SCHEME}://${HOST}/redirect/?path==*`

try {
  const options = {
    method: "DELETE",
  }
  const resp = await fetch( url, options )

  if ( resp.status == 204 ) {
    console.log( "Success" )
  }
  else {
    console.log( `Error: ${resp.status}` )
  }
}
catch( e ) {
  console.log( e.message )
}
