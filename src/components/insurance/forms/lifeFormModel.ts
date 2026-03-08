export interface Beneficiary {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  relation: string;
  share: string;
}

export interface LifeFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  passportSeries: string;
  passportNumber: string;
  phone: string;
  email: string;
  height: string;
  weight: string;
  isSmoker: boolean;
  hasChronicDiseases: boolean;
  chronicDesc: string;
  hasSurgeries: boolean;
  surgeriesDesc: string;
  disabilityGroup: string;
  profession: string;
  isDangerousWork: boolean;
  hasExtremeSports: boolean;
  activitiesDesc: string;
  programType: string;
  coverageAmount: string;
  term: string;
  paymentFrequency: string;
  beneficiaries: Beneficiary[];
}

export function createDefaultLifeFormData(): LifeFormData {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    gender: "",
    passportSeries: "",
    passportNumber: "",
    phone: "",
    email: "",
    height: "",
    weight: "",
    isSmoker: false,
    hasChronicDiseases: false,
    chronicDesc: "",
    hasSurgeries: false,
    surgeriesDesc: "",
    disabilityGroup: "none",
    profession: "",
    isDangerousWork: false,
    hasExtremeSports: false,
    activitiesDesc: "",
    programType: "risk",
    coverageAmount: "",
    term: "",
    paymentFrequency: "yearly",
    beneficiaries: [],
  };
}
