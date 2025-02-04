# [Customer] Redirector

## Overview

The Redirector is a HarperDB component designed to enhance and scale the 
Akamai Redirector Cloudlet product. It addresses the limitations of Akamai's 5,000 rule limit 
and performance issues associated with top-down rule execution. 
This solution aims to support customers requiring hundreds of thousands to millions 
of redirects, offering improved performance and scalability.

## Features

- CSV-based redirect rule import
- Efficient redirect lookup
- Time-based redirect activation
- Redirect usage analytics
- GraphQL schema for flexible querying

## Requirements

- Request rate (r/s):
- Number of redirects: 
- Redirect type: 
- Total data size on disk: 
- TTL for records (if applicable): 
- Customer distribution (for regions): 
- Sample data: 
- Sample queries:
- DB architecture requirements (schema etc):
- Success criteria:


## Technical Details

### Use Case

The solution improves upon Akamai's Redirector Cloudlet, which has a 5,000 item limit 
per cloudlet and requires workarounds for handling a large number of redirects.

### Flow

1. The inbound client request for a URL enters Akamai's network.
2. The request reaches an EdgeWorker.
3. The EdgeWorker calls out to HarperDB `/checkredirect` endpoint to check for a specific URL redirect entry.
4. If found, it returns the new URL to the EdgeWorker, along with the redirect type (301, 302).
5. If not found, it returns false.
6. The EdgeWorker either returns the redirect to the browser or passes the request to Akamai's Redirector Cloudlet for regex and query param matches.

### Administration

Customers can administer their redirect database by uploading a CSV of their redirects via the `/redirect` endpoint.

### Observability

The application records metrics associated with the redirect action, accessible via the `/redirectmetrics` endpoint.

## Usage

### Importing Redirects

Upload a CSV file containing redirect rules to the `/redirect` endpoint:

```
POST /redirect
Content-Type: application/json

{ "data": "[JSON Wrapped CSV file]" }
```

CSV format:
```
utcStartTime,utcEndTime,path,redirectURL,statusCode
```

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

1. `POST /redirect`: Import redirect rules from CSV
2. `GET /checkredirect`: Check if a URL has a redirect
3. `GET /redirectmetrics`: Retrieve redirect usage metrics

## Harper Endpoints

1. `DELETE /rule/[ID]`
2. `DELETE /rule/?property=value`

## [Customer] Infrastructure

### Pilot Environment

- TBD
- Akamai GTM (DNS load balancer) Ingress URL: TBD
- Akamai EdgeWorker Ingress URL: TBD

### Production Environment (Recommended)

TBD
