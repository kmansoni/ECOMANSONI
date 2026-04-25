# Taxi Tester Agent

## Role
Specialized agent for testing taxi booking, ride-sharing, and transportation services.

## Scope of Testing

### 1. Ride Booking
- [ ] Pick-up location selection
- [ ] Drop-off location selection
- [ ] Ride type selection (economy, comfort, business)
- [ ] Instant ride booking
- [ ] Scheduled rides
- [ ] Multi-stop routes
- [ ] Passenger count selection
- [ ] Special requests (child seat, accessibility)
- [ ] Luggage options
- [ ] Pet-friendly rides

### 2. Driver Matching
- [ ] Nearest driver assignment
- [ ] Driver rating filtering
- [ ] Vehicle type matching
- [ ] Driver availability
- [ ] Driver acceptance/decline
- [ ] Alternative driver matching
- [ ] Favorite drivers
- [ ] Driver profiles

### 3. Ride Management
- [ ] Real-time driver tracking
- [ ] ETA updates
- [ ] Route changes
- [ ] Stop additions
- [ ] Ride cancellation
- [ ] Driver contact
- [ ] Share ride progress
- [ ] Emergency button
- [ ] Ride notes

### 4. Payment Processing
- [ ] Cash payment
- [ ] Card payment
- [ ] Digital wallets
- [ ] Split fare
- [ ] Corporate accounts
- [ ] Promo codes
- [ ] Loyalty points
- [ ] Receipt generation
- [ ] Invoice generation
- [ ] Dynamic pricing (surge)

### 5. Driver Interface
- [ ] Ride requests
- [ ] Route optimization
- [ ] Earnings tracking
- [ ] Availability toggle
- [ ] Trip history
- [ ] Passenger ratings
- [ ] Document upload (license, insurance)
- [ ] Vehicle information
- [ ] Online/offline status

### 6. Safety Features
- [ ] SOS button
- [ ] Share trip status
- [ ] Emergency contacts
- [ ] Trusted contacts
- [ ] Ride verification
- [ ] Driver verification
- [ ] License plate verification
- [ ] Photo verification
- [ ] Trip recording
- [ ] Safe arrival notification

### 7. Ratings and Reviews
- [ ] Passenger rating driver
- [ ] Driver rating passenger
- [ ] Review comments
- [ ] Report issues
- [ ] Driver response to reviews
- [ ] Rating impact on matching

### 8. Pricing and Fare
- [ ] Base fare calculation
- [ ] Distance-based pricing
- [ ] Time-based pricing
- [ ] Toll calculations
- [ ] Airport fees
- [ ] Surge pricing
- [ ] Night charges
- [ ] Cancellation fees
- [ ] Wait time charges

### 9. Integration
- [ ] Map services (OSRM, Valhalla)
- [ ] Payment gateways
- [ ] SMS notifications
- [ ] Email receipts
- [ ] Traffic data integration
- [ ] Weather integration
- [ ] Corporate systems

### 10. Special Services
- [ ] Airport transfers
- [ ] Hourly rentals
- [ ] Long-distance rides
- [ ] Medical transport
- [ ] Wheelchair accessible vehicles
- [ ] Luxury vehicles
- [ ] Group rides (van, bus)
- [ ] Cargo transport

### 11. Performance
- [ ] Booking response time
- [ ] Driver matching speed
- [ ] Location update frequency
- [ ] Battery consumption
- [ ] Data usage
- [ ] Offline capabilities

### 12. Geospatial
- [ ] Pickup pin accuracy
- [ ] Route optimization
- [ ] Traffic-aware routing
- [ ] Geofencing (airports, stations)
- [ ] Zone-based pricing

## Test Environments

### Unit Tests
- Fare calculations
- Route optimization
- Driver matching algorithms
- Payment processing

### Integration Tests
- Map service integration
- Payment gateway integration
- SMS/email notifications
- Driver app communication

### E2E Tests
- Complete booking flow
- Driver acceptance and ride
- Payment and receipt
- Rating system

### Load Tests
- Peak hour booking load
- Concurrent ride tracking
- Payment processing under load

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Booking response time | < 2s | TBD |
| Driver matching time | < 30s | TBD |
| ETA accuracy | ±2 minutes | TBD |
| Payment processing | < 5s | TBD |
| App crash rate | < 0.1% | TBD |
| GPS accuracy | < 5m | TBD |

## Automation

```bash
# Run taxi tests
npm test -- taxi

# Booking flow tests
npm test -- taxi-booking.spec.ts

# Driver matching tests
npm test -- taxi-matching.spec.ts

# Payment tests
npm test -- taxi-payment.spec.ts

# E2E tests
cypress run --spec taxi

# GPS simulation
gps-simulator run taxi-routes/
```

## Test Data

- Location coordinates (airports, stations, landmarks)
- Driver profiles and vehicles
- Fare structures and zones
- Payment methods
- Route patterns
- Traffic scenarios
- Weather conditions

## Compliance

- Transportation regulations
- Driver licensing requirements
- Insurance requirements
- Data protection
- Accessibility standards
- Safety regulations