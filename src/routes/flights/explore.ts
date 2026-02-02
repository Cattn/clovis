import { Elysia, t } from "elysia";
import type { FlightResult } from "../../types/flight";
import { getFlightTokens, RPC_ENDPOINT } from "../../utils/token";
import { parseFlightResponse } from "../../utils/parser";
import { formatDate } from "../../utils/format";

const getSignal = () => AbortSignal.timeout(15000);

async function fetchExploreFlights(
  tokens: { sid: string; bl: string },
  from: string,
  to: string,
  departureDate: string
): Promise<FlightResult[]> {
  const url = new URL(RPC_ENDPOINT);
  url.searchParams.set("f.sid", tokens.sid);
  url.searchParams.set("bl", tokens.bl);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("soc-app", "162");
  url.searchParams.set("soc-platform", "1");
  url.searchParams.set("soc-device", "1");
  url.searchParams.set("_reqid", String(Math.floor(Math.random() * 900000) + 100000));
  url.searchParams.set("rt", "c");
  
  const innerPayload = [
    [],
    [
      null,
      null,
      2, // one-way trip
      null,
      [],
      1,
      [1, 0, 0, 0],
      null,
      null,
      null,
      null,
      null,
      null,
      [
        [
          [[[from, 0]]],
          [[[to, 0]]],
          null,
          0,
          null,
          null,
          departureDate
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
    2
  ];

  const fReqPayload = JSON.stringify([null, JSON.stringify(innerPayload)]);
  const body = new URLSearchParams();
  body.append("f.req", fReqPayload);

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

  if (!response.ok) throw new Error(`Explore search failed: ${response.statusText}`);
  
  const text = await response.text();
  const cleanJson = text.replace(/^\)\]\}'\\s*/, "");
  return parseFlightResponse(cleanJson);
}

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
      const tokens = await getFlightTokens();
      
      const departureDate = departDate || formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

      const flights = await fetchExploreFlights(
        tokens,
        from.toUpperCase(),
        to.toUpperCase(),
        departureDate
      );

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
          from: from.toUpperCase(),
          to: to.toUpperCase(),
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
