export interface Traveler {
  id: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  passportSeries: string;
  passportNumber: string;
  passportExpiry: string;
}

export interface TravelFormData {
  lastName: string;
  firstName: string;
  birthDate: string;
  citizenship: string;
  passportSeries: string;
  passportNumber: string;
  passportExpiry: string;
  country: string;
  city: string;
  departureDate: string;
  returnDate: string;
  purpose: string;
  flightNumber: string;
  travelers: Traveler[];
  coverageAmount: string;
  hasSports: boolean;
  hasCancellation: boolean;
  hasBaggage: boolean;
  hasAccident: boolean;
}

export function createDefaultTravelFormData(): TravelFormData {
  return {
    lastName: "",
    firstName: "",
    birthDate: "",
    citizenship: "Российская Федерация",
    passportSeries: "",
    passportNumber: "",
    passportExpiry: "",
    country: "",
    city: "",
    departureDate: "",
    returnDate: "",
    purpose: "tourism",
    flightNumber: "",
    travelers: [],
    coverageAmount: "50000",
    hasSports: false,
    hasCancellation: false,
    hasBaggage: false,
    hasAccident: false,
  };
}
