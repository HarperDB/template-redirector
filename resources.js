
// ‘^/products(?:(\.|/|\?|#)(.*)|$)$’

import Papa from 'papaparse';
import { URL } from 'node:url';
import querystring from 'node:querystring';

const { hdb_analytics } = databases.system;

import util from 'util';

// Helper function to parse query parameters in a standard way
const parseParams = ( query, config ) => {
  const params = {}

  for ( const [key, value] of Object.entries(config) ) {

    if ( query.get(key) !== undefined ) {
      if ( value.type === 'Bool' ) {
        params[key] = query.get(key) == 1 ? true : false
      }
      else {
        params[key] = query.get(key)
      }
    }
    else {
      params[key] = value.default
    }
  }

  return params;
}

const parseOperations = (ops) => {

  const opdata = {}
  const operations = ops.split('|')

  for (const op of operations) {
    const [name, data] = op.split(':')

    opdata[name] = {}

    if (data) {
      const params = data.split('&')
      for (const param of params) {
        const [key, value] = param.split('=')
        if (opdata[name].hasOwnProperty(key)) {
          if (Array.isArray(opdata[name][key])) {
            opdata[name][key].push(value);
          }
          else {
            const arr = [opdata[name][key], value]
            opdata[name][key] = arr
          }
        }
        else {
          opdata[name][key] = value;
        }
      }
    }
  }

  return opdata;
}


  /*
   * Accepts:
   *   /path/segments
   *   //schemeless.urls.com/path/segments
   *   https?://full.urls.com/path/segments
   */
const parseURLPath = (url) => {

  var fullUrl = false;
  var parsedUrl

  // the URL class wants things to start with a scheme
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }

  // If it does nto start with a scheme it is just a path fragment,
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // Add a fake host for parsing
    parsedUrl = new URL(url, 'https://placeholder.com/');
  }
  else {
    parsedUrl = new URL(url);
    fullUrl = true;
  }

  // Remove the fake host if necessary
  return [fullUrl ? parsedUrl.host : '', parsedUrl.pathname, parsedUrl.search];

}

/**
 * Class representing the redirect functionality.
 * Handles importing and processing of redirect rules from CSV data.
 */
export class redirect extends databases.redirects.rule {
  /**
   * Processes the incoming CSV data and creates redirect rules.
   * @param {Object} data - The request data containing CSV or JSON content.
   * @returns {Object} A summary of the import process.
   */
  async post(data) {

    var json;

    if (data.contentType == 'text/csv') {
      json = Papa.parse(data.data, {
        header: true,
        skipEmptyLines: true
      });
    }
    else {
      json = data
    }

    const results = await this.processRedirects(json.data);

    return {
      message: `Successfully loaded ${results.success} redirects.`,
      skipped: results.skipped
    };
  }

  /**
   * Processes an array of redirect objects.
   * @param {Array} redirects - An array of redirect objects from the CSV.
   * @returns {Object} The results of the processing, including success count and skipped items.
   */
  async processRedirects(redirects) {
    let success = 0;
    const skipped = [];

    const defaultVersion = await this.getCurrentVersion();

    for (const item of redirects) {


      if (!this.validateRedirect(item, skipped)) continue;

      const [ host, path, querystring ] = parseURLPath( item.path )

      item.host = host || item.host
      item.path = path + querystring
      item.version = typeof item.version === 'number' ? item.version : defaultVersion;

      const query = {
        conditions: [
          { attribute: 'path', value: item.path },
          { attribute: 'host', value: item.host },
          { attribute: 'version', value: item.version }]
      }

      const result = []
      for await (const record of databases.redirects.rule.search(query)) {
        result.push(record);
      }

      if (result.length != 0) {
        skipped.push({ reason: 'Duplicate record', item });
      }
      else {
        const postObject = this.createPostObject(item);

        try {
          await databases.redirects.rule.post(postObject);
          success++;
        } catch (e) {
          skipped.push({ reason: e.message, item });
        }
      }
    }

    return { success, skipped };
  }

