declare global {
	interface Window {
		__CLOVIS_API_BASE__?: string;
	}
}

const DEV_API_BASE = 'http://localhost:3000';

// The packaged app serves the UI from tauri.localhost while the backend listens on a
// random port, so the webview origin is never a usable API base there. Resolved lazily:
// reading it at module scope races the port injection from Rust.
function apiBase(): string {
	if (typeof window === 'undefined') return DEV_API_BASE;

	const injected = window.__CLOVIS_API_BASE__;
	if (typeof injected === 'string') return injected;

	if (import.meta.env.DEV) return DEV_API_BASE;

	const origin = window.location.origin;
	if (/^tauri:/.test(origin) || /^https?:\/\/tauri\.localhost$/.test(origin)) {
		throw new Error(
			'Clovis could not reach its backend: the API port was never injected into the window.'
		);
	}

	// Served by the API process itself (staticPlugin), where same-origin is correct.
	if (/^https?:/.test(origin)) return origin;

	return DEV_API_BASE;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SEARCH_CONCURRENCY = 3;
const MAX_SEARCH_CONCURRENCY = 8;

export function toYYYYMMDD(d: Date | string | unknown): string {
	if (d == null || d === '') return '';
	const s = typeof d === 'string' ? d.trim() : '';
	if (s && DATE_ONLY.test(s)) return s;
	const date = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date(String(d));
	if (isNaN(date.getTime())) return '';
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + n);
	return out;
}

