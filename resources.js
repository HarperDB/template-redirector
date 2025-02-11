import Papa from 'papaparse';
import { URL } from 'node:url';

const { hdb_analytics } = databases.system;

import util from 'util';

/*

for checking:
- request comes in
- From the request we get:
  - path
  - version (optional)
  - hostOnly
- path is parsed for path and hostname
- active version is looked up.
- host details are looked up  
- 









 */

/**
 * Class representing the redirect functionality.
 * Handles importing and processing of redirect rules from CSV data.
 */
export class redirect extends databases.redirects.rule {
	/**
	 * Processes the incoming CSV data and creates redirect rules.
	 * @param {Object} data - The request data containing CSV content.
	 * @returns {Object} A summary of the import process.
	 */
	async post(data) {

    const json = Papa.parse(data.data, {
			header: true,
			skipEmptyLines: true
		});

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

		for (const item of redirects) {
      
			if (!this.validateRedirect(item, skipped)) continue;

			item.redirectURL = this.stripDomain(item.redirectURL);

      const query = { conditions: [
        { attribute: 'path',    value: item.path },
        { attribute: 'host',    value: item.host },
        { attribute: 'version', value: item.version } ] }
      
      const result = []
	    for await (const record of databases.redirects.rule.search( query )) {
		    result.push(record);
	    }

      if ( result.length != 0 ) {
        skipped.push( { reason: "Duplicate record", item } );
      }
      else {
			  const postObject = this.createPostObject(item);

        console.log( postObject )


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
		return true;
	}

	/**
	 * Creates a post object for the redirect rule.
	 * @param {Object} item - The redirect item from the CSV.
	 * @returns {Object} An object formatted for posting to the database.
	 */
	createPostObject(item) {
		return {
			utcStartTime: item.utcStartTime ? item.utcStartTime * 1000 : undefined,
			utcEndTime: item.utcEndTime ? item.utcEndTime * 1000 : undefined,
			path: item.path,
			host: item.host,
			version: parseInt(item.version),
			redirectURL: item.redirectURL,
			statusCode: item.statusCode ? Number(item.statusCode) : 301,
		};
	}

	/**
	 * Removes the domain from a URL, leaving only the path and query.
	 * @param {string} url - The full URL.
	 * @returns {string} The URL path and query without the domain.
	 */
	stripDomain(url) {
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return url;
		}
		const parsedUrl = new URL(url);
		return parsedUrl.pathname + parsedUrl.search;
	}
}

/**
 * Class representing the checkredirect functionality.
 * Handles checking if a given URL has a redirect rule.
 */
export class checkredirect extends Resource {

  static DEFAULT_VERSION   = 0
  static DEFAULT_HOST_ONLY = false
  
  /**
	 * Checks if a given URL has a redirect rule.
	 * @returns {Object|null} The redirect rule if found, null otherwise.
	 */
	async get(query) { 
		const context = this.getContext();

    console.log( query )


    /* Query string parameters take priority */
    var path = query.get("path") ?? context?.headers?.get('path') ?? ''
    
    var [host,path] = this.parsePath( path )

    const qv = parseInt(query.get("v"));
    const version = Number.isNaN(qv) ? await this.getCurrentVersion() : qv
    host = query.get("h") ?? host;
    const hostOnly  = query.get("ho") == 1 ?? await this.getHostData( host )

    console.log( `hostOnly = ${hostOnly}` )


    const searchResult = await this.searchRedirect(path, host, version, hostOnly);

		if (searchResult) {
			await this.recordRedirect(searchResult, path);
		}

		return searchResult;
	}

