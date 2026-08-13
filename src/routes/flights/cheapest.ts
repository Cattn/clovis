import { Elysia, t } from "elysia";
import type { FlightResult } from "../../types/flight";
import { formatDate, parseAirportCodes } from "../../utils/format";
import { searchFlightsFromUrl } from "../../utils/shopping";
import {
  base64url,
  buildOneWaySearchUrl,
  buildRoundTripSearchUrl,
  concat,
  fBytes,
  fStr,
  fVarint,
  loc,
} from "../../utils/tfs";

function selectedDetail(origin: string, date: string, dest: string, airline: string, flightNo: string): Uint8Array {
  // {1=origin,2=date,3=dest,5=airline,6=flightNo}
  return concat(
    fStr(1, origin),
    fStr(2, date),
    fStr(3, dest),
    fStr(5, airline),
    fStr(6, flightNo)
  );
}

function leg(params: {
  date: string;
  origin: string;
  dest: string;
  airlineCode?: string;
  flightNumber?: string;
}): Uint8Array {
  // {2=date, 4=selectedDetail?, 13=loc(origin), 14=loc(dest)}
  const parts: Uint8Array[] = [fStr(2, params.date)];

  if (params.airlineCode && params.flightNumber) {
    parts.push(
      fBytes(
        4,
        selectedDetail(params.origin, params.date, params.dest, params.airlineCode, params.flightNumber)
      )
    );
  }

  parts.push(fBytes(13, loc(params.origin)));
  parts.push(fBytes(14, loc(params.dest)));
  return concat(...parts);
}

function buildTfsRoundTripSelected(opts: {
  outbound: { date: string; origin: string; dest: string; airlineCode: string; flightNumber: string };
  inbound: { date: string; origin: string; dest: string; airlineCode: string; flightNumber: string };
}): string {
  const maxU64 = (1n << 64n) - 1n;

  const msg = concat(
    fVarint(1, 28n),
    fVarint(2, 2n),
    fBytes(3, leg(opts.outbound)),
    fBytes(3, leg(opts.inbound)),
    fVarint(8, 1n),
    fVarint(9, 1n),
    fVarint(14, 1n),
    fBytes(16, fVarint(1, maxU64)),
    fVarint(19, 1n)
  );

  return base64url(msg);
}

function normalizeFlightNo(flightNumber: string): string {
  return (flightNumber || "").replace(/[^0-9]/g, "");
}

function pickAirlineAndFlightNumber(f: FlightResult): { airlineCode: string; flightNo: string } {
  const seg0 = f.segments?.[0];
  const airlineCode = (f.airlineCode || "").toUpperCase().trim();
  const flightNo = normalizeFlightNo(seg0?.flightNumber || f.flightNumber || "");
  return { airlineCode, flightNo };
}

function buildBookingUrlFromTfs(tfs: string): string {
  const u = new URL("https://www.google.com/travel/flights/booking");
  u.searchParams.set("tfs", tfs);
  u.searchParams.set("hl", "en-US");
  u.searchParams.set("gl", "US");
  u.searchParams.set("curr", "USD");
  return u.toString();
}

async function fetchFlights(
  fromAirports: string[],
  to: string,
  departureDate: string,
  returnDateStr: string
): Promise<FlightResult[]> {
  const url = buildRoundTripSearchUrl(fromAirports, to, departureDate, returnDateStr);
  return searchFlightsFromUrl(url, fromAirports, to, departureDate);
}

async function fetchReturnFlights(
  origin: string,
  destination: string,
  returnDate: string
): Promise<FlightResult[]> {
  const url = buildOneWaySearchUrl([origin], destination, returnDate);
  return searchFlightsFromUrl(url, [origin], destination, returnDate);
}

export const cheapestRoutes = new Elysia({ prefix: "/flights" })
  .get(
    "/cheapest",
    async ({ query }) => {
      const { from, to, departDate, returnDate } = query;

      if (!from || !to) {
        return { success: false, error: "Missing required parameters: 'from' and 'to' are required" };
      }

      try {
        const fromAirports = parseAirportCodes(from);
        if (fromAirports.length === 0) {
          return { success: false, error: "Invalid 'from' value. Use one or more 3-letter airport codes (comma-separated)." };
        }
        const toAirport = to.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(toAirport)) {
          return { success: false, error: "Invalid 'to' value. Use a 3-letter airport code." };
        }

        const departureDate = departDate || formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        const returnDateStr = returnDate || formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

        const outboundFlights = await fetchFlights(fromAirports, toAirport, departureDate, returnDateStr);
        if (outboundFlights.length === 0) return { success: false, error: "No outbound flights found" };

        const cheapestOutbound = outboundFlights[0]!;

        const returnFlights = await fetchReturnFlights(toAirport, cheapestOutbound.origin, returnDateStr);
        if (returnFlights.length === 0) return { success: false, error: "No return flights found" };

        const sameAirline = returnFlights.filter((f) => f.airlineCode === cheapestOutbound.airlineCode);
        const cheapestReturn = (sameAirline[0] ?? returnFlights[0])!;
        const totalPrice = cheapestOutbound.price;

        const outSel = pickAirlineAndFlightNumber(cheapestOutbound);
        const inSel = pickAirlineAndFlightNumber(cheapestReturn);

        let bookingUrl: string | null = null;
        if (outSel.airlineCode && outSel.flightNo && inSel.airlineCode && inSel.flightNo) {
          const tfs = buildTfsRoundTripSelected({
            outbound: {
              date: departureDate,
              origin: cheapestOutbound.origin,
              dest: cheapestOutbound.destination,
              airlineCode: outSel.airlineCode,
              flightNumber: outSel.flightNo,
            },
            inbound: {
              date: returnDateStr,
              origin: cheapestReturn.origin,
              dest: cheapestReturn.destination,
              airlineCode: inSel.airlineCode,
              flightNumber: inSel.flightNo,
            },
          });
          bookingUrl = buildBookingUrlFromTfs(tfs);
        }

        const searchUrl = buildRoundTripSearchUrl(fromAirports, toAirport, departureDate, returnDateStr);

        return {
          success: true,
          data: {
            from: fromAirports.join(","),
            to: toAirport,
            departDate: departureDate,
            returnDate: returnDateStr,
            totalPrice,
            bookingUrl, // tfs-only /booking (may still be "unavailable" on Google's side for some mixed itineraries)
            searchUrl,  // reliable fallback (always loads)
            outbound: cheapestOutbound,
            return: cheapestReturn,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to find cheapest flights",
        };
      }
    },
    {
      query: t.Object({
        from: t.String(),
        to: t.String(),
        departDate: t.Optional(t.String()),
        returnDate: t.Optional(t.String()),
      }),
    }
  );
