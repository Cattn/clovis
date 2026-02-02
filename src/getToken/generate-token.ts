import { URLSearchParams } from "url";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import * as readline from "readline";

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function getLogDir(): string {
  const logDir = join(process.cwd(), "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

// 1. Configuration
const FLIGHTS_MAIN_URL = "https://www.google.com/travel/flights?hl=en-US";
const RPC_ENDPOINT = "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults";

// Helper: Timeout signal to prevent hanging
const getSignal = () => AbortSignal.timeout(10000); // 10 seconds

console.log("🚀 Script started. Initializing...");

// 2. Token Generation
async function getFlightTokens() {
  console.log(`\n1️⃣  Fetching HTML from ${FLIGHTS_MAIN_URL}...`);
  
  try {
    const response = await fetch(FLIGHTS_MAIN_URL, {
      signal: getSignal(),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    });

    console.log(`   Response Status: ${response.status}`);

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const html = await response.text();
    console.log(`   HTML Length: ${html.length} chars. Parsing tokens...`);

    // Extract Tokens
    const sidMatch = html.match(/"FdrFJe":"(-?\d+)"/);
    const blMatch = html.match(/"cfb2h":"([^"]+)"/);

    if (!sidMatch) console.error("   ❌ Could not find 'f.sid' (FdrFJe). Google might have served a Captcha/Consent page.");
    if (!blMatch) console.error("   ❌ Could not find 'bl' (cfb2h).");

    if (!sidMatch || !blMatch) throw new Error("Token extraction failed.");

    return { sid: sidMatch[1], bl: blMatch[1] };

  } catch (error) {
    if (error instanceof Error) {
      console.error(`   ❌ Fetch Failed: ${error.message}`);
      throw error;
    } else {
      console.error("   ❌ Fetch Failed: An unknown error occurred.");
      throw new Error("Unknown error during fetch");
    }
  }
}

// Helper: Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  aircraft: string;
}

interface FlightResult {
  price: number;
  airline: string;
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  aircraft: string;
  token: string;
  segments: FlightSegment[];
  layovers: { airport: string; airportName: string; duration: string }[];
}