  /**
   * Validates a single redirect object.
   * @param {Object} item - The redirect object to validate.
   * @param {Array} skipped - An array to store skipped items.
   * @returns {boolean} True if the redirect is valid, false otherwise.
   */
  validateRedirect(item, skipped) {
    if (!item.path) {
      skipped.push({ reason: 'missing path', item });
      return false;
    }
    if (!item.redirectURL) {
      skipped.push({ reason: 'missing redirectURL', item });
      return false;
    }
    if (item.version) {
      const parsed = parseInt(item.version);
      if (isNaN(parsed)) {
        skipped.push({ reason: 'version must be an integer', item });
        return false;
      }
      item.version = parsed;
    }
    return true;
  }

  /**
   * Creates a post object for the redirect rule.
   * @param {Object} item - The redirect item from the CSV.
   * @returns {Object} An object formatted for posting to the database.
   */
  createPostObject(item) {

    var start = parseInt(item.utcStartTime)
    if (isNaN(start)) { start = undefined }
    var end = parseInt(item.utcEndTime)
    if (isNaN(end)) { end = undefined }
    var version = parseInt(item.version)
    if (isNaN(version)) { version = undefined }

    return {
      utcStartTime: start,
      utcEndTime: end,
      path: item.path,
      host: item.host,
      version: version,
      redirectURL: item.redirectURL,
      operations: item.operations,
			statusCode: item.statusCode ? Number(item.statusCode) : 301,
      regex: item.isRegex == 1 ? true : false
		};
	}

  async getCurrentVersion() {
    const conditions = [
      { attribute: 'activeVersion', value: 0, comparator: 'greater_than' }
    ];

    const searchResult = await databases.redirects.version.search(conditions);

    const result = []
    for await (const record of searchResult) {
      result.push(record);
    }

    return result.length == 0 ? checkredirect.DEFAULT_VERSION : result[0].activeVersion
  }


}

const paramToInt = (p, dft) => {
  const i = parseInt(p);
  return Number.isNaN(i) ? dft : i
}

/**
 * Class representing the checkredirect functionality.
 * Handles checking if a given URL has a redirect rule.
 */
export class checkredirect extends databases.redirects.rule {

  static parsePath(path, context, query) {
    return query.get('path') ?? context?.headers?.get('path')
  }

  static DEFAULT_VERSION   = 0
  static DEFAULT_HOST_ONLY = false

  /**
   * Checks if a given URL has a redirect rule.
   * @returns {Object|null} The redirect rule if found, null otherwise.
   */
  async get(query) {
    const context = this.getContext();

    /* Query string parameters take priority */
    var path = this.getId()
    
    var [host,path,qstring] = parseURLPath( path )

    const paramsConfig = {
      qs: { type: 'String', default: ''    },
      v:  { type: 'Int',    default: null  },
      h:  { type: 'String', default: ''    },
      ho: { type: 'Bool',   default: null  },
      t:  { type: 'Int',    default: null  },
      si: { type: 'Bool',   default: false }
    }

    const params  = parseParams( query, paramsConfig )
    const qs      = params.qs
    const version = params.v || await this.getCurrentVersion()
    const t       = params.t
    host          = params.h || host
    var hostOnly  = params.ho
    if ( hostOnly == null ) {
      hostOnly = await this.getHostData( host ) || 0
    }

    if (qs == 'm') {
      path += qstring;
    }

    const searchResult = await this.searchRedirect(path, host, version, hostOnly, t, params.si);

    if (searchResult) {
      var ops = {}

      var finalRedirect = searchResult.redirectURL;

      if (searchResult.operations?.length > 0) {
        ops = parseOperations(searchResult.operations)
      }

      if (ops.hasOwnProperty('qs')) {


        const hasPreserve = ops.qs.hasOwnProperty('preserve');

        const preserve = ops.qs?.preserve == 1 ? true : false;


        if (hasPreserve && ops.qs.preserve == 1) {
          finalRedirect += qstring;
        }
        else if (hasPreserve && ops.qs.preserve == 0) {
          // NOOP
        }
        else if (ops.qs?.filter != undefined) {

          // grap the operation filter args as an array
          const filterArgs = Array.isArray(ops.qs.filter) ? ops.qs.filter : [ops.qs.filter];

          // Parse the query string from the Path (skip the '?') 
          const q = querystring.parse(qstring.slice(1));

          // Remove the desired arguments
          for (const arg of filterArgs) {
            delete q[arg]
          }

          const newqs = querystring.stringify(q);

          if (newqs.length > 0) {
            finalRedirect += '?' + newqs;
          }

        }
      }

      if (searchResult) {
        server.recordAnalytics(true, 'redirect', path, redirect.redirectURL);
      }

      return { ...searchResult, redirectURL: finalRedirect };
    }
    else {
      return null
    }
  }

