import { Elysia, t } from "elysia";
import { getFlightTokens, RPC_ENDPOINT } from "../../utils/token";
import { parseFlightResponse } from "../../utils/parser";

const getSignal = () => AbortSignal.timeout(10000);

export const returnRoutes = new Elysia({ prefix: "/flights" })
  .post("/return", async ({ body }) => {
    const { token, origin, destination, returnDate } = body;

    try {
      const tokens = await getFlightTokens();

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
        [null, token],
        [null, null, 1, null, [], 1, [1, 0, 0, 0], null, null, null, null, null, null,
          [
            [
              [[[origin.toUpperCase(), 0]]],
              [[[destination.toUpperCase(), 0]]],
              null, 0, null, null, returnDate
            ]
          ],
          null, null, null, 1
        ],
        0, 0, 0, 2
      ];

      const fReqPayload = JSON.stringify([null, JSON.stringify(innerPayload)]);
      const reqBody = new URLSearchParams();
      reqBody.append("f.req", fReqPayload);

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
        body: reqBody,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Return flight search failed: ${response.statusText}`,
        };
      }

      const text = await response.text();
      const cleanJson = text.replace(/^\)\]\}'\\s*/, "");
      const flights = parseFlightResponse(cleanJson);

      return {
        success: true,
        data: {
          origin: origin.toUpperCase(),
          destination: destination.toUpperCase(),
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
