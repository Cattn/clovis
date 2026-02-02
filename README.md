# Clovis Flight API

A REST API for searching Google Flights, built with ElysiaJS and Bun.

## Quick Start

```bash
bun install
bun run dev
```

Server runs at `http://localhost:3000`

---

## Endpoints

### `GET /`
Returns API info and available endpoints.

**Response:**
```json
{
  "name": "Clovis Flight API",
  "version": "1.0.0",
  "endpoints": [...]
}
```

---

### `GET /token`
Fetches fresh authentication tokens from Google Flights.

**Response:**
```json
{
  "success": true,
  "data": {
    "sid": "-1234567890",
    "bl": "boq_travel-frontend-ui_..."
  }
}
```

---

### `GET /flights/search/roundTrip`
Search for round-trip flights between two airports.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from` | string | ✅ | - | Origin airport code (e.g., `PBI`) |
| `to` | string | ✅ | - | Destination airport code (e.g., `LAS`) |
| `departDate` | string | ❌ | +7 days | Departure date (`YYYY-MM-DD`) |
| `returnDate` | string | ❌ | +14 days | Return date (`YYYY-MM-DD`) |

**Example:**
```bash
curl "http://localhost:3000/flights/search/roundTrip?from=PBI&to=LAS&departDate=2026-02-09"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "from": "PBI",
    "to": "LAS",
    "departDate": "2026-02-09",
    "returnDate": "2026-02-16",
    "flights": [
      {
        "price": 198,
        "airline": "Spirit Airlines",
        "airlineCode": "NK",
        "flightNumber": "NK123",
        "origin": "PBI",
        "destination": "LAS",
        "departureTime": "2026-02-09 06:00",
        "arrivalTime": "2026-02-09 09:30",
        "duration": "5h 30m",
        "stops": 0,
        "token": "...",
        "segments": [],
        "layovers": []
      }
    ]
  }
}
```

---

### `GET /flights/cheapest`
Get the cheapest round-trip flight pair automatically.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from` | string | ✅ | - | Origin airport code (e.g., `PBI`) |
| `to` | string | ✅ | - | Destination airport code (e.g., `LAS`) |
| `departDate` | string | ❌ | +7 days | Departure date (`YYYY-MM-DD`) |
| `returnDate` | string | ❌ | +14 days | Return date (`YYYY-MM-DD`) |

**Example:**
```bash
curl "http://localhost:3000/flights/cheapest?from=PBI&to=LAS"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "from": "PBI",
    "to": "LAS",
    "departDate": "2026-02-09",
    "returnDate": "2026-02-16",
    "totalPrice": 198,
    "outbound": { /* FlightResult */ },
    "return": { /* FlightResult */ }
  }
}
```
---

### `GET /flights/search/oneWay`
Search for one-way flights between airports.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from` | string | ✅ | - | Origin airport code (e.g., `PBI`) |
| `to` | string | ✅ | - | Destination airport code (e.g., `LAS`) |
| `departDate` | string | ❌ | +7 days | Departure date (`YYYY-MM-DD`) |

**Example:**
```bash
curl "http://localhost:3000/flights/search/oneWay?from=PBI&to=LAS&departDate=2026-02-09"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "from": "PBI",
    "to": "LAS",
    "departDate": "2026-02-09",
    "cheapest": { /* FlightResult */ },
    "totalFlights": 45,
    "allFlights": [ /* top 20 FlightResults */ ]
  }
}
```

---

### `POST /flights/return`
Search for return flights using a selected outbound flight token.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | ✅ | Token from selected outbound flight |
| `origin` | string | ✅ | Origin airport (destination of outbound) |
| `destination` | string | ✅ | Destination airport (origin of outbound) |
| `returnDate` | string | ✅ | Return date (`YYYY-MM-DD`) |

**Example:**
```bash
curl -X POST http://localhost:3000/flights/return \
  -H "Content-Type: application/json" \
  -d '{
    "token": "ClRJOGV...",
    "origin": "LAS",
    "destination": "PBI",
    "returnDate": "2026-02-16"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "origin": "LAS",
    "destination": "PBI",
    "returnDate": "2026-02-16",
    "flights": [...]
  }
}
```

---

## Flight Object Schema

```typescript
interface FlightResult {
  price: number;           // Price in USD
  airline: string;         // Airline name
  airlineCode: string;     // IATA airline code
  flightNumber: string;    // Flight number(s)
  origin: string;          // Origin airport code
  destination: string;     // Destination airport code
  departureTime: string;   // "YYYY-MM-DD HH:MM"
  arrivalTime: string;     // "YYYY-MM-DD HH:MM"
  duration: string;        // "Xh Ym"
  stops: number;           // Number of stops
  token: string;           // Booking token for return search
  segments: FlightSegment[];
  layovers: Layover[];
}

interface FlightSegment {
  origin: string;
  originName: string;
  destination: string;
  destinationName: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  flightNumber: string;
  airline: string;
}

interface Layover {
  airport: string;
  airportName: string;
  duration: string;
}
```

---

## Error Response

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message description"
}
```
