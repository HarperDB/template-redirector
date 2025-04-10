# Redirector Template

## Overview

The Redirector is a Harper component built to handle large-scale redirect needs. It enhances the performance and scalability of existing redirector applications, supporting use cases that require hundreds of thousands to millions of redirects.


### What is Harper

Harper is a Composable Application Platform that merges database, cache, app logic, and messaging into a single runtime. Components like this plug directly into Harper, letting you build and scale distributed services fast—without managing separate systems. Built for geo-distributed apps with low latency and high uptime by default.


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

1) `git clone https://github.com/HarperDB/template-redirector.git`
2. `cd template-redirector`

3. `harperdb run .`

This assumes you have the Harper stack already [installed]([Install HarperDB | HarperDB](https://docs.harperdb.io/docs/deployments/install-harperdb)) globally.

## Usage

### Endpoints

| Endpoint         | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `/redirect`      | Uploading CSV or JSON files with redriects            |
| `/checkredirect` | Query the redirector for a redirect                   |
| `/rule`          | Direct REST endpoint for the rule table               |
| `/hosts`         | Direct REST endpoint for the rule hosts               |
| `/version`       | Direct REST endpoint for the active version table     |

The Harper REST API gives low level control over your data. The first three endpoints  are component level and provide higher level functionality. The last three enpdoints are direct access to Harper's REST API.  For a full description of what the REST API can do and how to use if your can refer to its [documentation](https://docs.harperdb.io/docs/developers/rest).

### Importing Redirects

Upload a CSV file containing redirect rules to the `/redirect` endpoint:

```
POST /redirect
Content-Type: text/csv

[CSV Data]
```

or JSON

```
POST /redirect
Content-Type: application/json

{ JSON Data }
```

CSV format:

Fields (See `rule` table below for more information):

|Name        |Required|Description                                            |
-------------|---------|------------------------------------------------------|
|utcStartTime|No      |Time in unix epoch seconds to start applying the rule  |
|utcEndTime  |No      |Time in unix epoch seconds to stop applying the rule   |
|path        |Yes     |The path to match on.  This can be the path element of the URL or a full url. If it is the full URL the host will populate the host field below                             |
|redirectURL |Yes     |The path or URL to redirect to                         |
|host        |No      |The host to match on as well as the path. If empty, this rule can apply to any host.  See `ho` below |
|version     |No      |Defaults to the current active version. The version that applies to this rule. See the `version` table below |
|operations  |No      |See `operations` below under the `rule` table |
|statusCode  |Yes     |The status code to return with the redirect (302, 302, 307, etc) |

Example file:

```
utcStartTime,utcEndTime,path,redirectURL,host,version,operations,statusCode
,,/oldpath,/newpath,,,,301
1743120075,1743120135,/oldpath,/newpath,www.example.com,1,qs:perserve=1,302
```

JSON Format:

```
{ "data": [
  { "utcStartTime":"",
    "utcEndTime":"",
    "path":"/shop/live-shopping",
    "host":"",
    "version":"0",
    "redirectURL":"/s/events",
    "operations":"",
    "statusCode":"301" },
]}
```

Here is an example curl command to upload a CSV file:

```
curl http://yourendpoint.com:9926/redirect --header "Content-type: text/csv" --data-binary @data/example.csv
```

Note the use of `--data-binary`.  The `-d` switch will strip the newlines from your CSV file.

### Checking Redirects

To do a simple check if a URL has a redirect:

```
GET /checkredirect
Headers:
  Path: /your/path
```

or

```
GET /checkredirect?path=/your/path
```

The full available parameters are:

| name | type   | description                                                                                                                                                                    |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| path | String | The path portion of the redirect or the full url including scheme and hostname.  If this is a full URL it overrides the `host` parameter if any                                |
| h    | String | Host - The hostname to match on (optional)                                                                                                                                     |
| v    | Int    | Version - The redirect version to match on (optional)                                                                                                                          |
| ho   | Int    | hostOnly - a flag that indicates that whjen a hostname is used, and there is no match for that hostname, whether the global 'no hostname' entried should be checked (optional) |
| t    | Int    | Time - Override the time to this epoch time for testing (optional)                                                                                                             |
| qs   | String | Direction for handling a querystring in the path. `i` == ignore (default) `m` == match (optional)                                                                              |
| si   | Int    | Whether to ignore a terminating slash on a check: /dir and /dir/ will match /dir. 1 == on                                                                                               |

For example, this query:

```
GET /checkredirect?path=/your/path&h=www.example.com&ho=1
```

Will search the rule table for the specified path and hostname.  If there is no match, it will NOT search again for a global entry without a hostname.  This query is equivalent:

```
GET /checkredirect?path=https://www.example.com/your/path&ho=1
```

> [!NOTE]
> 
> If you need to pass in the querystring for matching or copying to the redirect, you mush use the Path header for the path element.  The remaining parameters if used will still go in the query string.

### Per host configuration

The redirector has a table for storing meta information for hosts. It currently support indicating where a host can match on the global non-host specific entries ( those without a hostname ).  This is intended as safety feature to prevent accidentally matching on an unintended redirect.  This can be overridden with the `ho` query attribute.

### Versioning

The redirector supports versioning of the rules. Each rule can take an integer version number with a default of `0`. The intention is to enbale cut-over and roll-back for a large number of redirects at the same time.  The `version` table (schema below) holds the active version.  Updating this table will update the version number that is added to the lookup.  This can be overridded by the `v` query parameter.

### Checking Logic

When checking for a redirect the system will perform checks in this order
- First filter by version
- Then filter by hostname od hostOnly (ho) is true
- Then filter by time constraints
- It will then return the most 'exact' match with exact defined as:
  - Match host first, then path (with or without the flexible end slash handling)
  - Match without host next, then path (with or without the flexible end slash handling)

## Data Model

### Rule Table

The `rule` table in the `redirects` database stores redirect entries with the following structure:

| Name           | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `id`           | Unique identifier (Primary Key)                                |
| `utcStartTime` | Activation start time in epoch (optional)                      |
| `utcEndTime`   | Activation end time in epoch (optional)                        |
| `host`         | The hostname to match for the redirect. '*' for a globla rule. |
| `version`      | The redirect version batch (optional)                          |
| `path`         | Incoming URL path to match                                     |
| `redirectURL`  | URL to redirect to                                             |
| `statusCode`   | HTTP status code for the redirect (default: 301)               |
| `operation`    | Special opertaion on the incoming / outgoign path (see below)  |
| `lastAccessed` | Timestamp of last access                                       |

#### Operations Field

The `operation` field is intended to indicate special handling for the redirect.  The current operations are:

| Operation | Command  | Value  | Decription                                                |
| --------- | -------- | ------ | --------------------------------------------------------- |
| qs        | preserve | 0/1    | 1 == copy QS to redirect. 0 == do not copy QS to redirect |
|           | filter   | qs arg | Name of a qs arg to filter from the copy                  |

`preserve == 0` and the use of `filter` are mutually exclusive.  `filter` implies the use of `preserve=1`

Example: Remove arg2 from the copied output

```
qs:filter=arg2
```

Example: Remove arg2 and arg3 from the copied output

```
qs:filter=arg2&filter=arg3
```

Example: Copy the incomming query string to the redirect

```
qs:preserve=1
```

### Version table

The `version` table in the `redirect` database stores the active version. This is intended to be a single row table 

- `activeVersion`: The integer version number that should be active

### Host Table

The `hosts` table in the `redirect` database stores the per host information.

- `host`: The version code (Primary Key)
- `hostOnly`: A boolean that determines if a rules without a hostname can be applied to this host

## API Endpoints

1. `POST /redirect`: Import redirect rules from CSV
2. `GET /checkredirect`: Check if a URL has a redirect
3. `GET /redirectmetrics`: Retrieve redirect usage metrics

## Harper Endpoints

The Harper REST API give low level control over your data.  The above calls are component level and provide higher
level functionality. For a full description of what the REST API can do and how to use if your can refer to
its [documentaion](https://docs.harperdb.io/docs/developers/rest)

### Create

> [!NOTE]
> 
> These examples for creating records in the rule are illustrative only.  Please use the `/redirect` endpoing for adding redirects.

```
POST /rule
Content-type: application/json
Content-length: <CL of body>

{"path":"/foo","redirectURL":"/bar","statusCode":304}        
```

```
POST /version
Content-type: application/json
Content-length: <CL of body>

{"activeVersion":2}
```

```
POST /hosts
Content-type: application/json
Content-length: <CL of body>

{"host":"www.example.com","hostOnly":1}
```

### Read

```
GET /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
GET /rule/?path=/d/shoes/
GET /hosts/?host=www.example.com
```

### Update

```
PUT /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
Content-type: application/json
Content-length: <CL of body>

{"path":"/p/shoes/","redirectURL":"/shop/shoes?id=1236","statusCode":304'}
```

```
PUT /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
Content-type: application/json
Content-length: <CL of body>

{"currentVersion":3}
```

### Delete

```
DELETE /rule/35a1cb2d-5c99-4172-9e3c-c40639d138b5
DELETE /rule/?path=/p/shoes/
DELETE /rule/?path==*
```

## Testing

The file `test/redirector-test.js` has regression tests with the intention of covering all of that above API calls. Run them with:

```
node --test
```

The test uses a `.env` file at the componet root for configuration:

| Field    | Description                                |
| -------- | ------------------------------------------ |
| HOST     | The host:port to connect to                |
| SCHEME   | http or https                              |
| AUTH     | Should HTTP Basic auth be sent? true/false |
| USERNAME | The username for basic auth                |
| PASSWORD | The passowrd for basic auth                |

### Production Environment (Recommended)

TBD