	/**
	 * Searches for a redirect rule matching the given URL.
	 * @param {string} path - The URL to match against.
	 * @returns {Object|null} The matching redirect rule if found, null otherwise.
	 */
	async searchRedirect(path, host, version, hostOnly) {
		const conditions = [
			{ attribute: 'path', comparator: 'equals', value: path },
			{ attribute: 'host', comparator: 'equals', value: host },
			{ attribute: 'version', comparator: 'equals', value: version },
		];

    console.log( host.length )


    if ( host.length > 0 && ! hostOnly ) {

      console.log( "HERTE" )


      conditions.push( { operator: 'or', conditions: [
			  { attribute: 'path', comparator: 'equals', value: path },
			  { attribute: 'host', comparator: 'equals', value: '' },
			  { attribute: 'version', comparator: 'equals', value: version },
	    ]} )
    }

    console.log(util.inspect(conditions, { depth: null }));
    //    console.log( conditions )

		const searchResult = await databases.redirects.rule.search(conditions);

		for await (const r of searchResult) {
			if (this.isRedirectValid(r)) {
				return r;
			}
		}

		return null;
	}

	/**
	 * Checks if a redirect rule is currently valid based on its time constraints.
	 * @param {Object} redirect - The redirect rule to check.
	 * @returns {boolean} True if the redirect is valid, false otherwise.
	 */
	isRedirectValid(redirect) {
		const now = Date.now();
		return (!redirect.utcStartTime || now >= redirect.utcStartTime) &&
			(!redirect.utcEndTime || now <= redirect.utcEndTime);
	}

	/**
	 * Records analytics for a successful redirect and updates the last accessed time.
	 * @param {Object} redirect - The redirect rule that was matched.
	 * @param {string} path - The URL that was matched.
	 */
	async recordRedirect(redirect, path) {
		server.recordAnalytics(true, 'redirect', path, redirect.redirectURL);
		if (!redirect.lastAccessed || redirect.lastAccessed <= Date.now() - (30 * 1000)) {
			await databases.redirects.rule.patch({ id: redirect.id, lastAccessed: Date.now() });
		}
	}

  async getHostData( host ) {

    const conditions = [
      { attribute: 'host', value: host }
		];

    console.log( conditions )


		const searchResult = await databases.redirects.hosts.search(conditions);

    const result = []
	  for await (const record of searchResult ) {
		  result.push(record);
	  }

    console.log( result )

    return result.length == 0 ? checkredirect.DEFAULT_HOST_ONLY : result[0].hostOnly
  }
  
  async getCurrentVersion() {

    const conditions = [
      { attribute: 'activeVersion', value: 0, comparator: 'greater_than' }
		];



		const searchResult = await databases.redirects.version.search(conditions);

    const result = []
	  for await (const record of searchResult ) {
		  result.push(record);
	  }

    console.log( result )

    return result.length == 0 ? checkredirect.DEFAULT_VERSION : result[0].activeVersion






  }
  
  /*
   * Accepts:
   *   /path/segments
   *   //schemeless.urls.com/path/segments
   *   https?://full.urls.com/path/segments
   */
  parsePath(url) {
    // the URL class wants things to start with a scheme
    if ( url.startsWith('//') ) {
      url = 'https:' + url;
    }

    // If it does nto start with a scheme it is just a path fragment
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
			return ["",url];
		}

		const parsedUrl = new URL(url);

    
    
		return [parsedUrl.host, parsedUrl.pathname + parsedUrl.search];
    
    
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

/**
 * Class representing the redirectmetrics functionality.
 * Handles retrieval of redirect usage metrics.
 */
export class redirectmetrics extends Resource {

  // The default condition is to filter on the redirect metrics added in
  // the past 90 seconds
  baseConditions() {
	  return [
		  { attribute: 'metric', value: 'redirect', comparator: 'equals' },
		  { attribute: 'id', value: [Date.now() - (90 * 1000), Date.now()], comparator: 'between' }
	  ];
  }

	/**
	 * Retrieves redirect metrics based on the provided query.
	 * @param {Object} query - The query parameters for filtering metrics.
	 * @returns {Array} An array of metric objects matching the query.
	 */
  async get(query) {
		return hdb_analytics.search({ conditions: this.baseConditions() });
	}

  async post(query) {
		if (query?.conditions) {
      query.conditions.push(this.baseConditions()[0]);
			return hdb_analytics.search(query);
		} else {
			return hdb_analytics.search({ conditions: this.baseConditions() });
		}
	}

}
