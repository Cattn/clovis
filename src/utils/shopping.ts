import type { FlightResult } from "../types/flight";
import { parseFlightResponse } from "./parser";

const SEARCH_TIMEOUT_MS = 25000;

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function fetchSearchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: SEARCH_HEADERS,
  });

  if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);

  const html = await response.text();
  if (
    html.includes("detected unusual traffic") ||
    html.includes("Before you continue to Google") ||
    html.includes("consent.google.com")
  ) {
    throw new Error("Google served a Captcha/Consent page");
  }
  return html;
}

export function filterFlights(
  flights: FlightResult[],
  origins: string[],
  destination: string,
  date: string
): FlightResult[] {
  const originSet = new Set(origins);
  return flights.filter(
    (f) => originSet.has(f.origin) && f.destination === destination && f.departureTime.startsWith(date)
  );
}

export async function searchFlightsFromUrl(
  url: string,
  origins: string[],
  destination: string,
  date: string
): Promise<FlightResult[]> {
  const html = await fetchSearchHtml(url);
  return filterFlights(parseFlightResponse(html), origins, destination, date);
}
