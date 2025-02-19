# Redirector Tenplate

## Overview

The Redirector is a Harper component designed provide or to enhance and scale 
existsing redirector aplications. This solution aims to support customers requiring hundreds of 
thousands to millions of redirects, offering improved performance and scalability.

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

### Observability

The application records metrics associated with the redirect action, accessible via the `/redirectmetrics` endpoint.

## Usage

### Endpoints

| Endpoint         | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `/redirect`      | Uploading CSV or JSON files with redriects            |
| `/checkredirect` | Query the redirector for a redirect                   |
| `/checkmetrics`  | Get the usages of redirects (default past 90 seconds) |
| `/rule`          | Direct REST endpoint for the rule table               |
| `/hosts`         | Direct REST endpoint for the rule hosts               |
| `/version`       | Direct REST endpoint for the active version table     |

The Harper REST API give low level control over your data. The first three endpoints  are component level and provide higher level functionality. The last three enpdoints are direct access to Harper's REST API.  For a full description of what the REST API can do and how to use if your can refer to its [documentation](https://docs.harperdb.io/docs/developers/rest).

### Importing Redirects

Upload a CSV file containing redirect rules to the `/redirect` endpoint:

```
POST /redirect
Content-Type: text/csv

[CSV Data]
```

or 

```
POST /redirect
Content-Type: application/json

{ JSON Data }
```

CSV format:

```
utcStartTime,utcEndTime,path,redirectURL,host,version,statusCode
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

|name|type|description|
|----|----|-----------|
|path|String|The path portion of the redirect or the full url including scheme and hostname.  This overrides the `host` parameter|
|h|String|Host - The hostname to match on (optional)|
|v|Int|Version - The redirect version to match on (optional)|
|ho|Int|hostOnly - a flag that indicates that whjen a hostname is used, and there is no match for that hostname, whether the global 'no hostname' entried should be checked (Optional)|
|t|Int|Time - Override the time to this epoch time for testing|
|qs|String|Direction for handling a querytring in the path. `i` == ignore|

For example, this query:
```
GET /checkredirect?path=/your/path&h=www.example.com&ho=1
```
Will search the rule table for the specified path and hostname.  If there is no match, it will NOT search again for a global entry without a hostname.  This query is equivalent:

```
GET /checkredirect?path=https://www.example.com/your/path&ho=1
```

### The hosts table (Optional)
The redirector has a table for storing meta information for hosts. It currently support indicating where a host can match on the global non-host specific entries ( those without a hostname ).  This is intended as safety feature to prevent accidentally matching on an untended redirect.  This can be overridden with the `ho` query attribute.

### Versioning (Optional)
The redirector supports versioning of the rules. Each rule can take an integer version number with a default of `0`. The intention is to enbale cut-over and roll-back for a large number of redirects at the same time.  The `version` table (schema below) holds the active version.  Updating this table will update the version number that is added to the lookup.  This can be overridded by the `v` query parameter.

### Viewing Metrics

Access redirect usage metrics:

```
GET /redirectmetrics
```

## Data Model

### Rule Table

The `rule` table in the `redirects` database stores redirect entries with the following structure:

|Name          |Description                                                       |
|--------------|------------------------------------------------------------------|
|`id`          |Unique identifier (Primary Key)                                   |
|`utcStartTime`|Activation start time in epoch (optional)                         |
|`utcEndTime`  |Activation end time in epoch (optional)                           |
|`host`        |The hostname to match for the redirect. '*' for a globla rule.    |
|`version`     |The redirect version batch (optional)                             |
|`path`        |Incoming URL path to match                                        |
|`redirectURL` |URL to redirect to                                                |
|`statusCode`  |HTTP status code for the redirect (default: 301)                  |
|`operation`   |Special opertaion on the incoming / outgoign path (see below)     |
|`lastAccessed`|Timestamp of last access                                          |

#### Operations Field

The `operation` field is intended to indicate special handling for the redirect.  The current operations are:
`qs`: preserve(p) / strip(s) / filter(f=param)

|Operation|Command |Value   |Decription                                                  |
|---------|--------|--------|------------------------------------------------------------|
|qs       |preserve| 0/1    | 1 == copy QS to redirect. 0 == do not copy QS to redirect  |
|         |filter  | qs arg | Name of a qs arg to filter from the copy                   |

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

|Field|Description|
|-----|-----------|
|HOST|The host:port to connect to|
|SCHEME|http or https|
|AUTH|Should HTTP Basic auth be sent? true/false|
|USERNAME|The username for basic auth|
|PASSWORD|The passowrd for basic auth|

### Production Environment (Recommended)

TBD
