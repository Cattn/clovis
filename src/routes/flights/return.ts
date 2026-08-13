import { Elysia, t } from "elysia";
import { searchFlightsFromUrl } from "../../utils/shopping";
import { buildOneWaySearchUrl } from "../../utils/tfs";

export const returnRoutes = new Elysia({ prefix: "/flights" })
  .post("/return", async ({ body }) => {
    const { origin, destination, returnDate } = body;

    try {
      const fromAirport = origin.toUpperCase();
      const toAirport = destination.toUpperCase();
      const searchUrl = buildOneWaySearchUrl([fromAirport], toAirport, returnDate);
      const flights = await searchFlightsFromUrl(searchUrl, [fromAirport], toAirport, returnDate);

      return {
        success: true,
        data: {
          origin: fromAirport,
          destination: toAirport,
          returnDate,
          flights,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Return flight search failed",
      };
    }
  }, {
    body: t.Object({
      token: t.String(),
      origin: t.String(),
      destination: t.String(),
      returnDate: t.String(),
    }),
  });
