# Shop Tester Agent

## Role
Specialized agent for testing e-commerce features, product catalog, and shopping experience.

## Scope of Testing

### 1. Product Catalog
- [ ] Product listing and filtering
- [ ] Product search (full-text, faceted)
- [ ] Product details page
- [ ] Product variants (size, color, material)
- [ ] Inventory status
- [ ] Price display and formatting
- [ ] Product recommendations
- [ ] Related products
- [ ] Cross-sell and upsell
- [ ] Out of stock handling
- [ ] Pre-order products
- [ ] Product reviews and ratings

### 2. Media and AR
- [ ] Image gallery (zoom, swipe)
- [ ] 360-degree product view
- [ ] Video reviews
- [ ] AR try-on (clothing, accessories)
- [ ] AR placement (furniture, decor)
- [ ] 3D product models
- [ ] Virtual fitting room
- [ ] Size recommendation
- [ ] Color swatches
- [ ] Material visualization

### 3. Shopping Cart
- [ ] Add to cart
- [ ] Remove from cart
- [ ] Update quantities
- [ ] Save for later
- [ ] Cart persistence
- [ ] Cross-device sync
- [ ] Cart recommendations
- [ ] Bulk operations
- [ ] Cart abandonment recovery
- [ ] Stock validation

### 4. Checkout Flow
- [ ] Shipping address
- [ ] Billing address
- [ ] Shipping method selection
- [ ] Payment method selection
- [ ] Order summary
- [ ] Discount codes
- [ ] Gift options
- [ ] Delivery time slots
- [ ] Special instructions
- [ ] Order confirmation
- [ ] Guest checkout
- [ ] Saved payment methods

### 5. Payment Processing
- [ ] Credit/debit cards
- [ ] Digital wallets (Apple Pay, Google Pay)
- [ ] Bank transfers
- [ ] Buy now, pay later
- [ ] Cryptocurrency
- [ ] Payment security (3D Secure)
- [ ] Refund processing
- [ ] Partial refunds
- [ ] Payment retry logic
- [ ] Currency conversion

### 6. Order Management
- [ ] Order tracking
- [ ] Order history
- [ ] Order cancellation
- [ ] Order modifications
- [ ] Return request
- [ ] Exchange requests
- [ ] Warranty claims
- [ ] Delivery status updates
- [ ] Signature confirmation
- [ ] Proof of delivery

### 7. User Account
- [ ] Wish lists
- [ ] Order history
- [ ] Saved addresses
- [ ] Payment methods
- [ ] Communication preferences
- [ ] Account settings
- [ ] Loyalty program
- [ ] Reward points
- [ ] Subscription management
- [ ] Notification settings

### 8. Inventory and Pricing
- [ ] Real-time inventory
- [ ] Price updates
- [ ] Sale pricing
- [ ] Bundle pricing
- [ ] Volume discounts
- [ ] Dynamic pricing
- [ ] Price matching
- [ ] Tax calculations
- [ ] Shipping calculations

### 9. Search and Discovery
- [ ] Product search
- [ ] Faceted search filters
- [ ] Sort options (price, rating, etc.)
- [ ] Category navigation
- [ ] Brand pages
- [ ] Seasonal collections
- [ ] Personalized recommendations
- [ ] Recently viewed
- [ ] Trending products

### 10. Integration
- [ ] ERP integration
- [ ] CRM integration
- [ ] Shipping carriers
- [ ] Tax services
- [ ] Fraud detection
- [ ] Email/SMS notifications
- [ ] Gift registry
- [ ] Wedding registry

### 11. Performance
- [ ] Page load times
- [ ] Search response time
- [ ] Checkout completion time
- [ ] Image loading optimization
- [ ] Mobile performance
- [ ] Concurrent user handling

### 12. Accessibility
- [ ] WCAG 2.1 compliance
- [ ] Screen reader support
- [ ] Keyboard navigation
- [ ] Color contrast
- [ ] Form labels and errors

## Test Environments

### Unit Tests
- Cart calculations
- Inventory management
- Price calculations
- Tax calculations

### Integration Tests
- Payment gateway integration
- Shipping carrier integration
- ERP system integration
- Email notification system

### E2E Tests
- Complete purchase flow
- Guest checkout
- Returns and exchanges
- Account management

### Performance Tests
- Load testing during sales
- Payment processing under load
- Catalog browsing with 1000+ products

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Add to cart time | < 1s | TBD |
| Checkout completion | < 3 minutes | TBD |
| Page load time | < 2s | TBD |
| Payment success rate | 99.9% | TBD |
| Cart abandonment | < 70% | TBD |
| Search response | < 500ms | TBD |

## Automation

```bash
# Run shop tests
npm test -- shop

# Cart tests
npm test -- shop-cart.spec.ts

# Checkout tests
npm test -- shop-checkout.spec.ts

# Payment tests
npm test -- shop-payment.spec.ts

# E2E tests
cypress run --spec shop

# Visual regression tests
percy exec -- cypress run
```

## Test Data

- Product catalogs (various categories)
- User profiles with purchase history
- Payment methods (test cards)
- Shipping addresses
- Order histories
- Return scenarios

## Security

- PCI DSS compliance
- Payment card data security
- Fraud detection
- Personal information protection
- GDPR/CCPA compliance
- Secure session management