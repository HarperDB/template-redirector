# Redirector Template

## Overview

The Redirector is a Harper component built to handle large-scale redirect needs. It enhances the performance and scalability of existing redirector applications, supporting use cases that require hundreds of thousands to millions of redirects. See below [Performance](#performance-test-results) for test results.

### What is Harper

Harper is a Composable Application Platform that merges database, cache, app logic, and messaging into a single runtime. Components like this plug directly into Harper, letting you build and scale distributed services fast, without managing separate systems. Built for geo-distributed apps with low latency and high uptime by default.

## Features

- CSV and JSON based redirect rule import
- Efficient redirect lookup
- Time-based redirect activation
- Redirect usage analytics
- GraphQL schema for flexible querying

## Technical Details

### Administration

Customers can administer their redirect database by uploading a CSV of their redirects via the `/redirect` endpoint as well as
by using the Harper REST API against the tables.

### Query

Querying is as simple as sending a GET to `/checkredirect` with the path to match in the query string or Path header.

### Observability

The application records metrics associated with the redirect action.

## Getting Started

1. `git clone https://github.com/HarperDB/template-redirector.git`
2. `cd template-redirector`
3. `harperdb run .`

This assumes you have the Harper stack already [installed]([Install HarperDB | HarperDB](https://docs.harperdb.io/docs/deployments/install-harperdb)) globally.

## Usage

### Endpoints

| Endpoint           | Description                                       |
| ------------------ | ------------------------------------------------- |
| `/redirect`        | Uploading CSV or JSON files with redriects        |
| `/checkredirect`   | Query the redirector for a redirect               |
| `/redirectmetrics` | Redirector usage metrics from last 60 seconds     |
| `/rule`            | Direct REST endpoint for the rule table           |
| `/hosts`           | Direct REST endpoint for the hosts table          |
| `/version`         | Direct REST endpoint for the active version table |

The Harper REST API gives low level control over your data. The first two endpoints are component level and provide higher level functionality. The last three enpdoints are direct access to Harper's REST API. For a full description of what the REST API can do and how to use if your can refer to its [documentation](https://docs.harperdb.io/docs/developers/rest).

### Importing Redirects

Upload a CSV file containing redirect rules to the `/redirect` endpoint:

```bash
POST /redirect
Content-Type: text/csv

[CSV Data]
```

or JSON

```bash
POST /redirect
Content-Type: application/json

{ JSON Data }
```

CSV format:

Fields (See `rule` table below for more information):

| Name         | Required | Description                                                                                                                                    |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| utcStartTime | No       | Time in unix epoch seconds to start applying the rule                                                                                          |
| utcEndTime   | No       | Time in unix epoch seconds to stop applying the rule                                                                                           |
| path         | Yes      | The path to match on. This can be the path element of the URL or a full url. If it is the full URL the host will populate the host field below |
| redirectURL  | Yes      | The path or URL to redirect to                                                                                                                 |
| host         | No       | The host to match on as well as the path. If empty, this rule can apply to any host. See `ho` below                                            |
| version      | No       | Defaults to the current active version. The version that applies to this rule. See the `version` table below                                   |
| operations   | No       | See `operations` below under the `rule` table                                                                                                  |
| statusCode   | Yes      | The status code to return with the redirect (302, 302, 307, etc)                                                                               |
| regex        | No       | 1 == `path` is a regex. Default is `0`                                                                                                         |

Example file:

```bash
utcStartTime,utcEndTime,path,redirectURL,host,version,operations,statusCode,regex
,,/oldpath,/newpath,,,,301,0
1743120075,1743120135,/oldpath,/newpath,www.example.com,1,qs:perserve=1,302,0
,,/oldpath/*,/newpath/,,qs:preserve=0,301,1
```

JSON Format:

```json
{
	"data": [
		{
			"utcStartTime": "",
			"utcEndTime": "",
			"path": "/shop/live-shopping",
			"host": "",
			"version": "0",
			"redirectURL": "/s/events",
			"operations": "",
			"statusCode": "301",
			"regex": 0
		}
	]
}
```

Here is an example curl command to upload a CSV file:

```bash
curl http://yourendpoint.com:9926/redirect --header "Content-type: text/csv" --data-binary @data/example.csv
```

Note the use of `--data-binary`. The `-d` switch will strip the newlines from your CSV file.

### Checking Redirects

To do a simple check if a URL has a redirect:

```bash
GET /checkredirect
Headers:
  Path: /your/path
```

or

```bash
GET /checkredirect?path=/your/path
```

The full available parameters are:

| name | type   | description                                                                                                                                                                   |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| path | String | The path portion of the redirect or the full url including scheme and hostname. If this is a full URL it overrides the `host` parameter if any                                |
| h    | String | Host - The hostname to match on (optional)                                                                                                                                    |
| v    | Int    | Version - The redirect version to match on (optional)                                                                                                                         |
| ho   | Int    | hostOnly - a flag that indicates that when a hostname is used, and there is no match for that hostname, whether the global 'no hostname' entries should be checked (optional) |
| t    | Int    | Time - Override the time to this epoch time for testing (optional)                                                                                                            |
| qs   | String | Direction for handling a querystring in the path. `i` == ignore or `m` == match (default) (optional)                                                                          |
| si   | Int    | Whether to ignore a terminating slash on a check: /dir and /dir/ will match /dir. 1 == on (default is 0 / off)                                                                |

For example, this query:

```bash
GET /checkredirect?path=/your/path&h=www.example.com&ho=1
```

Will search the rule table for the specified path and hostname. If there is no match, it will NOT search again for a global entry without a hostname. This query is equivalent:

```bash
GET /checkredirect?path=https://www.example.com/your/path&ho=1
```

> [!NOTE]
> Options for passing in query strings with the path
>
> 1. /checkdirect/{fullUrl_with_querystring}.
>
> - All other params will **not** be applied with this option

```bash
GET /checkdirect/https://www.example.com/page-name?key=val&arg=val2
```

> 2. /checkdirect?path={url_no_querystring}.
>
> - Path specific query string added to `x-query-string` header
> - All other params will still go in the query string

```
GET /checkdirect?path=/page-name&h=www.example.com
```

> 3. /checkdirect?{other_params}
>
> - Path goes in `Path` header (ex: 'path': '/page-name')
> - Path specific query string added to `x-query-string` header (ex: 'x-query-string': '?key=var&arg=val2)
> - All other params will still go in the query string

```bash
GET /checkdirect?h=www.example.com&ho=1
```

> 4. /checkdirect?{other_params}
>
> - Path goes in `Path` header with query string (ex: 'path': '/page-name?key=var&arg=val2)
> - All other params will still go in the query string

```bash
GET /checkdirect?h=www.example.com&ho=1
```

### Per host configuration

The redirector has a table for storing meta information for hosts. It currently supports indicating where a host can match on the global non-host specific entries ( those without a hostname ). This is intended as safety feature to prevent accidentally matching on an unintended redirect. This can be overridden with the `ho` query attribute.

### Versioning

The redirector supports versioning of the rules. Each rule can take an integer version number with a default of `0`. The intention is to enable cut-over and roll-back for a large number of redirects at the same time. The `version` table (schema below) holds the active version. Updating this table will update the version number that is added to the lookup. This can be overridded by the `v` query parameter.

### Checking Logic

When checking for a redirect the system will perform checks in this order

- First filter by version
- Then filter by hostname if hostOnly (ho) is true
- Then filter by time constraints
- It will then return the most 'exact' match with exact defined as:
  - Match host first, then path (with or without the flexible end slash handling and query string)
  - Match without host next, then path (with or without the flexible end slash handling and query string)
- If there is still no match, the defined regular expressions will be used

### Getting Redirect Metrics

The `/redirectmetrics` endpoint provides multiple options for viewing usage and timing data for a rolling 60 second window:

1. Get usage metrics for each path URL:

```bash
GET /redirectmetrics
or
GET /redirectmetrics?type=redirect
```

2. Get timing metrics for search portion of `GET /checkredirect` request

```bash
GET /redirectmetrics?type=redirect-search-timing
```

3. Get timing metrics for for full `GET /checkredirect` request timing

```bash
GET /redirectmetrics?type=redirect-timing
```

4. Get timing metrics for full `POST /redirect` request timing

```bash
GET /redirectmetrics?type=redirect-upload-timing
```

5. Get timing metrics for individual redirect item processing portion of `POST /redirect` request

```bash
GET /redirectmetrics?type=redirect-upload-process-timing
```

## Data Model

### Rule Table

The `rule` table in the `redirects` database stores redirect entries with the following structure:

| Name           | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `id`           | Unique identifier (Primary Key)                                 |
| `utcStartTime` | Activation start time in epoch (optional)                       |
| `utcEndTime`   | Activation end time in epoch (optional)                         |
| `host`         | The hostname to match for the redirect. '\*' for a globla rule. |
| `version`      | The redirect version batch (optional)                           |
| `path`         | Incoming URL path to match                                      |
| `redirectURL`  | URL to redirect to                                              |
| `statusCode`   | HTTP status code for the redirect (default: 301)                |
| `operation`    | Special operation on the incoming / outgoing path (see below)   |
| `regex`        | Boolean flas that indicated the `path` is a regex               |
| `regexPrefix`  | Extracted path prefix for improved regex matching performance   |

#### `path` and `redirectURL` field

The `path` field can either be a literal match or a regular expression. If the `regex` field is `true`, `path` will be interpreted as a regex. The regex can perform normal match capturing which can then be used in the redirectURL. This is effectively `/path/replacementURL/` if `/path/` matches the incomming URL. This is currently a single match / replacement. For example, if you have a `path` defined as:

```bash
/foo/(.*)
```

and a redirectURL as:

```bash
/bar/$1
```

`/foo/index.html` will be redirected to `/bar/index.html`

#### Operations Field

The `operation` field is intended to indicate special handling for the redirect. The current operations are:

| Operation | Command  | Value  | Decription                                                |
| --------- | -------- | ------ | --------------------------------------------------------- |
| qs        | preserve | 0/1    | 1 == copy QS to redirect. 0 == do not copy QS to redirect |
|           | filter   | qs arg | Name of a qs arg to filter from the copy                  |

`preserve` and `filter` are mutually exclusive. Use of `preserve` ignores `filter`:

- `preserve=0` no qs is included
- `preserve=1` the full qs is included
- `filter` portions of qs are included

Example: Remove arg2 from the copied output

```bash
qs:filter=arg2
```

Example: Remove arg2 and arg3 from the copied output

```bash
qs:filter=arg2&filter=arg3
```

Example: Copy the incomming query string to the redirect

```bash
qs:preserve=1
```

### Hosts Table

| **Name**   | **Description**                                       |
| ---------- | ----------------------------------------------------- |
| `id`       | Unique identifier for the host entry.                 |
| `host`     | The host name for the redirect (optional).            |
| `hostOnly` | The path to redirect to (indexed for faster lookups). |

### Version Table

| **Name**        | **Description**                          |
| --------------- | ---------------------------------------- |
| `id`            | Unique identifier for the version entry. |
| `activeVersion` | currently active version number          |

## API Endpoints

1. `POST /redirect`: Import redirect rules from CSV
2. `GET /checkredirect`: Check if a URL has a redirect
3. `GET /redirectmetrics`: Retrieve redirect usage and timing metrics from last 60 seconds

## Harper Endpoints

The Harper REST API give low level control over your data. The above calls are component level and provide higher
level functionality. For a full description of what the REST API can do and how to use if your can refer to
its [documentaion](https://docs.harperdb.io/docs/developers/rest)

### Create

> [!NOTE]
>
> These examples for creating records in the rule are illustrative only. Please use the `/redirect` endpoing for adding redirects.

```bash
POST /rule
Content-type: application/json
Content-length: <CL of body>

{"path":"/foo","redirectURL":"/bar","statusCode":304}
```

```bash
POST /version
Content-type: application/json
Content-length: <CL of body>

{"activeVersion":2}
```

```bash
POST /hosts
Content-type: application/json
Content-length: <CL of body>

{"host":"www.example.com","hostOnly":1}
```

### Read

```bash
GET /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
GET /rule/?path=/d/shoes/
GET /hosts/?host=www.example.com
```

### Update

```bash
PUT /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
Content-type: application/json
Content-length: <CL of body>

{"path":"/p/shoes/","redirectURL":"/shop/shoes?id=1236","statusCode":304'}
```

```bash
PUT /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
Content-type: application/json
Content-length: <CL of body>

{"currentVersion":3}
```

### Delete

```bash
DELETE /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
DELETE /rule/?path=/p/shoes/
DELETE /rule/?path==*
```

## Testing

The file `test/redirector-test.js` has regression tests with the intention of covering all of that above API calls. Run them with:

```bash
node --test
```

The test uses a `.env` file at the component root for configuration:

| Field    | Description                                            |
| -------- | ------------------------------------------------------ |
| HOST     | The host to connect to                                 |
| PORT     | The port to use for normal HTTP calls (443, 9926, etc) |
| SCHEME   | http or https                                          |
| AUTH     | Should HTTP Basic auth be sent? true/false             |
| USERNAME | The username for basic auth                            |
| PASSWORD | The password for basic auth                            |

## Performance Test Results

### Performance Thresholds

Performance testing was conducted using k6 to determine maximum sustainable throughput for two redirect rule types with a p95 latency target of <100ms.

## Results Summary

| Rule   | Max Sustainable RPS | P95 Latency at Max RPS |
| ------ | ------------------- | ---------------------- |
| Static | 2,000               | 23.19ms                |
| Regex  | 1,700               | 66.54ms                |

**Key Findings:**

- **Static Rules**: Successfully maintained p95 <100ms at maximum tested load of 2,000 RPS
- **Regex Rules**: Threshold crossed at 1,900 RPS (132ms p95), max sustainable capacity is 1,700 RPS
