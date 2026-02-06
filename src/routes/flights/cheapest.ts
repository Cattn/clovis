import { Elysia, t } from "elysia";
import type { FlightResult } from "../../types/flight";
import { getFlightTokens, RPC_ENDPOINT } from "../../utils/token";
import { parseFlightResponse } from "../../utils/parser";
import { formatDate } from "../../utils/format";

const getSignal = () => AbortSignal.timeout(10000);

/**
 * ============================================================
 * tfs -> /booking URL builder (protobuf-ish => base64url)
 * ============================================================
 * This generates a tfs blob that *attempts* to represent a fully selected
 * round-trip itinerary (outbound + inbound).
 *
 * It works reliably for many simple cases (often domestic, single-carrier),
 * but some itineraries require additional opaque state and can still show
 * "itinerary unavailable" on Google's side.
 *
 * We also return a stable searchUrl fallback that always loads.
 */

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
  // {1=1, 2="PBI"}
  return concat(fVarint(1, 1n), fStr(2, code));
}

function buildTfuFromOutboundToken(outboundToken: string): string {
  // Observed structure in Google's URL:
  // message {
  //   1: "<outboundToken>"          (string)
  //   2: { 1: 0 }                   (nested message; small UI flag)
  //   4: {}                         (empty nested message)
  // }
  const msg = concat(
    fStr(1, outboundToken),
    fBytes(2, fVarint(1, 0n)),
    fBytes(4, new Uint8Array())
  );

  return base64url(msg);
}

function buildSelectedSearchUrlFromTfs(tfs: string, outboundToken: string): string {
  const u = new URL("https://www.google.com/travel/flights/search");
  u.searchParams.set("tfs", tfs);
  u.searchParams.set("tfu", buildTfuFromOutboundToken(outboundToken));
  u.searchParams.set("hl", "en-US");
  u.searchParams.set("gl", "US");
  u.searchParams.set("curr", "USD");
  return u.toString();
}


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
  // "UA1525" -> "1525", "NK3005" -> "3005"
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

function buildSearchUrl(from: string, to: string, departDate: string, returnDate: string): string {
  // Stable, always loads. Google will convert it internally to tfs/tfu.
  const q = `Flights from ${from} to ${to} on ${departDate} returning ${returnDate}`;
  const u = new URL("https://www.google.com/travel/flights/search");
  u.searchParams.set("q", q);
  u.searchParams.set("hl", "en-US");
  u.searchParams.set("gl", "US");
  u.searchParams.set("curr", "USD");
  return u.toString();
}

/* -------------------------- RPC calls (shopping results) -------------------------- */

async function fetchFlights(
  tokens: { sid: string; bl: string },
  from: string,
  to: string,
  departureDate: string,
  returnDateStr: string
): Promise<FlightResult[]> {
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
      null, null, 1, null, [], 1, [1, 0, 0, 0], null, null, null, null, null, null,
      [
        [[[[from, 0]]], [[[to, 0]]], null, 0, null, null, departureDate, null, null, null, null, null, null, null, 3],
        [[[[to, 0]]], [[[from, 0]]], null, 0, null, null, returnDateStr, null, null, null, null, null, null, null, 3]
      ],
      null, null, null, 1
    ],
    0, 0, 0, 1
  ];

  const fReqPayload = JSON.stringify([null, JSON.stringify(innerPayload)]);
  const body = new URLSearchParams();
  body.append("f.req", fReqPayload);

  const response = await fetch(url.toString(), {
    method: "POST",
    signal: getSignal(),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
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

async function fetchReturnFlights(
  tokens: { sid: string; bl: string },
  outboundToken: string,
  origin: string,
  destination: string,
  returnDate: string
): Promise<FlightResult[]> {
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
    [null, outboundToken],
    [null, null, 1, null, [], 1, [1, 0, 0, 0], null, null, null, null, null, null,
      [
        [
          [[[origin, 0]]],
          [[[destination, 0]]],
          null, 0, null, null, returnDate
        ]
      ],
      null, null, null, 1
    ],
    0, 0, 0, 2
  ];

  const fReqPayload = JSON.stringify([null, JSON.stringify(innerPayload)]);
  const body = new URLSearchParams();
  body.append("f.req", fReqPayload);

  const response = await fetch(url.toString(), {
    method: "POST",
    signal: getSignal(),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "Origin": "https://www.google.com",
      "Referer": "https://www.google.com/travel/flights",
      "x-same-domain": "1",
      "x-goog-ext-259736195-jspb": '["en-US","US","USD",2,null,[300],null,null,7,[]]',
    },
    body,
  });

  if (!response.ok) throw new Error(`Return search failed: ${response.statusText}`);

  const text = await response.text();
  const cleanJson = text.replace(/^\)\]\}'\s*/, "");
  return parseFlightResponse(cleanJson);
}

/* -------------------------- Route -------------------------- */

export const cheapestRoutes = new Elysia({ prefix: "/flights" })
  .get(
    "/cheapest",
    async ({ query }) => {
      const { from, to, departDate, returnDate } = query;

      if (!from || !to) {
        return { success: false, error: "Missing required parameters: 'from' and 'to' are required" };
      }

      try {
        const tokens = await getFlightTokens();

        const departureDate = departDate || formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        const returnDateStr = returnDate || formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

        const FROM = from.toUpperCase();
        const TO = to.toUpperCase();

        const outboundFlights = await fetchFlights(tokens, FROM, TO, departureDate, returnDateStr);
        if (outboundFlights.length === 0) return { success: false, error: "No outbound flights found" };

        const cheapestOutbound = outboundFlights[0]!;
        if (!cheapestOutbound.token) {
          return { success: false, error: "No booking token found for cheapest outbound flight" };
        }

        const returnFlights = await fetchReturnFlights(tokens, cheapestOutbound.token, TO, FROM, returnDateStr);
        if (returnFlights.length === 0) return { success: false, error: "No return flights found" };

        const cheapestReturn = returnFlights[0]!;
        const totalPrice = cheapestOutbound.price;

        // Always produce links (non-null)
        const outSel = pickAirlineAndFlightNumber(cheapestOutbound);
        const inSel = pickAirlineAndFlightNumber(cheapestReturn);

        // If flight number is missing for some reason, still return searchUrl
        let bookingUrl: string | null = null;
        if (outSel.airlineCode && outSel.flightNo && inSel.airlineCode && inSel.flightNo) {
          const tfs = buildTfsRoundTripSelected({
            outbound: {
              date: departureDate,
              origin: FROM,
              dest: TO,
              airlineCode: outSel.airlineCode,
              flightNumber: outSel.flightNo,
            },
            inbound: {
              date: returnDateStr,
              origin: TO,
              dest: FROM,
              airlineCode: inSel.airlineCode,
              flightNumber: inSel.flightNo,
            },
          });
          bookingUrl = buildBookingUrlFromTfs(tfs);
        }

        const searchUrl = buildSearchUrl(FROM, TO, departureDate, returnDateStr);

        return {
          success: true,
          data: {
            from: FROM,
            to: TO,
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