  async getCurrentVersion() {
    const conditions = [
      { attribute: 'activeVersion', value: 0, comparator: 'greater_than' }
    ];

    const searchResult = await databases.redirects.version.search(conditions);

    const result = []
    for await (const record of searchResult) {
      result.push(record);
    }

    return result.length == 0 ? checkredirect.DEFAULT_VERSION : result[0].activeVersion
  }

  /**
   * Searches for a redirect rule matching the given URL.
   * @param {string} path - The URL to match against.
   * @returns {Object|null} The matching redirect rule if found, null otherwise.
   */
  async searchRedirect(path, host, version, hostOnly, t, ignoreSlash) {

    const path2 = path.endsWith( '/' ) ? path.slice( 0, path.length - 1 ) : path + '/';

    // Get ALL of the redirects that match the path as well as the path variant with
    // or without a slash
    const ignoreSlashConditions = [
        { operator: 'or', conditions: [
          { attribute: 'path', comparator: 'equals', value: path },
          { attribute: 'path', comparator: 'equals', value: path2 },
        ]}
      ];

    const defaultConditions = [
      { attribute: 'path', comparator: 'equals', value: path },
    ];

    const searchResult = await databases.redirects.rule.search(
      { conditions: ignoreSlash ? ignoreSlashConditions : defaultConditions }
    );

    const results = await Array.fromAsync( searchResult )

    let match = false

    // Filter out 
    const filtered = results.filter( row => row.version == version )    // filter out incorrect versions
      .filter( row => !( hostOnly && row.host != host ) )               // filter out hostOnly and host does not match
      .filter( row => !(row.host?.length > 0 && host?.length == 0 ) )   // filter out rows with hosts and no host passed in
      .filter( row => this.isRedirectValid( row, t ) )                  // filter out rows that do not match the right time
      .filter( row => {
        if ( row.host !== host && row.host.length == 0 ) {              // Return rows that don't match the host but the row host is not set
          return true
        }
        if ( row.host === host ) {                                      // Return rows that match the host and record the match
          match = true
          return true
        }
      })
      .filter( row => {
        if ( match && row.host === host ) {                             // Return rows that match the host where there was a match recorded above
          return true
        }
        return !match                                                   // If not match set above, return true
      })


    if ( filtered.length == 1 ) {
      return filtered[0]
    }
    if ( filtered.length == 2 ) {
      const row = filtered.filter( row => row.path === path )
      if ( row ) {
        return row[0]
      }
    }
    

    {
		  const conditions = [
			  { attribute: 'regex', comparator: 'equals', value: true },
		  ];
      const regexSearchResult = await databases.redirects.rule.search(conditions);
      const regexes = await Array.fromAsync( regexSearchResult )

      for ( const regexRecord of regexes ) {
        const re = new RegExp( regexRecord.path )

        if ( path.match(re) ) {
          if (this.isRedirectValid(regexRecord, t)) {
            const newPath = path.replace( re, regexRecord.redirectURL )
            return {
              ...regexRecord,
              redirectURL: newPath
            }
          }
        }
      }
    }

    
    return null;
  }

  /**
   * Checks if a redirect rule is currently valid based on its time constraints.
   * @param {Object} redirect - The redirect rule to check.
   * @returns {boolean} True if the redirect is valid, false otherwise.
   */
  isRedirectValid(redirect, t) {
    const now = t || Math.floor(Date.now() / 1000);

    return (!redirect.utcStartTime || now >= redirect.utcStartTime) &&
      (!redirect.utcEndTime || now <= redirect.utcEndTime);
  }

  async getHostData(host) {
    const conditions = [
      { attribute: 'host', value: host }
    ];

    const searchResult = await databases.redirects.hosts.search(conditions);

    const result = []
    for await (const record of searchResult) {
      result.push(record);
    }

    return result.length == 0 ? checkredirect.DEFAULT_HOST_ONLY : result[0].hostOnly
  }



  /**
   * Removes the domain from a URL, leaving only the path and query.
   * @param {string} url - The full URL.
   * @returns {string} The URL path and query without the domain.
   */
  stripDomain(url) {
    if (!url) return '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return url;
    }
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search;
  }
}

