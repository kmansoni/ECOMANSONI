/**
 * Insurance routes — lazy-loaded insurance module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const InsuranceHomePage = lazy(() => import("../../pages/insurance/InsuranceHomePage"));
const OsagoCalculatorPage = lazy(() => import("../../pages/insurance/OsagoCalculatorPage"));
const KaskoCalculatorPage = lazy(() => import("../../pages/insurance/KaskoCalculatorPage"));
const DmsCalculatorPage = lazy(() => import("../../pages/insurance/DmsCalculatorPage"));
const TravelCalculatorPage = lazy(() => import("../../pages/insurance/TravelCalculatorPage"));
const PropertyCalculatorPage = lazy(() => import("../../pages/insurance/PropertyCalculatorPage"));
const MortgageCalculatorPage = lazy(() => import("../../pages/insurance/MortgageCalculatorPage"));
const LifeCalculatorPage = lazy(() => import("../../pages/insurance/LifeCalculatorPage"));
const InsuranceComparePage = lazy(() => import("../../pages/insurance/InsuranceComparePage"));
const InsuranceCompaniesPage = lazy(() => import("../../pages/insurance/InsuranceCompaniesPage"));
const InsurancePoliciesPage = lazy(() => import("@/pages/InsurancePoliciesPage"));
const InsuranceCompanyDetailPage = lazy(() => import("../../pages/insurance/InsuranceCompanyDetailPage"));
const InsuranceFaqPage = lazy(() => import("../../pages/insurance/InsuranceFaqPage"));
const InsuranceDownloadPage = lazy(() => import("../../pages/insurance/InsuranceDownloadPage"));
const InsuranceClaimsPage = lazy(() => import("../../pages/insurance/InsuranceClaimsPage"));
const InsuranceNewClaimPage = lazy(() => import("../../pages/insurance/InsuranceNewClaimPage"));
const InsurancePolicyDetailPage = lazy(() => import("../../pages/insurance/InsurancePolicyDetailPage"));
const InsuranceApplyPage = lazy(() => import("../../pages/insurance/InsuranceApplyPage"));
const InsuranceSuccessPage = lazy(() => import("../../pages/insurance/InsuranceSuccessPage"));
const InsuranceAgentPage = lazy(() => import("../../pages/insurance/InsuranceAgentPage"));

export const insuranceRoutes = (): RouteObject[] => [
  { path: "/insurance", lazy: () => Promise.resolve({ Component: InsuranceHomePage }) },
  { path: "/insurance/osago", lazy: () => Promise.resolve({ Component: OsagoCalculatorPage }) },
  { path: "/insurance/kasko", lazy: () => Promise.resolve({ Component: KaskoCalculatorPage }) },
  { path: "/insurance/dms", lazy: () => Promise.resolve({ Component: DmsCalculatorPage }) },
  { path: "/insurance/travel", lazy: () => Promise.resolve({ Component: TravelCalculatorPage }) },
  { path: "/insurance/property", lazy: () => Promise.resolve({ Component: PropertyCalculatorPage }) },
  { path: "/insurance/mortgage", lazy: () => Promise.resolve({ Component: MortgageCalculatorPage }) },
  { path: "/insurance/life", lazy: () => Promise.resolve({ Component: LifeCalculatorPage }) },
  { path: "/insurance/compare", lazy: () => Promise.resolve({ Component: InsuranceComparePage }) },
  { path: "/insurance/companies", lazy: () => Promise.resolve({ Component: InsuranceCompaniesPage }) },
  { path: "/insurance/policies", lazy: () => Promise.resolve({ Component: InsurancePoliciesPage }) },
  { path: "/insurance/policy/:id", lazy: () => Promise.resolve({ Component: InsurancePolicyDetailPage }) },
  { path: "/insurance/apply/:productId", lazy: () => Promise.resolve({ Component: InsuranceApplyPage }) },
  { path: "/insurance/apply", lazy: () => Promise.resolve({ Component: InsuranceApplyPage }) },
  { path: "/insurance/success/:policyId", lazy: () => Promise.resolve({ Component: InsuranceSuccessPage }) },
  { path: "/insurance/agent", lazy: () => Promise.resolve({ Component: InsuranceAgentPage }) },
  { path: "/insurance/company/:slug", lazy: () => Promise.resolve({ Component: InsuranceCompanyDetailPage }) },
  { path: "/insurance/faq", lazy: () => Promise.resolve({ Component: InsuranceFaqPage }) },
  { path: "/insurance/download", lazy: () => Promise.resolve({ Component: InsuranceDownloadPage }) },
  { path: "/insurance/claims", lazy: () => Promise.resolve({ Component: InsuranceClaimsPage }) },
  { path: "/insurance/claims/new", lazy: () => Promise.resolve({ Component: InsuranceNewClaimPage }) },
];