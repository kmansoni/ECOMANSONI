export interface PropertyFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  passportSeries: string;
  passportNumber: string;
  phone: string;
  email: string;
  propertyType: string;
  address: string;
  cadastralNumber: string;
  area: string;
  builtYear: string;
  floor: string;
  totalFloors: string;
  wallMaterial: string;
  roomsCount: string;
  propertyValue: string;
  docType: string;
  docNumber: string;
  docDate: string;
  hasConstruction: boolean;
  hasInterior: boolean;
  hasMovables: boolean;
  hasLiability: boolean;
}

export function createDefaultPropertyFormData(): PropertyFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    passportSeries: "",
    passportNumber: "",
    phone: "",
    email: "",
    propertyType: "apartment",
    address: "",
    cadastralNumber: "",
    area: "",
    builtYear: "",
    floor: "",
    totalFloors: "",
    wallMaterial: "",
    roomsCount: "",
    propertyValue: "",
    docType: "egrn",
    docNumber: "",
    docDate: "",
    hasConstruction: true,
    hasInterior: true,
    hasMovables: false,
    hasLiability: false,
  };
}
