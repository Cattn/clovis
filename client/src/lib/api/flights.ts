declare global {
	interface Window {
		__CLOVIS_API_BASE__?: string;
	}
}

const API_BASE =
	typeof window !== 'undefined' && typeof window.__CLOVIS_API_BASE__ === 'string'
		? window.__CLOVIS_API_BASE__
		: typeof window !== 'undefined' && /^https?:/.test(window.location.origin)
			? window.location.origin
			: 'http://localhost:3000';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

export async function fetchCheapest(
	from: string,
	to: string,
	departDate: string,
	returnDate: string
): Promise<{ success: true; data: CheapestResult } | { success: false; error: string }> {
	const params = new URLSearchParams({
		from: from.trim().toUpperCase(),
		to: to.trim().toUpperCase(),
		departDate,
		returnDate
	});
	const res = await fetch(`${API_BASE}/flights/cheapest?${params}`);
	const json = await res.json();
	if (!res.ok) return { success: false, error: json?.error ?? res.statusText };
	return json;
}

export async function fetchCheapestOneWay(
	from: string,
	to: string,
	departDate: string
): Promise<{ success: true; data: CheapestResult } | { success: false; error: string }> {
	const params = new URLSearchParams({
		from: from.trim().toUpperCase(),
		to: to.trim().toUpperCase(),
		departDate
	});
	const res = await fetch(`${API_BASE}/flights/cheapest/oneWay?${params}`);
	const json = await res.json();
	if (!res.ok) return { success: false, error: json?.error ?? res.statusText };
	return json;
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
	const results = await Promise.all(
		pairs.map(async ({ departDate, returnDate }) => {
			const r = await fetchCheapest(from, to, departDate, returnDate);
			if (!r.success) {
				return { departDate, returnDate, totalPrice: Infinity, error: r.error };
			}
			return r.data;
		})
	);
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
	periodEnd: string
): Promise<OneWayPeriodSearchResult[]> {
	const dates = getOneWayDatesInPeriod(periodStart, periodEnd);
	if (dates.length === 0) return [];
	const results = await Promise.all(
		dates.map(async (departDate) => {
			const r = await fetchCheapestOneWay(from, to, departDate);
			if (!r.success) {
				return { departDate, totalPrice: Infinity, error: r.error };
			}
			return r.data;
		})
	);
	results.sort(
		(a, b) =>
			(a.totalPrice === Infinity ? 1 : a.totalPrice) -
			(b.totalPrice === Infinity ? 1 : b.totalPrice)
	);
	return results;
}
