import { Elysia, t } from "elysia";
import type { FlightResult } from "../../types/flight";
import { getFlightTokens, RPC_ENDPOINT } from "../../utils/token";
import { parseFlightResponse } from "../../utils/parser";
import { formatDate } from "../../utils/format";

const getSignal = () => AbortSignal.timeout(10000);

export const searchRoutes = new Elysia({ prefix: "/flights/search" })
  .get("/roundTrip", async ({ query }) => {
    const { from, to, departDate, returnDate } = query;
    
    if (!from || !to) {
      return {
        success: false,
        error: "Missing required parameters: 'from' and 'to' are required",
      };
    }

    try {
      const tokens = await getFlightTokens();
      
      const departureDate = departDate || formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      const returnDateStr = returnDate || formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

      const url = new URL(RPC_ENDPOINT);
      url.searchParams.set("f.sid", tokens.sid);
      url.searchParams.set("bl", tokens.bl);
      url.searchParams.set("hl", "en-US");
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
          1,
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
              [[[from.toUpperCase(), 0]]],
              [[[to.toUpperCase(), 0]]],
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
              3
            ],
            [
              [[[to.toUpperCase(), 0]]],
              [[[from.toUpperCase(), 0]]],
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

      if (!response.ok) {
        return {
          success: false,
          error: `Search request failed: ${response.statusText}`,
        };
      }

      const text = await response.text();
      const cleanJson = text.replace(/^\)\]\}'\\s*/, "");
      const flights = parseFlightResponse(cleanJson);

      return {
        success: true,
        data: {
          from: from.toUpperCase(),
          to: to.toUpperCase(),
          departDate: departureDate,
          returnDate: returnDateStr,
          flights,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Flight search failed",
      };
    }
  }, {
    query: t.Object({
      from: t.String(),
      to: t.String(),
      departDate: t.Optional(t.String()),
      returnDate: t.Optional(t.String()),
    }),
  });
