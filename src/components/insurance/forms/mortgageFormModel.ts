export interface MortgageFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  passportSeries: string;
  passportNumber: string;
  snils: string;
  phone: string;
  email: string;
  bank: string;
  creditNumber: string;
  creditDate: string;
  creditAmount: string;
  creditBalance: string;
  interestRate: string;
  creditTerm: string;
  propertyAddress: string;
  cadastralNumber: string;
  propertyType: string;
  propertyArea: string;
  propertyValue: string;
  hasLifeCoverage: boolean;
  hasTitleCoverage: boolean;
  hasPropertyCoverage: boolean;
}

export function createDefaultMortgageFormData(): MortgageFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    gender: "",
    passportSeries: "",
    passportNumber: "",
    snils: "",
    phone: "",
    email: "",
    bank: "",
    creditNumber: "",
    creditDate: "",
    creditAmount: "",
    creditBalance: "",
    interestRate: "",
    creditTerm: "",
    propertyAddress: "",
    cadastralNumber: "",
    propertyType: "apartment",
    propertyArea: "",
    propertyValue: "",
    hasLifeCoverage: true,
    hasTitleCoverage: false,
    hasPropertyCoverage: true,
  };
}
