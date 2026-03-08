export interface Driver {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  licenseNumber: string;
  licenseDate: string;
  kbm: string;
}

export interface OsagoFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  passportSeries: string;
  passportNumber: string;
  passportIssued: string;
  passportDate: string;
  phone: string;
  email: string;
  address: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  regNumber: string;
  enginePower: string;
  vehicleType: string;
  ptsSeries: string;
  ptsNumber: string;
  stsSeries: string;
  stsNumber: string;
  drivers: Driver[];
  startDate: string;
  usagePeriod: string;
}

export function createDefaultOsagoFormData(): OsagoFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    passportSeries: "",
    passportNumber: "",
    passportIssued: "",
    passportDate: "",
    phone: "",
    email: "",
    address: "",
    make: "",
    model: "",
    year: "",
    vin: "",
    regNumber: "",
    enginePower: "",
    vehicleType: "",
    ptsSeries: "",
    ptsNumber: "",
    stsSeries: "",
    stsNumber: "",
    drivers: [
      {
        id: "1",
        lastName: "",
        firstName: "",
        middleName: "",
        birthDate: "",
        licenseNumber: "",
        licenseDate: "",
        kbm: "",
      },
    ],
    startDate: "",
    usagePeriod: "12",
  };
}
