import 'dotenv/config'
import { describe, it } from "node:test"
import assert from "node:assert"
import fs from 'fs'

const HOST     = process.env.HOST
const SCHEME   = process.env.SCHEME
const AUTH     = process.env.AUTH
const USERNAME = process.env.USERNAME
const PASSWORD = process.env.PASSWORD
const TOKEN    = Buffer.from( `${USERNAME}:${PASSWORD}` ).toString('base64');

const nentries = 15

const csvfile = 'data/example.csv'
const jsonfile = 'data/example.json'
const csv_content = fs.readFileSync( csvfile, 'utf8' )
const json_content = fs.readFileSync( jsonfile, 'utf8' )

const check_path = '/p/shoes/'
const check_result = '/shop/shoes/v1?id=1236'

const fetch_wrapper = async ( url, options ) => {
  if ( AUTH === "true" ) {
    options.headers ??= {}
    options.headers.Authorization = `Basic ${TOKEN}`
  }

  return await fetch( url, options )
}

const clearTable = async ( table ) => {

  const url = `${SCHEME}://${HOST}/${table}/?path==*`

  try {
    const options = {
      method: "DELETE",
    }
    const resp = await fetch_wrapper( url, options )
    return true
  }
  catch( e ) {
    return false
  }
}

const getItemCount = async ( table ) => {

  const url = `${SCHEME}://${HOST}/${table}`

  try {
    const options = {
      method: "GET",
    }
    const resp = await fetch_wrapper( url, options )
    const data = await resp.json()
    return data.recordCount
  }
  catch( e ) {
    return -1
  }

}


describe( "Clear the entries", () => {
  it( "Should execute a successful DELETE request", async () => {
    assert.ok( await clearTable( 'rule' ) )
  })

  it( "Should have zero items now", async () => {
    assert.equal( await getItemCount( 'rule' ), 0 )
  })
})

describe("Load entries into the redirect table via CSV", () => {

  var data
  var resp
  
  it( "Should execute a successful HTTP request", async () => {

    const url = `${SCHEME}://${HOST}/redirect`

    try {
      const options = {
        method: "POST",
        headers: {
          "Content-type": "text/csv"
        },
        body: csv_content
      }
      resp = await fetch_wrapper( url, options )
      data = await resp.json()
      assert.ok( true )
    }
    catch( e ) {
      assert.ok( false )
    }
  })


  it('It should have a 200 response', () => {
    assert.strictEqual( resp.status, 200 )
  })

  it(`It should return that ${nentries} entries were added`, () => {
    assert.strictEqual( data.message, `Successfully loaded ${nentries} redirects.` )
  })

  it( `Should have ${nentries} items now`, async () => {
    assert.equal( await getItemCount( 'rule' ), nentries )
  })

})

describe("Load entries again into the redirect table via CSV to check exclusion of duplicate paths", () => {

  var data
  var resp
  
  it( "Should execute a successful HTTP request", async () => {

    const url = `${SCHEME}://${HOST}/redirect`

    try {
      const options = {
        method: "POST",
        headers: {
          "Content-type": "text/csv"
        },
        body: csv_content
      }
      resp = await fetch_wrapper( url, options )
      data = await resp.json()
      assert.ok( true )
    }
    catch( e ) {
      assert.ok( false )
    }
  })


  it('It should have a 200 response', () => {
    assert.strictEqual( resp.status, 200 )
  })

  it('It should return that 0 entries were added', () => {
    assert.strictEqual( data.message, "Successfully loaded 0 redirects." )
  })

  it( `Should still have ${nentries} items now`, async () => {
    assert.equal( await getItemCount( 'rule' ), nentries )
  })

})

describe( "Clear the entries", () => {
  it( "Should execute a successful DELETE request", async () => {
    assert.ok( await clearTable( 'rule' ) )
  })
  it( "Should have zero items now", async () => {
    assert.equal( await getItemCount( 'rule' ), 0 )
  })
})

describe("Load entries into the redirect table via JSON", () => {

  var data
  var resp
  
  it( "Should execute a successful HTTP request", async () => {

    const url = `${SCHEME}://${HOST}/redirect`

    try {
      const options = {
        method: "POST",
        headers: {
          "Content-type": "application/json"
        },
        body: json_content
      }
      resp = await fetch_wrapper( url, options )
      data = await resp.json()
      assert.ok( true )
    }
    catch( e ) {
      assert.ok( false )
    }
  })


  it('It should have a 200 response', () => {
    assert.strictEqual( resp.status, 200 )
  })

  it(`It should return that ${nentries} entries were added`, () => {
    assert.strictEqual( data.message, `Successfully loaded ${nentries} redirects.` )
  })

  it( `Should have ${nentries} items now`, async () => {
    assert.equal( await getItemCount( 'rule' ), nentries )
  })
})


