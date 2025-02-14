import 'dotenv/config'
import assert from "node:assert"

const HOST     = process.env.HOST
const SCHEME   = process.env.SCHEME
const AUTH     = process.env.AUTH
const USERNAME = process.env.USERNAME
const PASSWORD = process.env.PASSWORD
const TOKEN    = Buffer.from( `${USERNAME}:${PASSWORD}` ).toString('base64');

const fetchWrapper = async ( url, options ) => {
  if ( AUTH === "true" ) {
    options.headers ??= {}
    options.headers.Authorization = `Basic ${TOKEN}`
  }

  return await fetch( url, options )
}

const clearTable = async ( table ) => {
  const url = `${SCHEME}://${HOST}/${table}/`

  try {
    const options = {
      method: "DELETE",
    }
    const resp = await fetchWrapper( url, options )
    return true
  }
  catch( e ) {
    console.log( e )
    return false
  }
}

const getItemCount = async ( table ) => {
  const url = `${SCHEME}://${HOST}/${table}`

  try {
    const options = {
      method: "GET",
    }
    const resp = await fetchWrapper( url, options )
    const data = await resp.json()
    return data.recordCount
  }
  catch( e ) {
    console.log( e )
    return -1
  }
}


const defaultOptions = {
  host: "",
  version: -1,
  t: -1,
  expectNotFound: false,
  useHeader: false
}

const checkRedirect = async (path, redirect, options ) => {

  options = { ...defaultOptions, ...options }

  var url = `${SCHEME}://${HOST}/checkredirect`
  var qs = []

  if ( !options.useHeader ) {
    qs.push( `path=${path}` )
  }
  if ( options.host?.length > 0 ) {
    qs.push( `h=${options.host}` )
  }
  if ( options.version != -1 ) {
    qs.push( `v=${options.version}` )
  }
  if ( options.t != -1 ) {
    qs.push( `t=${options.t}` )
  }

  if ( qs.length > 0 ) {
    url += '?' + qs.join( '&' )
  }

  const fetchOptions = { method: "GET" }
  if ( options.useHeader ) {
    fetchOptions.headers = { Path: path }
  }

  const resp = await fetchWrapper( url, fetchOptions )
  const data = await resp.json()

  if ( options.expectNotFound ) {
    assert.equal( resp.status, 404 )
    return
  }
  
  assert.equal( resp.status, 200 )
  assert.equal( data.redirectURL, redirect )
  assert.equal( data.statusCode, 301 )
}

const getActiveVersion = async () => {
  const url = `${SCHEME}://${HOST}/version/`

  try {
    const options = {
      method: "GET",
    }
    const resp = await fetchWrapper( url, options )

    const json = await resp.json();
    
    return json[0].activeVersion

  }
  catch( e ) {
    return -1
  }
}

const setActiveVersion = async ( version ) => {

  clearTable( 'version' )

  const url = `${SCHEME}://${HOST}/version/`

  const body = JSON.stringify( { 'activeVersion': version } )

  
  try {
    const options = {
      method: "POST",
      headers: {
        "Content-type": "application/json"
      },
      body: body
    }
    const resp = await fetchWrapper( url, options )
  }
  catch( e ) {
    console.log( e )
    return false
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
    const resp = await fetchWrapper( url, options )
  }
  catch( e ) {
    console.log( e )
    return false
  }

  return true;
}


export { clearTable, getItemCount, fetchWrapper, checkRedirect, getActiveVersion, setActiveVersion, addToHostTable }

