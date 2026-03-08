export interface DmsFormData {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  passportSeries: string;
  passportNumber: string;
  phone: string;
  email: string;
  snils: string;
  hasChronicDiseases: boolean;
  chronicDesc: string;
  hasAllergies: boolean;
  allergiesDesc: string;
  currentMeds: string;
  bloodGroup: string;
  height: string;
  weight: string;
  programType: string;
  clinic: string;
  hasDental: boolean;
  hasEmergency: boolean;
  hasConsultation: boolean;
  isCorporate: boolean;
  companyInn: string;
  companyName: string;
  employeesCount: string;
}

export function createDefaultDmsFormData(): DmsFormData {
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
    snils: "",
    hasChronicDiseases: false,
    chronicDesc: "",
    hasAllergies: false,
    allergiesDesc: "",
    currentMeds: "",
    bloodGroup: "",
    height: "",
    weight: "",
    programType: "standard",
    clinic: "",
    hasDental: false,
    hasEmergency: true,
    hasConsultation: false,
    isCorporate: false,
    companyInn: "",
    companyName: "",
    employeesCount: "",
  };
}
