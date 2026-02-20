import { Elysia, t } from "elysia";
import type { FlightResult } from "../../types/flight";
import { getFlightTokens, RPC_ENDPOINT } from "../../utils/token";
import { parseFlightResponse } from "../../utils/parser";
import { formatDate } from "../../utils/format";

const getSignal = () => AbortSignal.timeout(15000);

function base64url(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function varint(n: bigint): Uint8Array {
  const out: number[] = [];
  while (true) {
    const b = Number(n & 0x7fn);
    n >>= 7n;
    out.push(n ? (b | 0x80) : b);
    if (!n) break;
  }
  return Uint8Array.from(out);
}

function key(fieldNo: number, wireType: number): Uint8Array {
  return varint(BigInt((fieldNo << 3) | wireType));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function fVarint(fieldNo: number, n: bigint): Uint8Array {
  return concat(key(fieldNo, 0), varint(n));
}

function fBytes(fieldNo: number, b: Uint8Array): Uint8Array {
  return concat(key(fieldNo, 2), varint(BigInt(b.length)), b);
}

function fStr(fieldNo: number, s: string): Uint8Array {
  return fBytes(fieldNo, Buffer.from(s, "utf8"));
}

function loc(code: string): Uint8Array {
  return concat(fVarint(1, 1n), fStr(2, code));
}

function leg(params: { date: string; origin: string; dest: string }): Uint8Array {
  const parts: Uint8Array[] = [fStr(2, params.date)];
  parts.push(fBytes(13, loc(params.origin)));
  parts.push(fBytes(14, loc(params.dest)));
  return concat(...parts);
}

function buildTfuFromOutboundToken(outboundToken: string): string {
  const msg = concat(
    fStr(1, outboundToken),
    fBytes(2, fVarint(1, 0n)),
    fBytes(4, new Uint8Array())
  );
  return base64url(msg);
}

async function fetchOneWayFlights(
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
      2,
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
    body,
  });

  if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);

  const text = await response.text();
  const cleanJson = text.replace(/^\)\]\}'\s*/, "");
  return parseFlightResponse(cleanJson);
}

function buildTfsOneWaySearch(opts: { date: string; origin: string; dest: string }): string {
  const maxU64 = (1n << 64n) - 1n;
  const msg = concat(
    fVarint(1, 28n),
    fVarint(2, 2n),
    fBytes(3, leg(opts)),
    fVarint(8, 1n),
    fVarint(9, 1n),
    fVarint(14, 1n),
    fBytes(16, fVarint(1, maxU64)),
    fVarint(19, 2n)
  );
  return base64url(msg);
}

function buildSearchUrl(from: string, to: string, departDate: string): string {
  const u = new URL("https://www.google.com/travel/flights/search");
  u.searchParams.set("tfs", buildTfsOneWaySearch({ date: departDate, origin: from, dest: to }));
  u.searchParams.set("hl", "en-US");
  u.searchParams.set("gl", "US");
  u.searchParams.set("curr", "USD");
  return u.toString();
}

function buildSelectedSearchUrl(from: string, to: string, departDate: string, outboundToken: string): string {
  const u = new URL(buildSearchUrl(from, to, departDate));
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
        const tokens = await getFlightTokens();
        const departureDate = departDate || formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        const FROM = from.toUpperCase();
        const TO = to.toUpperCase();

        const flights = await fetchOneWayFlights(tokens, FROM, TO, departureDate);
        if (flights.length === 0) return { success: false, error: "No flights found" };

        const cheapestOutbound = flights[0]!;
        const totalPrice = cheapestOutbound.price;
        const searchUrl = buildSearchUrl(FROM, TO, departureDate);
        const bookingUrl = cheapestOutbound.token
          ? buildSelectedSearchUrl(FROM, TO, departureDate, cheapestOutbound.token)
          : null;

        return {
          success: true,
          data: {
            from: FROM,
            to: TO,
            departDate: departureDate,
            totalPrice,
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
