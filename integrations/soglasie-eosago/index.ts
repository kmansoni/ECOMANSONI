/**
 * SK Soglasie E-OSAGO API
 * 
 * Экспорт модуля интеграции с Е-ОСАГО СК Согласие
 */

// Client
export { SoglasieClient, createClient, type SoglasieConfig, type Environment, type StatusOptions, type WaitOptions, SoglasieError, ApplicationStatus, FINAL_STATUSES, PAYABLE_STATUSES, PENDING_STATUSES, CcmStatus, createCcmRequest } from './lib/client';

// Types
export type {
  KbmRequest,
  KbmResponse,
  KbmDriver,
  KbmOrganization,
  KbmDocument,
  KbmResultPerson,
  KbmError,
  EosagoApplication,
  PrevPolicy,
  PrevPolicyOther,
  CarInfo,
  VehicleDocument,
  Person,
  PhisicalPerson,
  JuridicalPerson,
  Documents,
  Document,
  Addresses,
  Address,
  Drivers,
  Driver,
  PersonFace,
  OldPersonInfo,
  ApplicationResponse,
  EosagoStatusResponse,
  PolicyInfo,
  DriverInfo,
  Coefficient,
  RsaCheck,
  PayLinkResponse,
  AcquiringRequest,
  CatalogResponse,
  ModelInfo,
  ModelTypesResponse,
  Config,
  WorkflowResult,
  WorkflowOptions,
  ApplicationStatus as Status,
  OwnerType,
  VehicleType,
  GoalUse,
  InvoiceRequest,
  InvoiceResponse,
  InvoiceStatus,
  InvoiceListFilters,
  InvoiceListResponse,
  CcmCalcRequest,
  CcmCalcResponse,
  CcmCalcResult,
  DocumentUploadRequest,
  DocumentUploadResponse,
  DocumentInfo,
} from './lib/types';

export { DocumentType, VehicleDocumentType, VehicleTypeCode, OwnerTypeCode, GoalUseCode, InvoiceStatusCode, CcmConstants } from './lib/types';

// Workflow
export { EosagoWorkflow, type WorkflowOptions as EosagoWorkflowOptions, type WorkflowResult as EosagoWorkflowResult, ApplicationStatus as EosagoStatus } from './lib/workflow';