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

export interface FlightResult {
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

export interface TokenResponse {
  sid: string;
  bl: string;
}

export interface SearchParams {
  from: string;
  to: string;
  departDate?: string;
  returnDate?: string;
}

export interface ReturnSearchParams {
  token: string;
  origin: string;
  destination: string;
  returnDate: string;
}
