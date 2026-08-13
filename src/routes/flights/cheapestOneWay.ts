import { Elysia, t } from "elysia";
import { formatDate, parseAirportCodes } from "../../utils/format";
import { searchFlightsFromUrl } from "../../utils/shopping";
import { buildOneWaySearchUrl, buildTfuFromOutboundToken } from "../../utils/tfs";

function buildSelectedSearchUrl(fromAirports: string[], to: string, departDate: string, outboundToken: string): string {
  const u = new URL(buildOneWaySearchUrl(fromAirports, to, departDate));
  u.searchParams.set("tfu", buildTfuFromOutboundToken(outboundToken));
  return u.toString();
}

export const cheapestOneWayRoutes = new Elysia({ prefix: "/flights/cheapest" })
  .get(
    "/oneWay",
    async ({ query }) => {
      const { from, to, departDate } = query;

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
        const searchUrl = buildOneWaySearchUrl(fromAirports, toAirport, departureDate);
        const flights = await searchFlightsFromUrl(searchUrl, fromAirports, toAirport, departureDate);
        if (flights.length === 0) return { success: false, error: "No flights found" };

        const cheapestOutbound = flights[0]!;
        const bookingUrl = cheapestOutbound.token
          ? buildSelectedSearchUrl(fromAirports, toAirport, departureDate, cheapestOutbound.token)
          : null;

        return {
          success: true,
          data: {
            from: fromAirports.join(","),
            to: toAirport,
            departDate: departureDate,
            totalPrice: cheapestOutbound.price,
            bookingUrl,
            searchUrl,
            outbound: cheapestOutbound,
            return: null,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to find cheapest one-way flights",
        };
      }
    },
    {
      query: t.Object({
        from: t.String(),
        to: t.String(),
        departDate: t.Optional(t.String()),
      }),
    }
  );