// Format time array [hour, minute] or [hour] to string
function formatTime(timeArr: number[]): string {
  if (!timeArr || timeArr.length === 0) return "N/A";
  const hour = timeArr[0];
  const min = timeArr[1] || 0;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Format duration in minutes to human readable
function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${hours}h ${minutes}m`;
}

// Calculate layover duration between two segments based on arrival and departure times
function calculateLayoverDuration(arrivalTime: string, departureTime: string): string {
  // Parse times like "HH:MM"
  const arrParts = arrivalTime.split(":").map(Number);
  const depParts = departureTime.split(":").map(Number);
  
  if (arrParts.length < 2 || depParts.length < 2) return "";
  
  const arrMins = (arrParts[0] || 0) * 60 + (arrParts[1] || 0);
  let depMins = (depParts[0] || 0) * 60 + (depParts[1] || 0);
  
  // Handle overnight layovers (next day departure)
  if (depMins < arrMins) {
    depMins += 24 * 60; // Add 24 hours
  }
  
  const layoverMins = depMins - arrMins;
  return formatDuration(layoverMins);
}

// Parse the Google Flights response
function parseFlightResponse(rawText: string): FlightResult[] {
  const flights: FlightResult[] = [];
  
  try {
    // The response contains escaped JSON - quotes appear as \" in the text
    // Pattern: [["AIRLINE",["Name"],...route info...],"ORIGIN",[Y,M,D],[H,M?],"DEST",[Y,M,D],[H,M?],DURATION,...],[[null,PRICE],...
    // We need to handle both escaped (\") and unescaped (") quotes
    
    // Match route pattern: "ORIGIN",[YEAR,MONTH,DAY],[HOUR,MIN?],"DEST",[YEAR,MONTH,DAY],[HOUR,MIN?],DURATION
    const routePattern = /\\?"([A-Z]{3})\\?",\[(\d{4}),(\d{1,2}),(\d{1,2})\],\[(\d{1,2})(?:,(\d{1,2}))?\],\\?"([A-Z]{3})\\?",\[(\d{4}),(\d{1,2}),(\d{1,2})\],\[(\d{1,2})(?:,(\d{1,2}))?\],(\d+),/g;
    
    let match: RegExpExecArray | null;
    const seen = new Set<string>();
    
    while ((match = routePattern.exec(rawText)) !== null) {
      const origin = match[1] ?? "";
      const depYear = match[2] ?? "";
      const depMonth = match[3] ?? "";
      const depDay = match[4] ?? "";
      const depHour = match[5] ?? "0";
      const depMin = match[6] ?? "0";
      const dest = match[7] ?? "";
      const arrYear = match[8] ?? "";
      const arrMonth = match[9] ?? "";
      const arrDay = match[10] ?? "";
      const arrHour = match[11] ?? "0";
      const arrMin = match[12] ?? "0";
      const durationStr = match[13] ?? "0";
      
      // Look backwards for airline info: [["XX",["Airline Name"] and flight numbers ["XX","1234",null,"Name"]
      const beforeMatch = rawText.slice(Math.max(0, match.index - 800), match.index);
      let airlineCode = "";
      let airlineName = "";
      let flightNumbers: string[] = [];
      
      // Extract segments: [null,null,null,"ORIGIN","OriginName","DestName","DEST",null,[depH,depM],null,[arrH,arrM],duration,...]
      const segments: FlightSegment[] = [];
      const segmentPattern = /\[null,null,null,\\?"([A-Z]{3})\\?",\\?"([^"\\]+)\\?",\\?"([^"\\]+)\\?",\\?"([A-Z]{3})\\?",null,\[(\d+)(?:,(\d+))?\],null,\[(\d+)(?:,(\d+))?\],(\d+),.*?\[\\?"([A-Z0-9]{2})\\?",\\?"(\d+)\\?",null,\\?"([^"\\]+)\\?"\]/g;
      const segMatches = [...beforeMatch.matchAll(segmentPattern)];
      for (const sm of segMatches) {
        if (sm[1] && sm[4]) {
          const segDepHour = parseInt(sm[5] || "0");
          const segDepMin = parseInt(sm[6] || "0");
          const segArrHour = parseInt(sm[7] || "0");
          const segArrMin = parseInt(sm[8] || "0");
          const segDuration = parseInt(sm[9] || "0");
          segments.push({
            origin: sm[1],
            originName: sm[2] || "",
            destination: sm[4],
            destinationName: sm[3] || "",
            departureTime: formatTime([segDepHour, segDepMin]),
            arrivalTime: formatTime([segArrHour, segArrMin]),
            duration: formatDuration(segDuration),
            flightNumber: `${sm[10]}${sm[11]}`,
            airline: sm[12] || "",
            aircraft: "",
          });
          if (!airlineCode) {
            airlineCode = sm[10] || "";
            airlineName = sm[12] || "";
          }
        }
      }
      
      // Extract flight numbers for display
      const flightNumPattern = /\[\\?"([A-Z0-9]{2})\\?",\\?"(\d+)\\?",null,\\?"([^"\\]+)\\?"\]/g;
      const flightMatches = [...beforeMatch.matchAll(flightNumPattern)];
      for (const fm of flightMatches) {
        if (fm[1] && fm[2]) {
          flightNumbers.push(`${fm[1]}${fm[2]}`);
          if (!airlineCode) {
            airlineCode = fm[1];
            airlineName = fm[3] || "";
          }
        }
      }
      
      // Extract layovers: [[duration,"CODE","CODE",null,"Airport Name",...]]
      const layovers: { airport: string; airportName: string; duration: string }[] = [];
      const layoverPattern = /\[\[(\d+),\\?"([A-Z]{3})\\?",\\?"[A-Z]{3}\\?",null,\\?"([^"\\]+)\\?"/g;
      const layoverMatches = [...beforeMatch.matchAll(layoverPattern)];
      for (const lm of layoverMatches) {
        if (lm[1] && lm[2]) {
          layovers.push({
            airport: lm[2],
            airportName: lm[3] || "",
            duration: formatDuration(parseInt(lm[1])),
          });
        }
      }
      
      // Fallback: try other patterns for airline detection if not found
      if (!airlineCode) {
        const airlinePatterns = [
          /\[\[\\?"([A-Z0-9]{2})\\?",\[\\?"([^"\\]+)\\?"\]/g,
          /\["([A-Z0-9]{2})","([^"]+)"/g,
        ];
        
        for (const pattern of airlinePatterns) {
          const matches = [...beforeMatch.matchAll(pattern)];
          if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            if (lastMatch && lastMatch[1] && lastMatch[2]) {
              airlineCode = lastMatch[1];
              airlineName = lastMatch[2];
              break;
            }
          }
        }
      }
      
      // Look forward for price and token: [[null,PRICE],"TOKEN"]
      const afterMatch = rawText.slice(match.index, match.index + 1500);
      // Token pattern: [[null,PRICE],"TOKEN"] where TOKEN may contain \u003d or \\u003d for =
      const priceTokenMatch = afterMatch.match(/\[\[null,(\d+)\],\\?"([A-Za-z0-9+/_-]+(?:\\{1,2}u003d)*)\\?"\]/);
      const price = priceTokenMatch?.[1] ? parseInt(priceTokenMatch[1]) : 0;
      const token = priceTokenMatch?.[2]?.replace(/\\{1,2}u003d/g, "=") || "";
      
      // Create unique key to avoid duplicates
      const key = `${airlineCode}-${origin}-${dest}-${depHour}:${depMin}-${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      const duration = parseInt(durationStr);
      
      flights.push({
        price,
        airline: airlineName,
        airlineCode,
        flightNumber: flightNumbers.join(", "),
        origin,
        destination: dest,
        departureTime: `${depYear}-${depMonth.padStart(2, "0")}-${depDay.padStart(2, "0")} ${formatTime([parseInt(depHour), parseInt(depMin)])}`,
        arrivalTime: `${arrYear}-${arrMonth.padStart(2, "0")}-${arrDay.padStart(2, "0")} ${formatTime([parseInt(arrHour), parseInt(arrMin)])}`,
        duration: formatDuration(duration),
        stops: Math.max(layovers.length, segments.length > 1 ? segments.length - 1 : 0),
        aircraft: "",
        token,
        segments,
        layovers,
      });
    }
    
    // Sort by price
    flights.sort((a, b) => a.price - b.price);
    
  } catch (e) {
    console.error("   Parse error:", e);
  }
  
  return flights;
}

