import 'dotenv/config'
import assert from "node:assert"

const HOST = process.env.HOST
const PORT = process.env.PORT || 443
const OPPORT = process.env.OPPORT || 9925
const SCHEME = process.env.SCHEME
const AUTH = process.env.AUTH
const USERNAME = process.env.USERNAME
const PASSWORD = process.env.PASSWORD
const TOKEN = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
const REST_HOST = PORT == 443 ? HOST : `${HOST}:${PORT}`
const OP_HOST = `${HOST}:${OPPORT}`


const fetchWrapper = async (url, options) => {
  if (AUTH === "true") {
    options.headers ??= {}
    options.headers.Authorization = `Basic ${TOKEN}`
  }

  return await fetch(url, options)
}

const clearTable = async (table) => {
  const url = `${SCHEME}://${REST_HOST}/${table}/`

  try {
    const options = {
      method: "DELETE",
    }
    const resp = await fetchWrapper(url, options)
    return true
  }
  catch (e) {
    console.log(e)
    return false
  }
}

const getItemCount_44 = async (table) => {
  const url = `${SCHEME}://${REST_HOST}/${table}`

  try {
    const options = {
      method: "GET",
    }
    const resp = await fetchWrapper(url, options)
    const data = await resp.json();
    console.log(data)
    return data.recordCount
  }
  catch (e) {
    console.log(e)
    return -1
  }
}

const getItemCount_45 = async (table) => {
  const url = `${SCHEME}://${REST_HOST}/${table}?select(id)`

  try {
    const options = {
      method: "GET",
    }

    const resp = await fetchWrapper(url, options)
    const data = await resp.json();

    return data.length;
  }
  catch (e) {
    console.log(e)
    return -1
  }
}


const getItemCount = async (table) => {
  return await getItemCount_45(table)
}

const defaultOptions = {
  host: "",
  version: -1,
  t: -1,
  expectNotFound: false,
  useHeader: false,
  si: -1
}

const checkRedirect = async (path, redirect, options) => {

  options = { ...defaultOptions, ...options }

  var url = `${SCHEME}://${REST_HOST}/checkredirect`
  var qs = []

  if (!options.useHeader) {
    qs.push(`path=${path}`)
  }
  if (options.host?.length > 0) {
    qs.push(`h=${options.host}`)
  }
  if (options.version != -1) {
    qs.push(`v=${options.version}`)
  }
  if (options.t != -1) {
    qs.push(`t=${options.t}`)
  }
  if (options.si != -1) {
    qs.push(`si=${options.si}`)
  }

  if (qs.length > 0) {
    url += '?' + qs.join('&')
  }

  console.log(url)



  const fetchOptions = { method: "GET" }
  if (options.useHeader) {
    fetchOptions.headers = { Path: path }
  }

  const resp = await fetchWrapper(url, fetchOptions)
  const data = await resp.json()


  //console.log( data )



  if (options.expectNotFound) {
    assert.equal(resp.status, 404)
    return
  }

  assert.equal(resp.status, 200)
  assert.equal(data.redirectURL, redirect)
  assert.equal(data.statusCode, 301)

  return true
}

const getActiveVersion = async () => {
  const url = `${SCHEME}://${REST_HOST}/version/`

  try {
    const options = {
      method: "GET",
    }
    const resp = await fetchWrapper(url, options)

    const json = await resp.json();

    return json[0].activeVersion

  }
  catch (e) {
    return -1
  }
}

const setActiveVersion = async (version) => {

  clearTable('version')

  const url = `${SCHEME}://${REST_HOST}/version/`

  const body = JSON.stringify({ 'activeVersion': version })


  try {
    const options = {
      method: "POST",
      headers: {
        "Content-type": "application/json"
      },
      body: body
    }
    const resp = await fetchWrapper(url, options)
  }
  catch (e) {
    console.log(e)
    return false
  }

  return true
}


const addToHostTable = async (host, hostOnly) => {

  const url = `${SCHEME}://${REST_HOST}/hosts/`

  const body = JSON.stringify({ host: host, hostOnly: hostOnly })

  try {
    const options = {
      method: "POST",
      headers: {
        "Content-type": "application/json"
      },
      body: body
    }
    const resp = await fetchWrapper(url, options)
  }
  catch (e) {
    console.log(e)
    return false
  }

  return true;
}


export { clearTable, getItemCount, fetchWrapper, checkRedirect, getActiveVersion, setActiveVersion, addToHostTable }

