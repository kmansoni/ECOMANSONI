# Insurance Tester Agent

## Role
Specialized agent for testing insurance products, claims processing, and policy management.

## Scope of Testing

### 1. Policy Management
- [ ] Policy purchase flow
- [ ] Policy renewal
- [ ] Policy cancellation
- [ ] Policy modifications
- [ ] Coverage adjustments
- [ ] Beneficiary updates
- [ ] Policy documents generation
- [ ] Electronic signature
- [ ] Policy comparison
- [ ] Quote generation

### 2. Auto Insurance
- [ ] OSAGO (CTP) purchase
- [ ] KASKO (comprehensive) purchase
- [ ] Coverage options selection
- [ ] Deductible configuration
- [ ] Driver history integration
- [ ] Vehicle information validation
- [ ] License plate verification
- [ ] Policy card generation
- [ ] Green card (international)
- [ ] Claims history consideration

### 3. Health Insurance
- [ ] Plan selection
- [ ] Coverage limits
- [ ] Deductible options
- [ ] Provider network
- [ ] Pre-existing conditions
- [ ] Family coverage
- [ ] Premium calculations
- [ ] Copay configuration
- [ ] Out-of-network coverage
- [ ] Prescription drug coverage

### 4. Property Insurance
- [ ] Home insurance quotes
- [ ] Coverage types (structure, contents)
- [ ] Natural disaster coverage
- [ ] Theft protection
- [ ] Liability coverage
- [ ] Valuable items coverage
- [ ] Rental property insurance
- [ ] Condo/co-op insurance
- [ ] Flood insurance
- [ ] Earthquake insurance

### 5. Life Insurance
- [ ] Term life policies
- [ ] Whole life policies
- [ ] Universal life policies
- [ ] Coverage amount selection
- [ ] Beneficiary designation
- [ ] Medical underwriting
- [ ] Premium payment options
- [ ] Policy loans
- [ ] Cash value tracking
- [ ] Policy conversion

### 6. Claims Processing
- [ ] Claim submission
- [ ] Document upload (photos, receipts)
- [ ] Claim status tracking
- [ ] Adjuster assignment
- [ ] Damage assessment
- [ ] Repair estimates
- [ ] Approval workflow
- [ ] Payment processing
- [ ] Partial payments
- [ ] Claim denial with appeal
- [ ] Dispute resolution

### 7. Integration
- [ ] DMV/license verification
- [ ] Medical records integration
- [ ] Property records lookup
- [ ] Credit scoring integration
- [ ] Fraud detection systems
- [ ] Payment gateways
- [ ] Document management systems
- [ ] Email/SMS notifications
- [ ] Third-party assessors

### 8. Pricing and Quotes
- [ ] Risk assessment algorithms
- [ ] Premium calculations
- [ ] Discount application (multi-policy, safe driver)
- [ ] Tax calculations
- [ ] Fee structures
- [ ] Quote accuracy
- [ ] Quote expiration
- [ ] Price comparison

### 9. Underwriting
- [ ] Risk scoring
- [ ] Application validation
- [ ] Medical underwriting (health/life)
- [ ] Driving record checks
- [ ] Property inspections
- [ ] Coverage recommendations
- [ ] Approval workflow
- [ ] Rejection with reasons

### 10. Billing and Payments
- [ ] Premium billing (monthly, quarterly, annual)
- [ ] Payment processing
- [ ] Late payment handling
- [ ] Grace periods
- [ ] Policy lapse prevention
- [ ] Automatic renewal
- [ ] Payment plan options
- [ ] Cancellation refunds

### 11. Customer Portal
- [ ] Policy dashboard
- [ ] Document access
- [ ] ID card download
- [ ] Coverage details
- [ ] Payment history
- [ ] Claims history
- [ ] Profile management
- [ ] Communication preferences
- [ ] Agent contact

### 12. Compliance and Regulations
- [ ] State-specific requirements
- [ ] Federal regulations
- [ ] Data privacy (GLBA)
- [ ] Accessibility standards
- [ ] Audit trails
- [ ] Document retention
- [ ] E-signature compliance
- [ ] Consumer protection laws

### 13. Performance
- [ ] Quote generation time
- [ ] Policy purchase time
- [ ] Claims processing time
- [ ] Document generation speed
- [ ] System availability
- [ ] Concurrent user handling

## Test Environments

### Unit Tests
- Premium calculations
- Risk scoring algorithms
- Coverage validations
- Payment processing

### Integration Tests
- DMV/license verification
- Medical records integration
- Payment gateway integration
- Document management

### E2E Tests
- Complete policy purchase
- Claims submission and processing
- Policy renewal workflow
- Customer portal functionality

### Load Tests
- Peak period quote requests
- Payment processing volume
- Claims submission surge

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Quote generation | < 5s | TBD |
| Policy purchase | < 3 minutes | TBD |
| Claims submission | < 5 minutes | TBD |
| Claims approval | < 24 hours | TBD |
| Payment processing | < 10s | TBD |
| System availability | 99.9% | TBD |

## Automation

```bash
# Run insurance tests
npm test -- insurance

# Policy tests
npm test -- insurance-policy.spec.ts

# Claims tests
npm test -- insurance-claims.spec.ts

# Pricing tests
npm test -- insurance-pricing.spec.ts

# E2E tests
cypress run --spec insurance

# API tests
newman run insurance-api-tests.json
```

## Test Data

- Policy configurations (auto, health, home, life)
- User profiles with risk profiles
- Vehicle information
- Property details
- Medical history scenarios
- Claims scenarios
- Payment methods
- Document templates

## Security

- PCI DSS compliance for payments
- HIPAA compliance for health data
- GLBA compliance
- Data encryption at rest and in transit
- Access controls and audit trails
- Fraud detection
- PII protection