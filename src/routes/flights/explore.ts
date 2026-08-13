import { Elysia, t } from "elysia";
import { formatDate, parseAirportCodes } from "../../utils/format";
import { searchFlightsFromUrl } from "../../utils/shopping";
import { buildOneWaySearchUrl } from "../../utils/tfs";

export const oneWayRoutes = new Elysia({ prefix: "/flights/search" })
  .get("/oneWay", async ({ query }) => {
    const { from, to, departDate } = query;
    
    if (!from || !to) {
      return {
        success: false,
        error: "Missing required parameters: 'from' and 'to' are required",
      };
    }

    try {
      const fromAirports = parseAirportCodes(from);
      if (fromAirports.length === 0) {
        return {
          success: false,
          error: "Invalid 'from' value. Use one or more 3-letter airport codes (comma-separated).",
        };
      }
      const toAirport = to.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(toAirport)) {
        return {
          success: false,
          error: "Invalid 'to' value. Use a 3-letter airport code.",
        };
      }

      const departureDate = departDate || formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      const searchUrl = buildOneWaySearchUrl(fromAirports, toAirport, departureDate);
      const flights = await searchFlightsFromUrl(searchUrl, fromAirports, toAirport, departureDate);

      if (flights.length === 0) {
        return {
          success: false,
          error: "No flights found",
        };
      }

      const cheapest = flights[0]!;

      return {
        success: true,
        data: {
          from: fromAirports.join(","),
          to: toAirport,
          departDate: departureDate,
          cheapest,
          totalFlights: flights.length,
          allFlights: flights.slice(0, 20),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to explore flights",
      };
    }
  }, {
    query: t.Object({
      from: t.String(),
      to: t.String(),
      departDate: t.Optional(t.String()),
    }),
  });
