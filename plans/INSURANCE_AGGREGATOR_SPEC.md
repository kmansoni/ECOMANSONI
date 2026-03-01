# Insurance Aggregator - Technical Specification Document

**Version:** 1.0  
**Created:** 2026-02-28  
**Status:** Ready for Development  
**Project:** Your AI Companion - Insurance Module

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Market Analysis](#market-analysis)
   - [Russian Aggregators](#russian-aggregators)
   - [Foreign Services](#foreign-services)
3. [Current Implementation](#current-implementation)
4. [Architecture Overview](#architecture-overview)
5. [Frontend Requirements](#frontend-requirements)
   - [5.1 Insurance Home Page](#51-insurance-home-page)
   - [5.2 Insurance Calculators](#52-insurance-calculators)
   - [5.3 Comparison System](#53-comparison-system)
   - [5.4 AI Consultant Enhancement](#54-ai-consultant-enhancement)
   - [5.5 User Dashboard](#55-user-dashboard)
   - [5.6 Application Flow](#56-application-flow)
   - [5.7 System Integration](#57-system-integration)
6. [Backend Requirements](#backend-requirements)
   - [6.1 Insurance Products API](#61-insurance-products-api)
   - [6.2 Insurance Company Integration](#62-insurance-company-integration)
   - [6.3 Calculation Engine](#63-calculation-engine)
   - [6.4 Application Processing System](#64-application-processing-system)
   - [6.5 Performance Optimization](#65-performance-optimization)
7. [CRM System Requirements](#crm-system-requirements)
   - [7.1 Admin Panel](#71-admin-panel)
   - [7.2 Task Management](#72-task-management)
   - [7.3 Client Database](#73-client-database)
   - [7.4 Analytics](#74-analytics)
   - [7.5 Automation](#75-automation)
8. [Algorithm Requirements](#algorithm-requirements)
   - [8.1 Recommendation System](#81-recommendation-system)
   - [8.2 Scoring and Underwriting](#82-scoring-and-underwriting)
   - [8.3 Optimization](#83-optimization)
   - [8.4 Data Validation](#84-data-validation)
9. [API Specification](#api-specification)
   - [9.1 Insurance Companies Endpoints](#91-insurance-companies-endpoints)
   - [9.2 Products Endpoints](#92-products-endpoints)
   - [9.3 Calculator Endpoints](#93-calculator-endpoints)
   - [9.4 Application Endpoints](#94-application-endpoints)
10. [Database Schema](#database-schema)
    - [10.1 Existing Tables](#101-existing-tables)
    - [10.2 New Tables](#102-new-tables)
    - [10.3 Migrations](#103-migrations)
11. [Integration Points](#integration-points)
12. [Development Phases](#development-phases)
    - [Phase 1: Foundation](#phase-1-foundation)
    - [Phase 2: Core Features](#phase-2-core-features)
    - [Phase 3: Advanced Features](#phase-3-advanced-features)
    - [Phase 4: Integration & Polish](#phase-4-integration--polish)
13. [Security Requirements](#security-requirements)
14. [Performance Requirements](#performance-requirements)
15. [Testing Strategy](#testing-strategy)
16. [Deployment Plan](#deployment-plan)

---

## 1. Executive Summary

This document defines the comprehensive technical specification for building an insurance aggregator within the Your AI Companion platform. The aggregator will serve as a comprehensive marketplace for comparing and purchasing various types of insurance products from multiple insurance companies.

**Key Objectives:**
- Enable users to compare insurance products from 30+ insurance companies
- Provide real-time insurance premium calculations
- Offer AI-powered recommendations and consulting
- Streamline the application and policy issuance process
- Integrate seamlessly with existing CRM and user management systems

**Target Users:**
- Individual customers seeking insurance (OSAGO, KASKO, DMS, travel, property)
- Corporate clients requiring group insurance policies
- Insurance agents and managers using the CRM system
- Administrators managing the platform

---

## 2. Market Analysis

### 2.1 Russian Aggregators

#### Инссмарт (Inssmart)
- **Website:** inssmart.ru
- **Key Features:**
  - Smart insurance selection using AI technologies
  - Integration with 30+ insurance companies
  - Online policy issuance
  - Calculators for: OSAGO, KASKO, DMS, mortgage, travel
  - KBM (Bonus-Malus) verification
  - Automated policy renewal reminders

#### Сравни.ру (Sravni.ru)
- **Website:**strahovkaru.ru
- **Key Features:**
  - Comprehensive financial product comparison
  - Insurance aggregator with company ratings
  - Customer reviews and feedback
  - Special offers and promotions
  - Expert reviews and analysis
  - Wide range of insurance products

#### Пампаду (Pampadu)
- **Website:** pampadu.ru
- **Key Features:**
  - Insurance marketplace focused on auto insurance
  - Quick policy issuance
  - Dedicated customer support
  - Mobile-first approach
  - Partner network of agents

### 2.2 Foreign Services

#### Policygenius (USA)
- **Website:** policygenius.com
- **Key Features:**
  - Comprehensive insurance comparison
  - Online purchase capability
  - Expert consultations
  - Multi-category coverage (life, auto, home, health)
  - Policy management dashboard

#### Gabi (USA)
- **Website:** gabi.com
- **Key Features:**
  - Automatic insurance comparison
  - Rate shopping across multiple insurers
  - Savings recommendations
  - Seamless switching process

#### Comparethemarket (UK)
- **Website:** comparethemarket.com
- **Key Features:**
  - Popular UK insurance aggregator
  - Price comparison tools
  - Customer reviews
  - Multi-product coverage
  - Mobile app integration

#### Confused.com (UK)
- **Website:** confused.com
- **Key Features:**
  - Auto insurance focus
  - Quick quote comparison
  - Customer service integration
  - Price guarantee features

#### Lemonade (USA)
- **Website:** lemonade.com
- **Key Features:**
  - AI-powered insurance platform
  - Instant claims processing
  - Social impact features
  - Renters, homeowners, auto insurance
  - Quick digital onboarding

#### Root Insurance (USA)
- **Website:** joinroot.com
- **Key Features:**
  - Usage-based insurance
  - Personalized pricing based on driving behavior
  - Mobile app integration
  - Telematics data analysis

---

## 3. Current Implementation

### 3.1 Existing Components

The project already contains the following insurance-related modules:

#### InsuranceAssistant.tsx
- AI consultant for insurance questions
- Location: `src/components/insurance/InsuranceAssistant.tsx`
- Features:
  - Natural language queries about insurance
  - Product recommendations
  - FAQ responses

#### OsagoCalculator.tsx
- OSAGO premium calculator
- Location: `src/components/insurance/OsagoCalculator.tsx`
- Features:
  - Region-based coefficient application
  - Experience and age factors
  - Vehicle power calculations
  - KBM (Bonus-Malus) integration
  - Seasonal usage adjustments

#### useInsurance.ts
- React hooks for insurance data
- Location: `src/hooks/useInsurance.ts`
- Features:
  - Insurance company data fetching
  - Product information retrieval
  - Cache management

### 3.2 Database Tables

#### insurance_companies
- Stores insurance company information
- Fields: id, name, logo_url, rating, phone, website, description, is_active

#### insurance_products
- Stores insurance product types and details
- Fields: id, company_id, product_type, name, description, base_rate, coefficients

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│  InsuranceHomePage │ Calculators │ Comparison │ AI Consultant    │
│  UserDashboard     │ ApplicationForm │ AdminPanel │ ChatWidget     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY LAYER                           │
├─────────────────────────────────────────────────────────────────────┤
│  REST Endpoints │ Authentication │ Rate Limiting │ Caching         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVICES LAYER                         │
├─────────────────────────────────────────────────────────────────────┤
│  ProductService │ CompanyService │ CalculatorService │ CRMService  │
│  NotificationService │ AnalyticsService │ RecommendationService   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL INTEGRATIONS                          │
├─────────────────────────────────────────────────────────────────────┤
│  Insurance Company APIs │ Payment Gateways │ Document Services     │
│  KBM Verification │ VIN Verification │ Credit Bureaus             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  Supabase/PostgreSQL │ Redis Cache │ File Storage                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Frontend Requirements

### 5.1 Insurance Home Page

#### FR-001: Category Selection Widget
- Interactive grid of insurance categories
- Categories: OSAGO, KASKO, DMS, Travel, Property, Life, Mortgage, Business
- Visual icons and descriptions for each category
- Quick search functionality
- Recent selections memory

#### FR-002: Promotional Banners
- Rotating carousel of special offers
- Insurance company promotions
- Seasonal discounts (summer, winter, holidays)
- New product launches
- Animated transitions and effects

#### FR-003: Popular Products Section
- Top 10 most viewed insurance products
- Trending calculations
- Customer favorites
- Dynamic sorting by: popularity, price, rating

#### FR-004: Quick Calculator Links
- One-click access to all calculator types
- Saved calculation presets
- Recent calculations display

#### FR-005: Insurance Company Showcase
- Featured insurance company logos
- Company ratings display
- "Best Price" badges
- Partnership status indicators

### 5.2 Insurance Calculators

#### FR-006: OSAGO Calculator
**Input Parameters:**
- Region (from BD list with coefficients)
- Driving experience (years)
- Driver age
- Vehicle power (HP)
- KBM class (0.5 - 2.45)
- Seasonality (3-12 months)
- Purpose of use (personal/commercial)
- Number of drivers (unlimited/limited)
- Presence of violations

**Output:**
- Base tariff calculation
- Final premium with breakdown
- Available discounts
- Company offers comparison

**Formula (CB RF):**
```
T = TB × K1 × K2 × K3 × K4 × K5 × K6 × K7
Where:
- TB = Base tariff
- K1 = Region coefficient
- K2 = Driver age/experience
- K3 = Vehicle power
- K4 = KBM (bonus-malus)
- K5 = Seasonality
- K6 = Purpose of use
- K7 = Number of drivers
```

#### FR-007: KASKO Calculator
**Input Parameters:**
- Vehicle brand and model
- Year of manufacture
- Mileage
- Vehicle value
- Franchise type (optional/mandatory)
- Anti-theft systems
- Driver age and experience
- Parking location
- Previous claims history

**Output:**
- Comprehensive coverage premium
- Partial coverage option
- Franchise options with pricing
- Discount eligibility
- Company-specific offers

#### FR-008: DMS (Voluntary Health Insurance) Calculator
**Input Parameters:**
- Employee age groups
- Number of insured persons
- Clinic network type (economy/standard/VIP)
- Coverage limits
- Additional services (dentistry, check-ups)
- Pre-existing conditions
- Territorial coverage

**Output:**
- Per-person premium
- Total group premium
- Network options comparison
- Coverage details breakdown

#### FR-009: Travel Insurance Calculator
**Input Parameters:**
- Destination country(s)
- Trip duration
- Type of trip (leisure/business/adventure)
- Coverage amount
- Sports and adventure activities
- Pre-existing conditions coverage
- Number of travelers
- Baggage coverage

**Output:**
- Single trip premium
- Annual multi-trip option
- Coverage comparison
- Country risk ratings

#### FR-010: Property Insurance Calculator
**Input Parameters:**
- Property type (apartment/house/cottage)
- Total area
- Construction year
- Material type (brick/wood/panel)
- Region/location
- Coverage amount
- Additional structures
- Security systems

**Output:**
- Building coverage premium
- Contents coverage option
- Combined policy pricing
- Risk assessment

#### FR-011: Mortgage Insurance Calculator
**Input Parameters:**
- Loan amount
- Down payment amount
- Loan term
- Property value
- Property type
- Borrower age
- Insurance type (required/optional)

**Output:**
- Life insurance premium
- Property insurance premium
- Total monthly payment
- Bank requirements comparison

#### FR-012: Life Insurance Calculator
**Input Parameters:**
- Age
- Gender
- Insurance term
- Coverage amount
- Payment frequency
- Additional riders (accident, critical illness)
- Health class
- Occupation risk

**Output:**
- Term life premium
- Investment component options
- Payment schedule
- Company comparison

#### FR-013: Calculator Results Comparison
- Side-by-side results from multiple companies
- Sort by: price, rating, coverage
- Filter by: price range, company rating
- Save comparison
- Share results

### 5.3 Comparison System

#### FR-014: Company Comparison Tool
- Select up to 5 insurance companies
- Compare: price, coverage, terms, ratings
- Visual charts and graphs
- Highlight differences
- Pros/cons analysis

#### FR-015: Product Comparison Matrix
- Feature-by-feature comparison
- Coverage breakdown tables
- Exclusion lists
- Claim process ratings
- Customer reviews integration

#### FR-016: Interactive Charts
- Price trend charts
- Coverage comparison bars
- Rating radar charts
- Value score calculations

#### FR-017: Ratings and Reviews
- Company star ratings
- User review aggregation
- Expert ratings
- Complaint statistics
- NPS scores

### 5.4 AI Consultant Enhancement

#### FR-018: Intelligent Insurance Advisor
**Features:**
- Conversational interface for insurance queries
- Natural language understanding
- Context-aware responses
- Multi-turn dialogue support

**Capabilities:**
- Insurance product recommendations based on user profile
- Explanation of insurance terms and concepts
- Comparison of similar products
- Assistance with form completion

#### FR-019: Smart Recommendation Engine
**Inputs:**
- User profile data
- Browsing history
- Previous purchases
- Life events (new car, new home, etc.)
- Family composition

**Outputs:**
- Personalized product recommendations
- Coverage optimization suggestions
- Bundling opportunities
- Savings tips

#### FR-020: FAQ and Knowledge Base
- Comprehensive insurance FAQ
- Search functionality
- Category filtering
- Video tutorials
- Step-by-step guides

### 5.5 User Dashboard

#### FR-021: My Policies Section
- List of user's active policies
- Policy details view
- Document storage (pdf, images)
- Renewal reminders
- Quick actions (extend, modify, claim)

#### FR-022: Calculation History
- Past calculations log
- Search and filter
- Re-calculate option
- Share/export functionality

#### FR-023: Favorites and Saved
- Saved insurance companies
- Saved calculations
- Comparison sets
- Custom alerts

#### FR-024: Renewal Notifications
- Policy expiration alerts
- Automatic reminders (30, 14, 7, 1 days)
- Renewal quotes comparison
- One-click renewal

#### FR-025: Profile Management
- Personal information
- Vehicles registry
- Properties registry
- Family members
- Payment methods
- Communication preferences

### 5.6 Application Flow

#### FR-026: Multi-Step Application Form
**Step 1: Product Selection**
- Confirm insurance type
- Select company
- Choose coverage options

**Step 2: Insured Object Details**
- Vehicle/property/person information
- Document upload
- VIN/address verification

**Step 3: Insured Information**
- Personal details
- Contact information
- Beneficiary details (if applicable)

**Step 4: Coverage Customization**
- Coverage limits
- Deductibles
- Additional options
- Exclusions confirmation

**Step-5: Payment**
- Payment method selection
- Payment processing
- Confirmation

**Step 6: Document Signing**
- Electronic signature
- Document review
- Confirmation receipt

#### FR-027: Form Validation
- Real-time validation
- Error highlighting
- Helpful suggestions
- Document format validation
- Cross-field validation

#### FR-028: Document Upload
- ID document scanning
- Vehicle documents
- Property documents
- Previous policy documents
- Progress indicators
- Re-upload capability

#### FR-029: Electronic Signature
- SMS/email verification
- One-time password
- Biometric options
- Legal acceptance tracking

### 5.7 System Integration

#### FR-030: Chat Integration
- Quick access to insurance manager
- Real-time chat support
- Callback request
- Chat history

#### FR-031: Notification System
- Push notifications
- Email notifications
- SMS notifications
- In-app notifications
- Notification preferences

#### FR-032: User Profile Integration
- Single sign-on with existing auth
- Profile data sync
- Preference inheritance
- Security settings

---

## 6. Backend Requirements

### 6.1 Insurance Products API

#### BR-001: RESTful Endpoints
**Companies Resource:**
```
GET    /api/insurance/companies              - List all companies
GET    /api/insurance/companies/:id         - Get company details
POST   /api/insurance/companies              - Create company (admin)
PUT    /api/insurance/companies/:id          - Update company (admin)
DELETE /api/insurance/companies/:id         - Delete company (admin)
GET    /api/insurance/companies/:id/products - Get company's products
```

**Products Resource:**
```
GET    /api/insurance/products                    - List products
GET    /api/insurance/products/:id                - Get product details
POST   /api/insurance/products                    - Create product (admin)
PUT    /api/insurance/products/:id                - Update product (admin)
DELETE /api/insurance/products/:id                - Delete product (admin)
GET    /api/insurance/products/types               - Get product types
GET    /api/insurance/products/search              - Search products
```

**Calculations Resource:**
```
POST   /api/insurance/calculate/osago       - Calculate OSAGO
POST   /api/insurance/calculate/kasko        - Calculate KASKO
POST   /api/insurance/calculate/dms         - Calculate DMS
POST   /api/insurance/calculate/travel       - Calculate travel
POST   /api/insurance/calculate/property     - Calculate property
POST   /api/insurance/calculate/mortgage     - Calculate mortgage
POST   /api/insurance/calculate/life         - Calculate life
```

**Applications Resource:**
```
GET    /api/insurance/applications           - List user's applications
POST   /api/insurance/applications           - Create application
GET    /api/insurance/applications/:id      - Get application details
PATCH  /api/insurance/applications/:id       - Update application
DELETE /api/insurance/applications/:id       - Delete application
POST   /api/insurance/applications/:id/submit - Submit application
POST   /api/insurance/applications/:id/pay   - Process payment
GET    /api/insurance/applications/:id/status - Get application status
```

#### BR-002: Filtering and Pagination
- Query parameters: page, limit, sort, filter
- Filter by: company, product type, price range, rating
- Sort by: price, rating, popularity, name
- Cursor-based pagination for large datasets

#### BR-003: Response Caching
- Cache product listings (TTL: 5 minutes)
- Cache company data (TTL: 15 minutes)
- Cache calculations (TTL: 10 minutes)
- Invalidate on data changes

### 6.2 Insurance Company Integration

#### BR-004: API Adapters
- Abstract adapter interface for each insurance company
- Unified data format transformation
- Error handling and retries
- Rate limiting per company
- Connection pooling

#### BR-005: Company API Implementations
```
InsuranceCompanyAdapter (abstract)
├── SberInsuranceAdapter
├── RosgosstrahAdapter
├── AlfaStrahaAdapter
├── VSKAdapter
├── RESOAdapter
├── SogazAdapter
├── MaksAdapter
├── UralsibAdapter
├── ZurichAdapter
├── AllianzAdapter
└── ... (30+ adapters)
```

#### BR-006: Rate Synchronization
- Scheduled rate updates (configurable per company)
- Real-time rate fetching for calculations
- Rate change history
- Alert on significant changes

#### BR-007: Real-Time Calculations
- Async calculation requests
- WebSocket for calculation updates
- Calculation timeout handling
- Partial results support

### 6.3 Calculation Engine

#### BR-008: OSAGO Calculation Core
**Base Formula Implementation:**
```python
def calculate_osago(params):
    tb = get_base_tariff(params.vehicle_category)
    k1 = get_region_coefficient(params.region)
    k2 = get_age_experience_coefficient(params.age, params.experience)
    k3 = get_power_coefficient(params.vehicle_power)
    k4 = get_kbm_coefficient(params.kbm_class)
    k5 = get_seasonality_coefficient(params.seasonality)
    k6 = get_purpose_coefficient(params.purpose)
    k7 = get_drivers_coefficient(params.driver_count)
    
    return tb * k1 * k2 * k3 * k4 * k5 * k6 * k7
```

#### BR-009: KASKO Calculation Core
- Vehicle depreciation calculation
- Franchise impact calculation
- Risk factor analysis
- Company-specific adjustments

#### BR-010: DMS Calculation Core
- Age-based risk scoring
- Network cost analysis
- Coverage limit calculations
- Administrative cost factors

#### BR-011: Other Product Calculations
- Travel insurance actuarial models
- Property risk assessment
- Life insurance mortality tables
- Mortgage insurance risk scoring

### 6.4 Application Processing System

#### BR-012: Application Workflow
**States:**
- DRAFT → SUBMITTED → VERIFIED → PROCESSING → APPROVED/REJECTED → ISSUED

**State Transitions:**
```
DRAFT → SUBMITTED (user submits)
SUBMITTED → VERIFIED (system validates)
VERIFIED → PROCESSING (sends to insurance company)
PROCESSING → APPROVED (company approves)
APPROVED → ISSUED (policy generated)
PROCESSING → REJECTED (company rejects)
any → CANCELLED (user cancels)
```

#### BR-013: Data Submission
- Format data per insurance company requirements
- Secure data transmission
- Response handling
- Error recovery

#### BR-014: Policy Generation
- PDF policy generation
- Digital signature application
- Document storage
- Delivery to customer

### 6.5 Performance Optimization

#### BR-015: Redis Caching Strategy
```
Cache Keys:
- insurance:companies:list
- insurance:companies:{id}
- insurance:products:list:{type}
- insurance:products:{id}
- insurance:calc:{hash}
- insurance:rates:{company_id}
```

#### BR-016: Query Optimization
- Database indexing strategy
- Query result caching
- Connection pooling
- Batch operations

#### BR-017: Rate Limiting
- Per-user rate limits
- Per-IP rate limits
- Per-endpoint rate limits
- Burst handling

---

## 7. CRM System Requirements

### 7.1 Admin Panel

#### CRM-001: Insurance Company Management
- CRUD operations for companies
- Company profile editing
- Logo and banner management
- Contact information
- API credentials management
- Status toggle (active/inactive)

#### CRM-002: Product Management
- Product type configuration
- Coverage options setup
- Tariff management
- Company-product associations
- Product enable/disable

#### CRM-003: Tariff Management
- Base rate configuration
- Coefficient management
- Discount rules
- Seasonal adjustments
- Promotional pricing

#### CRM-004: User Management
- Role-based access control
- User creation/editing
- Permission management
- Activity logging

### 7.2 Task Management

#### CRM-005: Sales Pipeline
**Stages:**
- New Lead → Contacted → Qualified → Proposal → Negotiation → Won/Lost

**Features:**
- Drag-and-drop interface
- Stage duration tracking
- Win/loss analysis
- Forecast reporting

#### CRM-006: Task Assignment
- Manual assignment
- Auto-assignment rules
- Round-robin distribution
- Workload balancing
- Skill-based routing

#### CRM-007: Application Status Tracking
- Status dashboard
- Timeline view
- SLA monitoring
- Deadline alerts
- Escalation rules

### 7.3 Client Database

#### CRM-008: Client Profiles
- Contact information
- Company affiliation
- Insurance history
- Communication log
- Documents storage

#### CRM-009: Interaction History
- Call logs
- Email correspondence
- Meeting notes
- Document sharing
- Chat transcripts

#### CRM-010: Insurance Portfolio
- Active policies
- Policy history
- Claims history
- Renewal tracking
- Cross-sell opportunities

### 7.4 Analytics

#### CRM-011: Sales Reports
- Revenue by period
- Revenue by product
- Revenue by agent
- Revenue by company
- Trend analysis

#### CRM-012: Conversion Metrics
- Lead-to-application conversion
- Application-to-policy conversion
- Channel effectiveness
- Source attribution

#### CRM-013: KPI Dashboard
- Total premiums
- Policy count
- Average policy value
- Customer satisfaction
- Agent performance

### 7.5 Automation

#### CRM-014: Renewal Notifications
- 90/60/30/14/7 day reminders
- Personalized renewal offers
- Auto-renewal processing
- Renewal rate tracking

#### CRM-015: Reminder System
- Task due dates
- Follow-up schedules
- Meeting reminders
- Escalation alerts

#### CRM-016: Auto-Assignment
- New lead distribution
- Workload-based routing
- Skill matching
- Priority handling

#### CRM-017: Trigger Actions
- Email sequences
- SMS notifications
- Internal alerts
- Status updates

---

## 8. Algorithm Requirements

### 8.1 Recommendation System

#### ALG-001: Collaborative Filtering
- User behavior analysis
- Similar user identification
- Product affinity scoring
- Real-time recommendations

#### ALG-002: Content-Based Recommendations
- Product feature matching
- User profile alignment
- Category preferences
- Price sensitivity analysis

#### ALG-003: Personalization Engine
- User segmentation
- A/B testing integration
- Feedback loops
- Continuous learning

### 8.2 Scoring and Underwriting

#### ALG-004: Risk Assessment Model
- Multi-factor risk scoring
- Historical data analysis
- Predictive modeling
- Confidence intervals

#### ALG-005: Premium Optimization
- Competitive pricing analysis
- Risk-adjusted pricing
- Market positioning
- Profit margin optimization

#### ALG-006: Underwriting Decision Engine
- Automated approval rules
- Manual review triggers
- Exception handling
- Audit trail

### 8.3 Optimization

#### ALG-007: Price Comparison Engine
- Real-time price fetching
- Price trend analysis
- Best price identification
- Price alert system

#### ALG-008: Bundle Optimization
- Multi-product discounts
- Cross-sell recommendations
- Package pricing
- Savings calculator

### 8.4 Data Validation

#### ALG-009: VIN Verification
- VIN format validation
- Vehicle data lookup
- Theft check
- Import verification

#### ALG-010: KBM Verification
- KBM database integration
- Class history
- Accident record
- Discount eligibility

#### ALG-011: Document Validation
- ID document verification
- Address verification
- Signature verification
- Fraud detection

---

## 9. API Specification

### 9.1 Insurance Companies Endpoints

```typescript
// GET /api/insurance/companies
interface GetCompaniesRequest {
  page?: number;
  limit?: number;
  sort?: 'name' | 'rating' | 'popularity';
  filter?: {
    is_active?: boolean;
    product_types?: string[];
  };
}

interface InsuranceCompany {
  id: string;
  name: string;
  logo_url: string;
  rating: number;
  review_count: number;
  phone: string;
  email: string;
  website: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### 9.2 Products Endpoints

```typescript
// GET /api/insurance/products
interface GetProductsRequest {
  page?: number;
  limit?: number;
  type?: InsuranceProductType;
  company_id?: string;
  min_price?: number;
  max_price?: number;
}

enum InsuranceProductType {
  OSAGO = 'osago',
  KASKO = 'kasko',
  DMS = 'dms',
  TRAVEL = 'travel',
  PROPERTY = 'property',
  MORTGAGE = 'mortgage',
  LIFE = 'life'
}

interface InsuranceProduct {
  id: string;
  company_id: string;
  company_name: string;
  type: InsuranceProductType;
  name: string;
  description: string;
  base_rate: number;
  min_premium: number;
  max_premium: number;
  coverage_options: CoverageOption[];
  is_active: boolean;
}
```

### 9.3 Calculator Endpoints

```typescript
// POST /api/insurance/calculate/osago
interface OsagoCalculationRequest {
  region: string;
  vehicle_category: string;
  vehicle_power: number;
  driver_age: number;
  driving_experience: number;
  kbm_class: number;
  seasonality: number;
  purpose: 'personal' | 'commercial';
  driver_count: number;
  has_violations: boolean;
}

interface CalculationResponse {
  calculation_id: string;
  product_type: InsuranceProductType;
  premium: number;
  breakdown: {
    base_tariff: number;
    coefficients: {
      name: string;
      value: number;
      impact: number;
    }[];
  };
  company_offers: CompanyOffer[];
  created_at: string;
}
```

### 9.4 Application Endpoints

```typescript
// POST /api/insurance/applications
interface CreateApplicationRequest {
  product_type: InsuranceProductType;
  product_id: string;
  company_id: string;
  insured_data: InsuredData;
  coverage_options: string[];
  payment_method: PaymentMethod;
}

interface Application {
  id: string;
  user_id: string;
  product_type: InsuranceProductType;
  product_id: string;
  company_id: string;
  status: ApplicationStatus;
  premium: number;
  documents: Document[];
  created_at: string;
  updated_at: string;
}

enum ApplicationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  VERIFIED = 'verified',
  PROCESSING = 'processing',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ISSUED = 'issued',
  CANCELLED = 'cancelled'
}
```

---

## 10. Database Schema

### 10.1 Existing Tables

```sql
-- Existing tables (to be used)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES users(id),
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ
);
```

### 10.2 New Tables

```sql
-- Insurance Companies
CREATE TABLE insurance_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  banner_url TEXT,
  rating DECIMAL(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  phone TEXT,
  email TEXT,
  website TEXT,
  description TEXT,
  legal_address TEXT,
  inn TEXT,
  ogrn TEXT,
  license_number TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insurance Products
CREATE TABLE insurance_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES insurance_companies(id),
  type TEXT NOT NULL, -- osago, kasko, dms, travel, property, mortgage, life
  name TEXT NOT NULL,
  description TEXT,
  base_rate DECIMAL(10,4),
  min_premium DECIMAL(12,2),
  max_premium DECIMAL(12,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Coverage Options
CREATE TABLE insurance_coverage_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES insurance_products(id),
  name TEXT NOT NULL,
  description TEXT,
  default_value TEXT,
  is_included BOOLEAN DEFAULT false,
  price_impact DECIMAL(10,4),
  sort_order INTEGER DEFAULT 0
);

-- Tariffs and Coefficients
CREATE TABLE insurance_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES insurance_companies(id),
  product_type TEXT NOT NULL,
  region_code TEXT,
  parameter_name TEXT NOT NULL,
  parameter_value TEXT,
  coefficient DECIMAL(10,4),
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT true
);

-- User Vehicles
CREATE TABLE user_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  vin TEXT,
  brand TEXT,
  model TEXT,
  year INTEGER,
  registration_number TEXT,
  license_series TEXT,
  license_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Properties
CREATE TABLE user_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  property_type TEXT, -- apartment, house, cottage
  address TEXT,
  area DECIMAL(10,2),
  value DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calculations History
CREATE TABLE insurance_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  product_type TEXT NOT NULL,
  product_id UUID REFERENCES insurance_products(id),
  company_id UUID REFERENCES insurance_companies(id),
  input_data JSONB,
  premium DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insurance Applications
CREATE TABLE insurance_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  product_type TEXT NOT NULL,
  product_id UUID REFERENCES insurance_products(id),
  company_id UUID REFERENCES insurance_companies(id),
  status TEXT DEFAULT 'draft',
  insured_data JSONB,
  coverage_selected JSONB,
  premium DECIMAL(12,2),
  policy_number TEXT,
  policy_url TEXT,
  submitted_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  expires_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Application Documents
CREATE TABLE application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES insurance_applications(id),
  document_type TEXT,
  file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Favorites
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  item_type TEXT, -- company, product, calculation
  item_id UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company Ratings
CREATE TABLE company_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES insurance_companies(id),
  user_id UUID REFERENCES users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 10.3 Migration Files

Required migrations:
1. `20260301000000_insurance_companies.sql` - Companies table
2. `20260301000001_insurance_products.sql` - Products tables
3. `20260301000002_insurance_tariffs.sql` - Tariffs tables
4. `20260301000003_user_data.sql` - User vehicles/properties
5. `20260301000004_calculations.sql` - Calculations history
6. `20260301000005_applications.sql` - Applications tables
7. `20260301000006_rls_policies.sql` - Row-level security

---

## 11. Integration Points

### 11.1 Existing System Integration

| Integration | Description | Status |
|-------------|-------------|--------|
| Authentication | Use existing Supabase Auth | Required |
| User Profiles | Extend existing profiles table | Required |
| Notifications | Integrate with notification service | Required |
| Chat | Connect to existing chat module | Required |
| CRM | Use existing user/role system | Required |

### 11.2 External Services

| Service | Purpose | Integration Type |
|---------|---------|------------------|
| Insurance Company APIs | Rate fetching, policy issuance | REST/SOAP |
| KBM Database | Driver bonus-malink verification | REST |
| VIN Services | Vehicle identification | REST |
| Payment Gateways | Payment processing | REST |
| Document Services | PDF generation, signing | REST |
| SMS/Email Services | Notifications | REST |

---

## 12. Development Phases

### Phase 1: Foundation (2 weeks)

**Objectives:**
- Database schema implementation
- Basic API endpoints
- Core calculator logic
- Initial frontend components

**Deliverables:**
- All new database tables
- CRUD API for companies and products
- OSAGO calculator implementation
- Basic UI components

### Phase 2: Core Features (3 weeks)

**Objectives:**
- All calculator types
- Comparison system
- User dashboard
- Application flow

**Deliverables:**
- All insurance calculators
- Comparison tool
- User policy management
- Multi-step application form

### Phase 3: Advanced Features (3 weeks)

**Objectives:**
- AI consultant enhancement
- Recommendation system
- CRM integration
- Advanced analytics

**Deliverables:**
- Smart recommendation engine
- CRM admin panel
- Analytics dashboard
- Automation rules

### Phase 4: Integration & Polish (2 weeks)

**Objectives:**
- External API integration
- Performance optimization
- Testing and bug fixes
- Documentation

**Deliverables:**
- Company API integrations
- Performance benchmarks
- Test coverage >80%
- User documentation

---

## 13. Security Requirements

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- API key management for external services

### Data Protection
- Encryption at rest
- Encryption in transit (TLS 1.3)
- PII data handling compliance
- GDPR-compliant data retention

### API Security
- Rate limiting per user/IP
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF tokens

### Audit & Compliance
- Comprehensive logging
- Audit trail for sensitive operations
- Regular security audits
- Vulnerability scanning

---

## 14. Performance Requirements

### Response Times
- API response: <200ms (p95)
- Calculator response: <500ms (p95)
- Page load: <2s (p95)
- Search results: <300ms (p95)

### Scalability
- Support 10,000+ concurrent users
- Handle 1,000+ calculations per minute
- Process 100+ applications per hour

### Availability
- 99.9% uptime
- <5min recovery time objective
- Automated failover

---

## 15. Testing Strategy

### Unit Tests
- Calculator logic
- Data validation
- API endpoints
- Utility functions

### Integration Tests
- Database operations
- External API mocking
- Authentication flows

### E2E Tests
- User registration flow
- Calculator usage
- Application submission
- Payment processing

### Performance Tests
- Load testing
- Stress testing
- Endurance testing

---

## 16. Deployment Plan

### Infrastructure Requirements
- Application servers (auto-scaling)
- Database (PostgreSQL cluster)
- Redis cache cluster
- CDN for static assets
- Load balancer

### CI/CD Pipeline
- Automated testing on PR
- Staging deployment
- Production deployment
- Rollback procedures

### Monitoring
- Application monitoring
- Error tracking
- Performance metrics
- User behavior analytics

---

## Appendix A: Product Type Codes

```typescript
const INSURANCE_PRODUCT_TYPES = {
  OSAGO: 'osago',
  KASKO: 'kasko',
  DMS: 'dms',
  TRAVEL: 'travel',
  PROPERTY: 'property',
  MORTGAGE: 'mortgage',
  LIFE: 'life',
  BUSINESS: 'business',
  ACCIDENT: 'accident',
  PET: 'pet'
} as const;
```

## Appendix B: API Error Codes

```typescript
const API_ERRORS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;
```

## Appendix C: Calculation Coefficients Reference

### OSAGO Coefficients (2024)
| Code | Name | Value Range |
|------|------|-------------|
| K1 | Region | 0.64 - 1.99 |
| K2 | Age/Experience | 0.93 - 1.93 |
| K3 | Vehicle Power | 0.6 - 1.6 |
| K4 | KBM | 0.5 - 2.45 |
| K5 | Seasonality | 0.9 - 1.0 |
| K6 | Purpose | 1.0 - 1.16 |
| K7 | Drivers | 1.0 - 1.87 |

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-28  
**Next Review:** 2026-03-15  
**Document Owner:** Product Team  
**Technical Lead:** Backend Team  
