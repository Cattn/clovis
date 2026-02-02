import type { TokenResponse } from "../types/flight";

export const FLIGHTS_MAIN_URL = "https://www.google.com/travel/flights?hl=en-US";
export const RPC_ENDPOINT = "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults";

const getSignal = () => AbortSignal.timeout(10000);

export async function getFlightTokens(): Promise<TokenResponse> {
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

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  
  const html = await response.text();

  const sidMatch = html.match(/"FdrFJe":"(-?\d+)"/);
  const blMatch = html.match(/"cfb2h":"([^"]+)"/);

  if (!sidMatch || !blMatch) {
    throw new Error("Token extraction failed - Google may have served a Captcha/Consent page");
  }

  return { sid: sidMatch[1]!, bl: blMatch[1]! };
}