// Display flight results nicely
function displayFlights(flights: FlightResult[], from: string, to: string) {
  if (flights.length === 0) {
    console.log("\n   No flights found or unable to parse response.");
    return;
  }
  
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  FLIGHT RESULTS: ${from} → ${to} (${flights.length} flights found)`);
  console.log(`${"═".repeat(65)}`);
  
  flights.slice(0, 10).forEach((flight, index) => {
    const actualStops = Math.max(flight.stops, flight.segments.length > 1 ? flight.segments.length - 1 : 0);
    const stopsText = actualStops === 0 ? "Nonstop" : `${actualStops} stop${actualStops > 1 ? "s" : ""}`;
    console.log(`\n  [${index + 1}] ${flight.airline} (${flight.airlineCode}) - $${flight.price} - ${stopsText}`);
    console.log(`      ${flight.origin} → ${flight.destination} | ${flight.duration}`);
    console.log(`      ${flight.departureTime} - ${flight.arrivalTime}`);
    
    // Show segment details if there are stops
    if (flight.segments.length > 0) {
      flight.segments.forEach((seg, i) => {
        console.log(`      ┌ ${seg.flightNumber}: ${seg.origin} ${seg.departureTime} → ${seg.destination} ${seg.arrivalTime} (${seg.duration})`);
        // Show layover after each segment except the last one
        if (i < flight.segments.length - 1) {
          const layover = flight.layovers[i];
          const nextSeg = flight.segments[i + 1];
          if (layover && layover.duration) {
            console.log(`      │ ${layover.duration} layover in ${layover.airportName || layover.airport}`);
          } else if (nextSeg) {
            // Calculate layover from segment times
            const layoverTime = calculateLayoverDuration(seg.arrivalTime, nextSeg.departureTime);
            console.log(`      │ ${layoverTime} layover at ${seg.destination}`);
          }
        }
      });
    } else if (flight.flightNumber) {
      console.log(`      Flight: ${flight.flightNumber}`);
    }
  });
  
  console.log(`\n${"═".repeat(65)}`);
}

// 3. The Search Query Function
async function searchFlights(sid: string, bl: string, from: string, to: string, departDate?: string, returnDate?: string) {
  // Default to 7 days from now for departure, 14 days for return
  const departureDate = departDate || formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const returnDateStr = returnDate || formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

  console.log(`\n2️⃣  Searching Flights: ${from} ➔ ${to}`);
  console.log(`   Departure: ${departureDate}, Return: ${returnDateStr}`);

  const url = new URL(RPC_ENDPOINT);
  url.searchParams.set("f.sid", sid);
  url.searchParams.set("bl", bl);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("soc-app", "162");
  url.searchParams.set("soc-platform", "1");
  url.searchParams.set("soc-device", "1");
  url.searchParams.set("_reqid", String(Math.floor(Math.random() * 900000) + 100000));
  url.searchParams.set("rt", "c");

  // Build the inner payload structure (matches HAR exactly)
  const innerPayload = [
    [],
    [
      null,
      null,
      1, // 1 = round trip, 2 = one way
      null,
      [],
      1, // adults count
      [1, 0, 0, 0], // [adults, children, infants_in_seat, infants_on_lap]
      null,
      null,
      null,
      null,
      null,
      null,
      [
        // Outbound leg
        [
          [[[from, 0]]], // Origin airport code
          [[[to, 0]]],   // Destination airport code
          null,
          0,
          null,
          null,
          departureDate,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          3 // cabin class (3 = any/economy)
        ],
        // Return leg
        [
          [[[to, 0]]],   // Origin (destination becomes origin)
          [[[from, 0]]], // Destination (origin becomes destination)
          null,
          0,
          null,
          null,
          returnDateStr,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          3
        ]
      ],
      null,
      null,
      null,
      1
    ],
    0,
    0,
    0,
    1
  ];

  // The payload format: [null, "<stringified inner payload>"]
  const fReqPayload = JSON.stringify([null, JSON.stringify(innerPayload)]);

  const body = new URLSearchParams();
  body.append("f.req", fReqPayload);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      signal: getSignal(),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Origin": "https://www.google.com",
        "Referer": "https://www.google.com/travel/flights",
        "x-same-domain": "1",
        "x-goog-ext-259736195-jspb": '["en-US","US","USD",2,null,[300],null,null,7,[]]',
      },
      body: body,
    });

    console.log(`   Search Status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      // Clean JSON hijacking prefix
      const cleanJson = text.replace(/^\)]}'\s*/, "");
      
      // Save raw response to timestamped log file
      const timestamp = getTimestamp();
      const logDir = getLogDir();
      const logPath = join(logDir, `flight-${from}-${to}-${timestamp}.txt`);
      writeFileSync(logPath, cleanJson);
      console.log(`   Response saved to: ${logPath}`);
      
      // Also save to samples for quick access
      const outputPath = join(process.cwd(), "samples", "flight-response.txt");
      writeFileSync(outputPath, cleanJson);
      
      console.log("   Parsing response...");
      const flights = parseFlightResponse(cleanJson);
      
      // Save parsed results to log
      const resultsPath = join(logDir, `results-${from}-${to}-${timestamp}.json`);
      writeFileSync(resultsPath, JSON.stringify(flights, null, 2));
      console.log(`   Results saved to: ${resultsPath}`);
      
      displayFlights(flights, from, to);
      
      return flights;
    } else {
      console.error(`   ❌ Request Failed: ${response.statusText}`);
      const errorText = await response.text();
      const errorPath = join(process.cwd(), "samples", "flight-error.txt");
      writeFileSync(errorPath, errorText);
      console.log(`   Error response saved to: ${errorPath}`);
      return [];
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`   ❌ Search Network Error: ${err.message}`);
    } else {
      console.error("   ❌ Search Network Error:", err);
    }
  }
}

