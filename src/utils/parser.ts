import type { FlightResult, FlightSegment, Layover } from "../types/flight";
import { formatTime, formatDuration } from "./format";

export function parseFlightResponse(rawText: string): FlightResult[] {
  const flights: FlightResult[] = [];
  
  try {
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
      
      const beforeMatch = rawText.slice(Math.max(0, match.index - 800), match.index);
      let airlineCode = "";
      let airlineName = "";
      let flightNumbers: string[] = [];
      
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
      
      const layovers: Layover[] = [];
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
      
      const afterMatch = rawText.slice(match.index, match.index + 1500);
      const priceTokenMatch = afterMatch.match(/\[\[null,(\d+)\],\\?"([A-Za-z0-9+/_-]+(?:\\{1,2}u003d)*)\\?"\]/);
      const price = priceTokenMatch?.[1] ? parseInt(priceTokenMatch[1]) : 0;
      const token = priceTokenMatch?.[2]?.replace(/\\{1,2}u003d/g, "=") || "";
      
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
    
    flights.sort((a, b) => a.price - b.price);
    
  } catch (e) {
    console.error("Parse error:", e);
  }
  
  return flights;
}
