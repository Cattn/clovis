const API_BASE = 'http://localhost:3000';

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
	returnDate: string;
	totalPrice: number;
	bookingUrl: string;
	searchUrl: string;
	outbound: FlightLeg;
	return: FlightLeg;
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

export type PeriodSearchError = {
	departDate: string;
	returnDate: string;
	totalPrice: number;
	error: string;
};

export type PeriodSearchResult = CheapestResult | PeriodSearchError;

export function isCheapestResult(r: PeriodSearchResult): r is CheapestResult {
	return 'outbound' in r && 'return' in r;
}

export async function searchCheapestInPeriod(
	from: string,
	to: string,
	periodStart: string,
	periodEnd: string,
	tripDays: number
): Promise<PeriodSearchResult[]> {
	const pairs = getRoundTripPairsInPeriod(periodStart, periodEnd, tripDays);
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
			(a.totalPrice === Infinity ? 1 : a.totalPrice) -
			(b.totalPrice === Infinity ? 1 : b.totalPrice)
	);
	return results;
}
