import { existsSync } from "node:fs";
import { getFlightTokens, RPC_ENDPOINT } from "../src/utils/token";
import { parseFlightResponse } from "../src/utils/parser";
import { fetchSearchHtml, searchFlightsFromUrl } from "../src/utils/shopping";
import { buildOneWaySearchUrl, buildRoundTripSearchUrl } from "../src/utils/tfs";
import { formatDate } from "../src/utils/format";

const FROM = (Bun.argv[2] || "JFK").toUpperCase();
const TO = (Bun.argv[3] || "LAX").toUpperCase();
const DEPART = formatDate(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000));
const RETURN = formatDate(new Date(Date.now() + 35 * 24 * 60 * 60 * 1000));

const useColor = process.stdout.isTTY !== false;
const c = (code: string, text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t: string) => c("32", t);
const red = (t: string) => c("31", t);
const yellow = (t: string) => c("33", t);
const dim = (t: string) => c("90", t);
const bold = (t: string) => c("1", t);

type Kind = "ok" | "fail" | "warn";
const results: { kind: Kind; name: string; detail: string }[] = [];

function line(kind: Kind, name: string, detail: string) {
  results.push({ kind, name, detail });
  const tag =
    kind === "ok" ? green("  OK  ") : kind === "fail" ? red(" FAIL ") : yellow(" WARN ");
  console.log(`${tag} ${name}${detail ? dim(`  — ${detail}`) : ""}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pingLocalApi(): Promise<string | null> {
  try {
    const res = await fetch("http://127.0.0.1:3000/api", { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: string };
    return body.name || "API";
  } catch {
    return null;
  }
}

async function checkRpc(): Promise<{ status: number; err13: boolean; hasFlights: boolean; hint: string }> {
  const tokens = await getFlightTokens();
  const url = new URL(RPC_ENDPOINT);
  url.searchParams.set("f.sid", tokens.sid);
  url.searchParams.set("bl", tokens.bl);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("soc-app", "162");
  url.searchParams.set("soc-platform", "1");
  url.searchParams.set("soc-device", "1");
  url.searchParams.set("rt", "c");

  const fromPayload = [[[FROM, 0]]];
  const toPayload = [[[TO, 0]]];
  const inner = [
    [],
    [
      null, null, 1, null, [], 1, [1, 0, 0, 0], null, null, null, null, null, null,
      [
        [fromPayload, toPayload, null, 0, null, null, DEPART, null, null, null, null, null, null, null, 3],
        [toPayload, fromPayload, null, 0, null, null, RETURN, null, null, null, null, null, null, null, 1],
      ],
      null, null, null, 1,
    ],
    0, 0, 0, 1,
  ];
  const body = new URLSearchParams();
  body.append("f.req", JSON.stringify([null, JSON.stringify(inner)]));

  const res = await fetch(url.toString(), {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Origin: "https://www.google.com",
      Referer: "https://www.google.com/travel/flights",
      "x-same-domain": "1",
    },
    body,
  });
  const text = await res.text();
  const parsed = parseFlightResponse(text);
  return {
    status: res.status,
    err13: text.includes("[13]"),
    hasFlights: parsed.length > 0,
    hint: text.includes("unusual traffic") || text.includes("consent.google.com")
      ? "captcha/consent"
      : `${text.length} bytes`,
  };
}

console.log("");
console.log(bold("Clovis dev status"));
console.log(dim(`Live check of Google Flights HTML search  (${FROM} → ${TO}, ${DEPART} / ${RETURN})`));
console.log(dim("Source clone check. Another route: bun scripts/dev-status.ts BOS MIA"));
console.log("");
console.log(bold("Setup"));

const bunVer = Bun.version;
line("ok", "Bun", bunVer);

if (existsSync("node_modules")) {
  line("ok", "Root packages", "node_modules present");
} else {
  line("warn", "Root packages", "run bun install in the repo root");
}

if (existsSync("client/node_modules")) {
  line("ok", "Client packages", "client/node_modules present");
} else {
  line("warn", "Client packages", "run bun install inside client/");
}

const apiName = await pingLocalApi();
if (apiName) {
  line("ok", "Local API", `${apiName} on :3000`);
} else {
  line("warn", "Local API", "not running — start with bun run dev  (or bun run dev:all)");
}

console.log("");
console.log(bold("Google Flights"));

try {
  const tokens = await getFlightTokens();
  line("ok", "Homepage tokens", `sid + bl (${tokens.bl.slice(0, 28)}…)`);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  const captcha = /captcha|consent/i.test(msg);
  line("fail", "Homepage tokens", captcha ? "Google served a captcha/consent page" : msg);
}

await sleep(400);

try {
  const url = buildRoundTripSearchUrl([FROM], TO, DEPART, RETURN);
  const html = await fetchSearchHtml(url);
  const raw = parseFlightResponse(html);
  const flights = await searchFlightsFromUrl(url, [FROM], TO, DEPART);
  const cheapest = flights[0];
  if (flights.length === 0) {
    line(
      "fail",
      "Round-trip HTML search",
      raw.length
        ? `page had ${raw.length} itineraries but none matched ${FROM}→${TO} on ${DEPART}`
        : "no itineraries parsed — Google HTML layout may have changed"
    );
  } else {
    const priceNote = cheapest && cheapest.price ? `$${cheapest.price}` : "price missing";
    const sample = cheapest
      ? `${cheapest.airline || cheapest.airlineCode || "?"} ${priceNote}`
      : "";
    line("ok", "Round-trip HTML search", `${flights.length} outbound  ${sample}`);
    if (cheapest && !cheapest.price) {
      line("warn", "Outbound prices", "flights parsed but price was 0");
    }
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  line("fail", "Round-trip HTML search", msg);
}

await sleep(400);

try {
  const url = buildOneWaySearchUrl([TO], FROM, RETURN);
  const flights = await searchFlightsFromUrl(url, [TO], FROM, RETURN);
  if (flights.length === 0) {
    line("fail", "One-way / return HTML search", `no ${TO}→${FROM} flights on ${RETURN}`);
  } else {
    const cheapest = flights[0]!;
    line(
      "ok",
      "One-way / return HTML search",
      `${flights.length} flights  ${cheapest.airline || cheapest.airlineCode || "?"} ${cheapest.price ? `$${cheapest.price}` : ""}`.trim()
    );
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  line("fail", "One-way / return HTML search", msg);
}

await sleep(400);

try {
  const rpc = await checkRpc();
  if (rpc.hasFlights) {
    line("ok", "Shopping RPC", "GetShoppingResults returned flight data (unexpected — HTML fallback still used)");
  } else if (rpc.err13) {
    line(
      "warn",
      "Shopping RPC",
      "empty (gRPC 13). This is expected"
    );
  } else {
    line("warn", "Shopping RPC", `no flights (HTTP ${rpc.status}, ${rpc.hint}). HTML fallback is in use`);
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  line("warn", "Shopping RPC", `could not check (${msg}). HTML fallback is in use`);
}

const ok = results.filter((r) => r.kind === "ok").length;
const fail = results.filter((r) => r.kind === "fail").length;
const warn = results.filter((r) => r.kind === "warn").length;

console.log("");
console.log(bold("Summary"));
console.log(`  ${green("working")} ${ok}   ${red("not working")} ${fail}   ${yellow("potential issues")} ${warn}`);
console.log("");

if (fail === 0) {
  console.log(green("  Ready to develop."));
} else {
  console.log(red("  Not ready.") + "  Fix the FAIL items above before expecting flight search to work.");
  if (results.some((r) => /captcha|consent/i.test(r.detail))) {
    console.log(dim("  Tip: wait a bit, switch network/VPN, or open Google Flights in a browser once."));
  }
  if (results.some((r) => /layout may have changed|no itineraries/i.test(r.detail))) {
    console.log(dim("  Tip: Google may have changed the search-page HTML again — parser needs an update."));
  }
}
console.log("");

process.exit(fail > 0 ? 1 : 0);
