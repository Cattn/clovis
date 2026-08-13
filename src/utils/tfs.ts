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

export function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function fVarint(fieldNo: number, n: bigint): Uint8Array {
  return concat(key(fieldNo, 0), varint(n));
}

export function fBytes(fieldNo: number, b: Uint8Array): Uint8Array {
  return concat(key(fieldNo, 2), varint(BigInt(b.length)), b);
}

export function fStr(fieldNo: number, s: string): Uint8Array {
  return fBytes(fieldNo, Buffer.from(s, "utf8"));
}

export function loc(code: string): Uint8Array {
  return concat(fVarint(1, 1n), fStr(2, code));
}

function legSearch(params: { date: string; origins: string[]; destinations: string[] }): Uint8Array {
  const parts: Uint8Array[] = [fStr(2, params.date)];
  for (const origin of params.origins) {
    parts.push(fBytes(13, loc(origin)));
  }
  for (const destination of params.destinations) {
    parts.push(fBytes(14, loc(destination)));
  }
  return concat(...parts);
}

export function buildTfsRoundTripSearch(opts: {
  departDate: string;
  returnDate: string;
  fromAirports: string[];
  toAirports: string[];
}): string {
  const maxU64 = (1n << 64n) - 1n;
  const msg = concat(
    fVarint(1, 28n),
    fVarint(2, 2n),
    fBytes(3, legSearch({ date: opts.departDate, origins: opts.fromAirports, destinations: opts.toAirports })),
    fBytes(3, legSearch({ date: opts.returnDate, origins: opts.toAirports, destinations: opts.fromAirports })),
    fVarint(8, 1n),
    fVarint(9, 1n),
    fVarint(14, 1n),
    fBytes(16, fVarint(1, maxU64)),
    fVarint(19, 1n)
  );
  return base64url(msg);
}

export function buildTfsOneWaySearch(opts: { date: string; origins: string[]; dest: string }): string {
  const maxU64 = (1n << 64n) - 1n;
  const msg = concat(
    fVarint(1, 28n),
    fVarint(2, 2n),
    fBytes(3, legSearch({ date: opts.date, origins: opts.origins, destinations: [opts.dest] })),
    fVarint(8, 1n),
    fVarint(9, 1n),
    fVarint(14, 1n),
    fBytes(16, fVarint(1, maxU64)),
    fVarint(19, 2n)
  );
  return base64url(msg);
}

export function buildTfuFromOutboundToken(outboundToken: string): string {
  const msg = concat(
    fStr(1, outboundToken),
    fBytes(2, fVarint(1, 0n)),
    fBytes(4, new Uint8Array())
  );
  return base64url(msg);
}

function withLocale(url: URL): string {
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("curr", "USD");
  return url.toString();
}

export function buildRoundTripSearchUrl(
  fromAirports: string[],
  toAirport: string,
  departDate: string,
  returnDate: string
): string {
  const tfs = buildTfsRoundTripSearch({
    departDate,
    returnDate,
    fromAirports,
    toAirports: [toAirport],
  });
  const u = new URL("https://www.google.com/travel/flights/search");
  u.searchParams.set("tfs", tfs);
  return withLocale(u);
}

export function buildOneWaySearchUrl(fromAirports: string[], to: string, departDate: string): string {
  const u = new URL("https://www.google.com/travel/flights/search");
  u.searchParams.set("tfs", buildTfsOneWaySearch({ date: departDate, origins: fromAirports, dest: to }));
  return withLocale(u);
}

export { base64url };
