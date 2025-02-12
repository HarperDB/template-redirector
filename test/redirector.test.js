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

const nentries = 18

const csvfile = 'data/example.csv'
const jsonfile = 'data/example.json'
const csv_content = fs.readFileSync( csvfile, 'utf8' )
const json_content = fs.readFileSync( jsonfile, 'utf8' )

const check_path = '/p/shoes/'
const check_result = '/shop/shoes/v0?id=1236'
const check_path_full = '//www.example.com/p/shirts/'
const check_result_full = '/shop/mens-clothing/shirts?id=1234'


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

const get_query = async (path, redirect, host = "", version = -1, expectFail = false, t = -1 ) => {
  var resp;
  var data;

  it('GET should succeed', async () => {
    var url = `${SCHEME}://${HOST}/checkredirect?path=${path}`

    if ( host.length > 0 ) {
      url += `&h=${host}`
    }
    if ( version != -1 ) {
      url += `&v=${version}`
    }
    if ( t != -1 ) {
      url += `&t=${t}`
    }
    
    const options = { method: "GET" }



    resp = await fetch_wrapper( url, options )
    data = await resp.json()

    if ( expectFail ) {
      assert.equal( resp.status, 404 )
      return
    }
    assert.equal( resp.status, 200 )
  })

  if ( expectFail ) {
    return
  }
  
  it('Redirect should be correct', async () => {
    assert.equal( data.redirectURL, redirect )
  })
  
  it('Status code should be correct', async () => {
    assert.equal( data.statusCode, 301 )
  })
  
}

const path_query = async (path, redirect, host = "" ) => {
  var resp;
  var data;

  it('GET should succeed', async () => {
    var url = `${SCHEME}://${HOST}/checkredirect`

    if ( host.length > 0 ) {
      url += `?&h=${host}`
    }
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
    assert.equal( data.redirectURL, redirect )
  })
  
  it('Status code should be correct', async () => {
    assert.equal( data.statusCode, 301 )
  })
  
}

const getActiveVersion = async () => {
  const url = `${SCHEME}://${HOST}/version/`

  try {
    const options = {
      method: "GET",
    }
    const resp = await fetch_wrapper( url, options )

    const json = await resp.json();
    
    return json[0].activeVersion

  }
  catch( e ) {
    return -1
  }
  

}

const setActiveVersion = async ( version ) => {
  var url = `${SCHEME}://${HOST}/version/`

  try {
    const options = {
      method: "DELETE",
    }
    const resp = await fetch_wrapper( url, options )
  }
  catch( e ) {
    console.log( e )
    return false;
  }

  url = `${SCHEME}://${HOST}/version/`

  const body = JSON.stringify( { 'activeVersion': version } )

  
  try {
    const options = {
      method: "POST",
      headers: {
        "Content-type": "application/json"
      },
      body: body
    }
    const resp = await fetch_wrapper( url, options )
  }
  catch( e ) {
    console.log( e )
    return false
  }

  return true
}

const clearHostTable = async () => {
  var url = `${SCHEME}://${HOST}/hosts/`

  try {
    const options = {
      method: "DELETE",
    }
    const resp = await fetch_wrapper( url, options )


  }
  catch( e ) {
    console.log( e )
    return false;
  }

  return true
  
}

const addToHostTable = async ( host, hostOnly ) => {

  const url = `${SCHEME}://${HOST}/hosts/`

  const body = JSON.stringify( { host: host, hostOnly: hostOnly } )
  
  try {
    const options = {
      method: "POST",
      headers: {
        "Content-type": "application/json"
      },
      body: body
    }
    const resp = await fetch_wrapper( url, options )
  }
  catch( e ) {
    console.log( e )
    return false
  }

  return true;
}


describe( "Clear the host table", async () => {
  it( "Should set the correct version", async () => {
    assert.equal( await clearHostTable(), true  )
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


describe("Check if a redirect exists and is correct using the query string", async () => {
  await get_query( check_path, check_result )
})

describe("Check if a redirect exists and is correct using the Path header", async () => {
  await path_query( check_path, check_result )
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

describe( "Query with a full url", async () => {
  await get_query( check_path_full, check_result_full )
})


describe( "Get a full url back", async () => {
  const path = '/p/fullurl/'
  const redirect = 'https://www.another.com/info/care/full?id=1234'

  await get_query( path, redirect )
})



describe( "Query with host parameter", async () => {
  const path = '/p/shirts/'
  const redirect = '/shop/mens-clothing/shirts?id=1234'
  const host = 'www.example.com'

  await get_query( path, redirect, host )
})

describe( "Same query without host parameter", async () => {
  const path = '/p/shirts/'
  const redirect = '/shop/mens-clothing/shirts?id=5678'
  const host = ''

  await get_query( path, redirect, host )
})


describe( "Query with version 1", async () => {
  const path = '/p/dresses/'
  const redirect = '/shop/dresses/v1'
  const host = ''
  const version = 1
  
  await get_query( path, redirect, host, version )
})

describe( "Same query with no version", async () => {
  const path = '/p/dresses/'
  const redirect = '/shop/dresses/v0'
  
  await get_query( path, redirect )
})

describe( "Set the version in the version table and then query", async () => {

  it( "Should set the correct version", async () => {
    await setActiveVersion( 1 )
    assert.equal( await getActiveVersion(), 1  )
  })

  const path = '/p/dresses/'
  var redirect = '/shop/dresses/v1'

  await get_query( path, redirect );

  it( "Should set the correct version", async () => {
    await setActiveVersion( 0 )
    assert.equal( await getActiveVersion(), 0  )
  })

  var redirect = '/shop/dresses/v0'

  await get_query( path, redirect );
})


describe( "Check a query with the t parameter", async () => {


  const path = '/p/shirts/help/'
  var redirect = '/info/finding-the-perfect-shirt'

  await get_query( path, redirect, "", -1, true );
  await get_query( path, redirect, "", -1, false, 5 );
})



describe( "Set the host table and play with hostOnly", async () => {

  const path = '/p/makeup/'
  var redirect = '/shop/makeup-and-perfume'

  it( "Should set the host table", async () => {
    await clearHostTable()
    assert.ok( await addToHostTable( "www.example.com", true ) )
  })

  await get_query( path, redirect, 'www.example.com', -1, true )
  

  it( "Should set the host table", async () => {
    await clearHostTable()
    assert.ok( await addToHostTable( "www.example.com", false ) )
  })

  await get_query( path, redirect, "www.example.com" )


  it( "Should clear the host table", async () => {
    assert.ok( await clearHostTable() )
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