// 4. Search Return Flights
async function searchReturnFlights(sid: string, bl: string, selectedFlight: FlightResult, returnDate: string) {
  console.log(`\n3️⃣  Searching Return Flights: ${selectedFlight.destination} ➔ ${selectedFlight.origin}`);
  console.log(`   Return Date: ${returnDate}`);

  const url = new URL(RPC_ENDPOINT);
  url.searchParams.set("f.sid", sid);
  url.searchParams.set("bl", bl);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("soc-app", "162");
  url.searchParams.set("soc-platform", "1");
  url.searchParams.set("soc-device", "1");
  url.searchParams.set("_reqid", String(Math.floor(Math.random() * 900000) + 100000));
  url.searchParams.set("rt", "c");

  // Build payload with selected flight token for second leg search
  const innerPayload = [
    [null, selectedFlight.token],
    [null, null, 1, null, [], 1, [1, 0, 0, 0], null, null, null, null, null, null,
      [
        [
          [[[selectedFlight.destination, 0]]],
          [[[selectedFlight.origin, 0]]],
          null, 0, null, null, returnDate
        ]
      ],
      null, null, null, 1
    ],
    0, 0, 0, 2
  ];

  const fReqPayload = JSON.stringify([null, JSON.stringify(innerPayload)]);
  const body = new URLSearchParams();
  body.append("f.req", fReqPayload);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      signal: getSignal(),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Origin": "https://www.google.com",
        "Referer": "https://www.google.com/travel/flights",
        "x-same-domain": "1",
        "x-goog-ext-259736195-jspb": '["en-US","US","USD",2,null,[300],null,null,7,[]]',
      },
      body: body,
    });

    console.log(`   Search Status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      const cleanJson = text.replace(/^\)]}'\s*/, "");
      
      const timestamp = getTimestamp();
      const logDir = getLogDir();
      const logPath = join(logDir, `return-${selectedFlight.destination}-${selectedFlight.origin}-${timestamp}.txt`);
      writeFileSync(logPath, cleanJson);
      console.log(`   Response saved to: ${logPath}`);
      
      console.log("   Parsing return flights...");
      const flights = parseFlightResponse(cleanJson);
      
      const resultsPath = join(logDir, `return-results-${selectedFlight.destination}-${selectedFlight.origin}-${timestamp}.json`);
      writeFileSync(resultsPath, JSON.stringify(flights, null, 2));
      console.log(`   Results saved to: ${resultsPath}`);
      
      displayFlights(flights, selectedFlight.destination, selectedFlight.origin);
      
      const cheapest = flights[0];
      if (cheapest) {
        console.log(`\n${"═".repeat(65)}`);
        console.log(`  TRIP SUMMARY`);
        console.log(`${"═".repeat(65)}`);
        
        // Outbound details
        const outActualStops = Math.max(selectedFlight.stops, selectedFlight.segments.length > 1 ? selectedFlight.segments.length - 1 : 0);
        const outStops = outActualStops === 0 ? "Nonstop" : `${outActualStops} stop${outActualStops > 1 ? "s" : ""}`;
        console.log(`  OUTBOUND: ${selectedFlight.origin} → ${selectedFlight.destination} (${outStops}, ${selectedFlight.duration})`);
        console.log(`            ${selectedFlight.departureTime} - ${selectedFlight.arrivalTime}`);
        if (selectedFlight.segments.length > 0) {
          selectedFlight.segments.forEach((seg, i) => {
            console.log(`            ┌ ${seg.flightNumber}: ${seg.origin} ${seg.departureTime} → ${seg.destination} ${seg.arrivalTime}`);
            if (i < selectedFlight.segments.length - 1) {
              const outLayover = selectedFlight.layovers[i];
              const nextSeg = selectedFlight.segments[i + 1];
              if (outLayover && outLayover.duration) {
                console.log(`            │ ${outLayover.duration} layover in ${outLayover.airportName || outLayover.airport}`);
              } else if (nextSeg) {
                const layoverTime = calculateLayoverDuration(seg.arrivalTime, nextSeg.departureTime);
                console.log(`            │ ${layoverTime} layover at ${seg.destination}`);
              }
            }
          });
        } else {
          console.log(`            Flight: ${selectedFlight.flightNumber || "N/A"}`);
        }
        
        // Return details
        const retActualStops = Math.max(cheapest.stops, cheapest.segments.length > 1 ? cheapest.segments.length - 1 : 0);
        const retStops = retActualStops === 0 ? "Nonstop" : `${retActualStops} stop${retActualStops > 1 ? "s" : ""}`;
        console.log(`  RETURN:   ${cheapest.origin} → ${cheapest.destination} (${retStops}, ${cheapest.duration})`);
        console.log(`            ${cheapest.departureTime} - ${cheapest.arrivalTime}`);
        if (cheapest.segments.length > 0) {
          cheapest.segments.forEach((seg, i) => {
            console.log(`            ┌ ${seg.flightNumber}: ${seg.origin} ${seg.departureTime} → ${seg.destination} ${seg.arrivalTime}`);
            if (i < cheapest.segments.length - 1) {
              const retLayover = cheapest.layovers[i];
              const nextSeg = cheapest.segments[i + 1];
              if (retLayover && retLayover.duration) {
                console.log(`            │ ${retLayover.duration} layover in ${retLayover.airportName || retLayover.airport}`);
              } else if (nextSeg) {
                const layoverTime = calculateLayoverDuration(seg.arrivalTime, nextSeg.departureTime);
                console.log(`            │ ${layoverTime} layover at ${seg.destination}`);
              }
            }
          });
        } else {
          console.log(`            Flight: ${cheapest.flightNumber || "N/A"}`);
        }
        
        console.log(`  ─────────────────────────────────────────────────────────────`);
        console.log(`  ROUND TRIP TOTAL: $${selectedFlight.price}`);
        console.log(`${"═".repeat(65)}`);
      }
      
      return flights;
    } else {
      console.error(`   ❌ Request Failed: ${response.statusText}`);
      return [];
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`   ❌ Search Network Error: ${err.message}`);
    }
    return [];
  }
}

// 5. Execution Flow
(async () => {
  try {
    const tokens = await getFlightTokens();
    console.log(`\n✅ Tokens Acquired:`);
    console.log(`   SID: ${tokens.sid}`);
    console.log(`   BL:  ${tokens.bl}`);

    if (!tokens.sid || !tokens.bl) {
      throw new Error("Missing SID or BL token");
    }

    const from = "PBI";
    const to = "LAS";
    const departDate = formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const returnDate = formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

    const outboundFlights = await searchFlights(tokens.sid, tokens.bl, from, to, departDate, returnDate);
    
    if (!outboundFlights || outboundFlights.length === 0) {
      console.log("\nNo outbound flights found.");
      return;
    }

    const selection = await prompt("\nEnter flight number to select (1-10), or 'q' to quit: ");
    
    if (selection.toLowerCase() === 'q') {
      console.log("Exiting...");
      return;
    }

    const selectedIndex = parseInt(selection) - 1;
    const selectedFlight = outboundFlights[selectedIndex];
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= outboundFlights.length || !selectedFlight) {
      console.log("Invalid selection.");
      return;
    }

    console.log(`\n✅ Selected: ${selectedFlight.airline} - ${selectedFlight.departureTime} - $${selectedFlight.price}`);

    if (!selectedFlight.token) {
      console.log("No booking token found for this flight.");
      return;
    }

    await searchReturnFlights(tokens.sid, tokens.bl, selectedFlight, returnDate);

  } catch (error: any) {
    console.error("\n💀 Critical Failure. Script stopped.");
    if (error instanceof Error && error.message) {
      console.error(`   Error: ${error.message}`);
    }
  }
})();