function toYYYYMMDDUTC(d: Date): string {
	if (isNaN(d.getTime())) return '';
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function getRoundTripPairsInPeriod(
	periodStart: string,
	periodEnd: string,
	tripDays: number
): { departDate: string; returnDate: string }[] {
	const start = new Date(periodStart + 'T00:00:00.000Z');
	const end = new Date(periodEnd + 'T00:00:00.000Z');
	if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end || tripDays < 1) return [];
	const pairs: { departDate: string; returnDate: string }[] = [];
	const cursor = new Date(start);
	while (cursor <= end) {
		const returnD = new Date(cursor);
		returnD.setUTCDate(returnD.getUTCDate() + (tripDays - 1));
		if (returnD <= end) {
			pairs.push({
				departDate: toYYYYMMDDUTC(cursor),
				returnDate: toYYYYMMDDUTC(returnD)
			});
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return pairs;
}

function shouldKeepWeekendCenteredPair(
	departDate: string,
	tripDays: number,
	preferWeekends: boolean
): boolean {
	if (!preferWeekends || tripDays <= 2) return true;
	const depart = new Date(departDate + 'T00:00:00.000Z');
	const spanDays = Math.max(0, tripDays - 1);
	const centerOffset = Math.round(spanDays / 2);
	depart.setUTCDate(depart.getUTCDate() + centerOffset);
	const weekday = depart.getUTCDay();
	return weekday === 5 || weekday === 6 || weekday === 0;
}

function uniquePairs(pairs: { departDate: string; returnDate: string }[]): {
	departDate: string;
	returnDate: string;
}[] {
	const seen = new Set<string>();
	const out: { departDate: string; returnDate: string }[] = [];
	for (const pair of pairs) {
		const key = `${pair.departDate}:${pair.returnDate}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(pair);
	}
	return out;
}

export function getOneWayDatesInPeriod(periodStart: string, periodEnd: string): string[] {
	const start = new Date(periodStart + 'T00:00:00.000Z');
	const end = new Date(periodEnd + 'T00:00:00.000Z');
	if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
	const dates: string[] = [];
	const cursor = new Date(start);
	while (cursor <= end) {
		dates.push(toYYYYMMDDUTC(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return dates;
}

export interface FlightSegment {
	origin: string;
	originName: string;
	destination: string;
	destinationName: string;
	departureTime: string;
	arrivalTime: string;
	duration: string;
	flightNumber: string;
	airline: string;
	aircraft: string;
}

export interface Layover {
	airport: string;
	airportName: string;
	duration: string;
}

export interface FlightLeg {
	price: number;
	airline: string;
	airlineCode: string;
	flightNumber: string;
	origin: string;
	destination: string;
	departureTime: string;
	arrivalTime: string;
	duration: string;
	stops: number;
	aircraft: string;
	token: string;
	segments: FlightSegment[];
	layovers: Layover[];
}

export interface CheapestResult {
	from: string;
	to: string;
	departDate: string;
	returnDate?: string;
	totalPrice: number;
	bookingUrl: string | null;
	searchUrl: string;
	outbound: FlightLeg;
	return: FlightLeg | null;
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

export async function fetchCheapest(
	from: string,
	to: string,
	departDate: string,
	returnDate: string,
	signal?: AbortSignal
): Promise<{ success: true; data: CheapestResult } | { success: false; error: string }> {
	const params = new URLSearchParams({
		from: from.trim().toUpperCase(),
		to: to.trim().toUpperCase(),
		departDate,
		returnDate
	});
	try {
		const res = await fetch(`${apiBase()}/flights/cheapest?${params}`, { signal });
		const json = await res.json();
		if (!res.ok) return { success: false, error: json?.error ?? res.statusText };
		return json;
	} catch (error) {
		if (isAbortError(error)) throw error;
		return { success: false, error: error instanceof Error ? error.message : 'Request failed' };
	}
}

export async function fetchCheapestOneWay(
	from: string,
	to: string,
	departDate: string,
	signal?: AbortSignal
): Promise<{ success: true; data: CheapestResult } | { success: false; error: string }> {
	const params = new URLSearchParams({
		from: from.trim().toUpperCase(),
		to: to.trim().toUpperCase(),
		departDate
	});
	try {
		const res = await fetch(`${apiBase()}/flights/cheapest/oneWay?${params}`, { signal });
		const json = await res.json();
		if (!res.ok) return { success: false, error: json?.error ?? res.statusText };
		return json;
	} catch (error) {
		if (isAbortError(error)) throw error;
		return { success: false, error: error instanceof Error ? error.message : 'Request failed' };
	}
}

export type PeriodSearchError = {
	departDate: string;
	returnDate: string;
	totalPrice: number;
	error: string;
};

export type OneWayPeriodSearchError = {
	departDate: string;
	totalPrice: number;
	error: string;
};

export type PeriodSearchResult = CheapestResult | PeriodSearchError;
export type OneWayPeriodSearchResult = CheapestResult | OneWayPeriodSearchError;

export function isCheapestResult(r: PeriodSearchResult | OneWayPeriodSearchResult): r is CheapestResult {
	return 'outbound' in r && 'return' in r;
}

export interface RoundTripSearchOptions {
	preferWeekends?: boolean;
	durationMode?: 'exact' | 'plus-minus';
	durationVariation?: number;
	concurrency?: number;
	signal?: AbortSignal;
	onProgress?: (done: number, total: number) => void;
}

export interface OneWaySearchOptions {
	concurrency?: number;
	signal?: AbortSignal;
	onProgress?: (done: number, total: number) => void;
}

function normalizeConcurrency(value?: number): number {
	const raw = Math.trunc(value ?? DEFAULT_SEARCH_CONCURRENCY);
	if (!Number.isFinite(raw)) return DEFAULT_SEARCH_CONCURRENCY;
	return Math.min(MAX_SEARCH_CONCURRENCY, Math.max(1, raw));
}

async function runWithConcurrency<TItem, TResult>(
	items: TItem[],
	concurrency: number,
	runItem: (item: TItem, index: number) => Promise<TResult>,
	signal?: AbortSignal
): Promise<TResult[]> {
	if (items.length === 0) return [];
	if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(concurrency, items.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (true) {
			if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
			const index = nextIndex;
			nextIndex++;
			if (index >= items.length) return;
			results[index] = await runItem(items[index] as TItem, index);
		}
	});
	await Promise.all(workers);
	return results;
}

export type TimeFormatPreference = '24h' | '12h';

export function formatFlightTime(
	dateTime: string,
	timeFormat: TimeFormatPreference = '24h'
): string {
	const raw = dateTime.split(' ')[1] ?? dateTime;
	if (timeFormat === '24h') return raw;
	const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
	if (!match) return raw;
	const hour24 = Number(match[1]);
	if (!Number.isFinite(hour24)) return raw;
	const minute = match[2];
	const suffix = hour24 >= 12 ? 'PM' : 'AM';
	const hour12 = hour24 % 12 || 12;
	return `${hour12}:${minute} ${suffix}`;
}

export async function searchCheapestInPeriod(
	from: string,
	to: string,
	periodStart: string,
	periodEnd: string,
	tripDays: number,
	options: RoundTripSearchOptions = {}
): Promise<PeriodSearchResult[]> {
	const durationMode = options.durationMode ?? 'exact';
	const rawVariation = Math.trunc(options.durationVariation ?? 0);
	const durationVariation = Number.isFinite(rawVariation) ? Math.max(0, rawVariation) : 0;
	const minTripDays = Math.max(1, tripDays - (durationMode === 'plus-minus' ? durationVariation : 0));
	const maxTripDays = Math.max(minTripDays, tripDays + (durationMode === 'plus-minus' ? durationVariation : 0));
	const pairs = uniquePairs(
		Array.from({ length: maxTripDays - minTripDays + 1 }, (_, idx) => minTripDays + idx).flatMap(
			(duration) =>
				getRoundTripPairsInPeriod(periodStart, periodEnd, duration).filter(({ departDate }) =>
					shouldKeepWeekendCenteredPair(departDate, duration, options.preferWeekends ?? false)
				)
		)
	);
	if (pairs.length === 0) return [];
	const concurrency = normalizeConcurrency(options.concurrency);
	let done = 0;
	options.onProgress?.(done, pairs.length);
	const results = await runWithConcurrency(pairs, concurrency, async ({ departDate, returnDate }) => {
		const r = await fetchCheapest(from, to, departDate, returnDate, options.signal);
		done++;
		options.onProgress?.(done, pairs.length);
		return r.success ? r.data : { departDate, returnDate, totalPrice: Infinity, error: r.error };
	}, options.signal);
	results.sort(
		(a, b) =>
			(a.totalPrice === Infinity ? Number.MAX_SAFE_INTEGER : a.totalPrice) -
			(b.totalPrice === Infinity ? Number.MAX_SAFE_INTEGER : b.totalPrice)
	);
	return results;
}

export async function searchCheapestOneWayInPeriod(
	from: string,
	to: string,
	periodStart: string,
	periodEnd: string,
	options: OneWaySearchOptions = {}
): Promise<OneWayPeriodSearchResult[]> {
	const dates = getOneWayDatesInPeriod(periodStart, periodEnd);
	if (dates.length === 0) return [];
	const concurrency = normalizeConcurrency(options.concurrency);
	let done = 0;
	options.onProgress?.(done, dates.length);
	const results = await runWithConcurrency(dates, concurrency, async (departDate) => {
		const r = await fetchCheapestOneWay(from, to, departDate, options.signal);
		done++;
		options.onProgress?.(done, dates.length);
		return r.success ? r.data : { departDate, totalPrice: Infinity, error: r.error };
	}, options.signal);
	results.sort(
		(a, b) =>
			(a.totalPrice === Infinity ? 1 : a.totalPrice) -
			(b.totalPrice === Infinity ? 1 : b.totalPrice)
	);
	return results;
}
