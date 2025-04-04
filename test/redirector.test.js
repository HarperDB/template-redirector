import 'dotenv/config'
import { test, describe, it } from "node:test"
import assert from "node:assert"
import fs from 'fs'
import { clearTable, getItemCount, fetchWrapper, checkRedirect,
  getActiveVersion, setActiveVersion, addToHostTable } from './common.js'

const HOST     = process.env.HOST
const SCHEME   = process.env.SCHEME
const AUTH     = process.env.AUTH
const USERNAME = process.env.USERNAME
const PASSWORD = process.env.PASSWORD
const TOKEN    = Buffer.from( `${USERNAME}:${PASSWORD}` ).toString('base64');

const nentries = 24

const csvfile = 'data/example.csv'
const jsonfile = 'data/example.json'
const csv_content = fs.readFileSync( csvfile, 'utf8' )
const json_content = fs.readFileSync( jsonfile, 'utf8' )

const check_path = '/p/shoes/'
const check_result = '/shop/shoes/v0?id=1236'
const check_path_full = '//www.example.com/p/shirts/'
const check_result_full = '/shop/mens-clothing/shirts?id=1234'



describe( "Clear the host table", async () => {
  it( "Should set the correct version", async () => {
    assert.equal( await clearTable( 'hosts' ), true  )
  })
})

describe( "Set active version to 0", async () => {
  it( "Should set the correct version", async () => {
    await setActiveVersion( 0 )
    assert.equal( await getActiveVersion(), 0  )
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
      resp = await fetchWrapper( url, options )
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
      resp = await fetchWrapper( url, options )
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
      resp = await fetchWrapper( url, options )
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


describe("Check if a redirect exists and is correct using the query string", async () => {
  it('fetching', async () => {
    await checkRedirect( check_path, check_result )
  })
})

describe("Check if a redirect exists and is correct using the Path header", async () => {
  it( 'Checking Redirect', async () => {
    await checkRedirect( check_path, check_result, { useHeader: true } )
  })
})


describe("Check if a redirect does not exists using the query string", () => {
  it('It should return a 404', async () => {
    await checkRedirect( 'xxx', '', { expectNotFound: true} )
  })
})

describe("Check if a redirect does not exists using the Path header", () => {
  it('It should return a 404', async () => {
    await checkRedirect( 'xxx', '', { expectNotFound: true, useHeader: true } )
  })
})


describe("Update a record with start and end times and retrieve", () => {

  var id;
  
  it('Should get the ID of the record we want to update', async () => {

    const url = `${SCHEME}://${HOST}/checkredirect?path=${check_path}`
    const options = { method: "GET" }

    const resp = await fetchWrapper( url, options )
    const data = await resp.json()

    id = data.id;

    assert.equal( resp.status, 200 )

  })

  it ( 'Update time span for now. PUT should get a 204.', async () => {

    const now = Math.floor(Date.now()/1000);
    const hour = 3600;
    
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

    const resp = await fetchWrapper( url, options )

    assert.equal( resp.status, 204 )
  })

  it('Should get a record for our redirect', async () => {
    await checkRedirect( check_path, check_result )
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
    
    const resp = await fetchWrapper( url, options )

    assert.equal( resp.status, 204 )
  })

  it('Should not get a record for our redirect', async () => {
    await checkRedirect( check_path, check_result, { expectNotFound: true } )
  })

})

describe( "Query with a full url", async () => {
  it('fetching', async () => {
    await checkRedirect( check_path_full, check_result_full )
  })
})


describe( "Get a full url back", async () => {
  const path = '/p/fullurl/'
  const redirect = 'https://www.another.com/info/care/full?id=1234'

  it('fetching', async () => {
    await checkRedirect( path, redirect )
  })
})



describe( "Query with host parameter", async () => {
  const path = '/p/shirts/'
  const redirect = '/shop/mens-clothing/shirts?id=1234'
  const host = 'www.example.com'

  it('fetching', async () => {
    await checkRedirect( path, redirect, { host: host } )
  })
})

describe( "Same query without host parameter", async () => {
  const path = '/p/shirts/'
  const redirect = '/shop/mens-clothing/shirts?id=5678'
  const host = ''

  it('fetching', async () => {
    await checkRedirect( path, redirect )
  })
})


describe( "Query with version 1", async () => {
  const path = '/p/dresses/'
  const redirect = '/shop/dresses/v1'
  const host = ''
  const version = 1

  it('fetching', async () => {
    await checkRedirect( path, redirect, { host, version } )
  })
})

describe( "Same query with no version", async () => {
  const path = '/p/dresses/'
  const redirect = '/shop/dresses/v0'

        
  it('fetching', async () => {
    await checkRedirect( path, redirect )
  })
})

test( "Set the version in the version table and then query", { serial: true }, async (t) => {

  await t.test( "Should set the correct version", async () => {
    await setActiveVersion( 1 )
    assert.equal( await getActiveVersion(), 1  )
  })

  const path = '/p/dresses/'
  var redirect = '/shop/dresses/v1'

  await t.test('fetching', async () => {
    await checkRedirect( path, redirect );
  })

  await t.test( "Should set the correct version", async () => {
    await setActiveVersion( 0 )
    assert.equal( await getActiveVersion(), 0  )
  })

  var redirect = '/shop/dresses/v0'

  await t.test('fetching', async () => {
    await checkRedirect( path, redirect );
  })
})


describe( "Check a query with the t parameter", async () => {


  const path = '/p/shirts/help/'
  var redirect = '/info/finding-the-perfect-shirt'

  it('fetching', async () => {
    await checkRedirect( path, redirect, { expectNotFound: true } );
  })
  
  it('fetching', async () => {
    await checkRedirect( path, redirect, { t: 5 } )
  })
})



describe( "Set the host table and play with hostOnly", async () => {

  const path = '/p/makeup/'
  var redirect = '/shop/makeup-and-perfume'

  it( "Should set the host table", async () => {
    await clearTable( 'hosts' )
    assert.ok( await addToHostTable( "www.example.com", true ) )
  })

  
  it('fetching', async () => {
    await checkRedirect( path, redirect, { host: 'www.example.com', expectNotFound: true } )
  })
  

  it( "Should set the host table", async () => {
    await clearTable( 'hosts' )
    assert.ok( await addToHostTable( "www.example.com", false ) )
  })

  it('fetching', async () => {
    await checkRedirect( path, redirect, { host: 'www.example.com' } )
  })


  it( "Should clear the host table", async () => {
    assert.ok( await clearTable( 'hosts' ) )
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