describe("Check if a redirect exists and is correct using the query string", () => {

  var resp;
  var data;

  it('GET should succeed', async () => {
    const url = `${SCHEME}://${HOST}/checkredirect?path=${check_path}`
    const options = { method: "GET" }

    resp = await fetch_wrapper( url, options )
    data = await resp.json()

    assert.equal( resp.status, 200 )
  })
  
  it('Redirect should be correct', async () => {
    assert.equal( data.redirectURL, check_result )
  })
  
  it('Status code should be correct', async () => {
    assert.equal( data.statusCode, 301 )
  })
})

describe("Check if a redirect exists and is correct using the Path header", () => {

  var resp;
  var data;


  it('GET should succeed', async () => {
    const url = `${SCHEME}://${HOST}/checkredirect`
    const options = {
      method: "GET",
      headers: {
        "Path": check_path
      }
    }

    resp = await fetch_wrapper( url, options )
    data = await resp.json()
    
    assert.equal( resp.status, 200 )
  })

  it('Redirect should be correct', async () => {
    assert.equal( data.redirectURL, check_result )
  })
  
  it('Status code should be correct', async () => {
    assert.equal( data.statusCode, 301 )
  })
})


describe("Check if a redirect does not exists using the query string", () => {
  it('It should return a 404', async () => {
    const url = `${SCHEME}://${HOST}/checkredirect?path=xxx`
    const options = { method: "GET" }

    const resp = await fetch_wrapper( url, options )

    assert.equal( resp.status, 404 )
  })
})

describe("Check if a redirect does not exists using the Path header", () => {

  it('It should return a 404 and the redirect data', async () => {

    const url = `${SCHEME}://${HOST}/checkredirect`

    const options = {
      method: "GET",
      headers: {
        "Path": "xxx"
      }
    }

    const resp = await fetch_wrapper( url, options )

    assert.equal( resp.status, 404 )
  })
})


describe("Update a record with start and end times and retrieve", () => {

  var id;
  
  it('Should get the ID of the record we want to update', async () => {

    const url = `${SCHEME}://${HOST}/checkredirect?path=${check_path}`
    const options = { method: "GET" }

    const resp = await fetch_wrapper( url, options )
    const data = await resp.json()

    id = data.id;

    assert.equal( resp.status, 200 )

  })

  it ( 'Update time span for now. PUT should get a 204.', async () => {

    const now = Date.now();
    const hour = 3600 * 1000;
    
    const url = `${SCHEME}://${HOST}/rule/${id}`

    
    const options = {
      method: "PUT",
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({
        path: check_path,
        redirectURL: check_result,
        host: "",
        version: 0, 
        statusCode: 301,
        utcStartTime: now - hour,
        utcEndTime: now + hour
      })
    }

    const resp = await fetch_wrapper( url, options )

    assert.equal( resp.status, 204 )
  })

  it('Should get a record for our redirect', async () => {

    const url = `${SCHEME}://${HOST}/checkredirect?path=${check_path}`
    const options = { method: "GET" }

    const resp = await fetch_wrapper( url, options )
    const data = await resp.json()

    assert.equal( resp.status, 200 )
  })

  it ( 'Update time span for Later. PUT should get a 204.', async () => {

    const now = Date.now();
    const hour = 3600 * 1000;
    
    const url = `${SCHEME}://${HOST}/rule/${id}`
    const options = {
      method: "PUT",
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({
        path: check_path,
        redirectURL: check_result,
        host: "",
        version: 0, 
        statusCode: 301,
        utcStartTime: now + hour,
        utcEndTime: now + (hour*2)
      })
    }
    
    const resp = await fetch_wrapper( url, options )

    assert.equal( resp.status, 204 )
  })

  it('Should not get a record for our redirect', async () => {

    const url = `${SCHEME}://${HOST}/checkredirect?path=${check_path}`
    const options = { method: "GET" }

    const resp = await fetch_wrapper( url, options )
    const data = await resp.json()

    assert.equal( resp.status, 404 )
  })

})

  /*
describe( "Clear the entries", () => {
  it( "Should execute a successful DELETE request", async () => {
    assert.ok( await clearTable( 'rule' ) )
  })
  it( "Should have zero items now", async () => {
    assert.equal( await getItemCount( 'rule' ), 0 )
  })
})

   */

