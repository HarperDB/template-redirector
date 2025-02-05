# [Customer] Redirector

There has been [work](https://github.com/HarperDB/Component-ReadMe-Template/blob/main/component-readme-template.md) started to document external component.  
This documetn has not yet integrated those ideas.  But it should.

## Overview

The Redirector is a HarperDB component designed to enhance and scale the 
Akamai Redirector Cloudlet product. It addresses the limitations of Akamai's 5,000 rule limit 
and performance issues associated with top-down rule execution. 
This solution aims to support customers requiring hundreds of thousands to millions 
of redirects, offering improved performance and scalability.

> [!NOTE]
> Do we want to reference the Akamai component here?  This really is a standalone component


## Features

- CSV-based redirect rule import
- Efficient redirect lookup
- Time-based redirect activation
- Redirect usage analytics
- GraphQL schema for flexible querying

## Requirements

> [!NOTE]
> From a pure extrenal component standpoint this section is not needed.  INternally for planning
> obviously it is.

- Request rate (r/s): What request rate is expected
- Number of redirects: What is the raw number of redirect entries 
- Redirect type: Straight matches, regexes, etc
- Total data size on disk: Disk footprint for the data
- TTL for records (if applicable): How will they expire?
- Customer distribution (for regions): Europe, NA, global?
- Sample data: TBD
- Sample queries: TBD
- DB architecture requirements (schema etc): TBD
- Success criteria: TBD


## Technical Details

### Use Case

> [!NOTE]
> Again, remove Akamai references?

The solution improves upon Akamai's Redirector Cloudlet, which has a 5,000 item limit 
per cloudlet and requires workarounds for handling a large number of redirects.

### Flow

> [!NOTE]
> Again, remove Akamai references?

1. The inbound client request for a URL enters Akamai's network.
2. The request reaches an EdgeWorker.
3. The EdgeWorker calls out to HarperDB `/checkredirect` endpoint to check for a specific URL redirect entry.
4. If found, it returns the new URL to the EdgeWorker, along with the redirect type (301, 302).
5. If not found, it returns false.
6. The EdgeWorker either returns the redirect to the browser or passes the request to Akamai's Redirector Cloudlet for regex and query param matches.

### Administration

Customers can administer their redirect database by uploading a CSV of their redirects via the `/redirect` endpoint as well as
by using the Harper REST API against the tables.

### Observability

The application records metrics associated with the redirect action, accessible via the `/redirectmetrics` endpoint.

## Usage

> [!NOTE]
> Adding a link to a postman connection, even an export could be very useful

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

{ "data": "[JSON Wrapped CSV file]" }
```

CSV format:
```
utcStartTime,utcEndTime,path,redirectURL,statusCode
```

Here is an example curl command to upload a CSV file:
```
curl http://yourendpoint.com:9926/redirect --header "Content-type: text/csv" --data-binary @data/example.csv
```

Note the use of `--data-binary`.  The `-d` switch will strip the newlines from your CSV file.


### Checking Redirects

To check if a URL has a redirect:

```
GET /checkredirect
Headers:
  path: /your/path
```
or
```
GET /checkredirect?path=/your/path
```

### Viewing Metrics

Access redirect usage metrics:

```
GET /redirectmetrics
```

## Data Model

The `rule` table in the `redirects` database stores redirect entries with the following structure:

- `id`: Unique identifier (Primary Key)
- `utcStartTime`: Activation start time (optional)
- `utcEndTime`: Activation end time (optional)
- `path`: Incoming URL path to match
- `redirectURL`: URL to redirect to
- `statusCode`: HTTP status code for the redirect (default: 301)
- `lastAccessed`: Timestamp of last access

## API Endpoints

> [!NOTE]
> These are the higer level functions that justify the existiance of the component.  They provide functionality beyond what
> can simply be done in a REST call

1. `POST /redirect`: Import redirect rules from CSV
2. `GET /checkredirect`: Check if a URL has a redirect
3. `GET /redirectmetrics`: Retrieve redirect usage metrics

## Harper Endpoints

> [!NOTE]
> These are all generic Harper REST calls. I think it is important to complete the CRUD picture showing how to manage the data here.
> The calls are not complete. Merely placeholders at the moment

### Create

```
POST /rule         
```

### Read
```
GET /rule/[ID]
```

### Update
```
PUT /rule/[ID]
```

### Delete
```
DELETE /rule/[ID]
DELETE /rule/?property=value
```

## [Customer] Infrastructure

> [!NOTE]
> This section is unnecessary for an external component

### Pilot Environment

- TBD
- Akamai GTM (DNS load balancer) Ingress URL: TBD
- Akamai EdgeWorker Ingress URL: TBD

### Production Environment (Recommended)

TBD
