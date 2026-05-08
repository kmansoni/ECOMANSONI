# Skill: Compliance & Legal (GDPR/CCPA/COPPA)

**Domain:** Privacy law, data retention, consent management  
**Files:** `src/lib/chat/gdpr.ts`, `src/lib/privacy/`, `migrations/`  
**When to apply:** New data collection, analytics, cross-border transfers, AI features

---

## Knowledge

### GDPR (EU) — General Data Protection Regulation
- **Art. 6 (Lawful basis)**: consent, contract, legal obligation
- **Art. 7 (Consent)**: freely given, specific, informed, unambiguous
- **Art. 15 (Right of access)**: data subject access request (DSAR)
- **Art. 16 (Right to rectification)**: correct inaccurate data
- **Art. 17 (Right to erasure)**: complete deletion ("right to be forgotten")
- **Art. 18 (Right to restrict processing)**: block processing
- **Art. 20 (Right to data portability)**: JSON/MBOX export
- **Art. 21 (Right to object)**: opt-out of direct marketing
- **Art. 25 (Data protection by design)**: privacy baked in
- **Art. 32 (Security of processing)**: encryption, pseudonymization
- **Art. 35 (DPIA)**: Data Protection Impact Assessment for high-risk processing

### CCPA (California) — California Consumer Privacy Act
- **Right to know**: what personal info is collected
- **Right to delete**: similar to GDPR Art. 17
- **Right to opt-out**: sale of personal information
- **Do not sell or share** button
- **Age restriction**: 16+ for data selling

### COPPA (Children's Online Privacy Protection Act)
- **Age < 13**: verifiable parental consent required
- **Data collection limits**: only necessary for activity
- **Parental rights**: review/delete child's data
- **Data retention**: delete after purpose fulfilled

### Data Subject Rights (DSR)
- **Access request**: export all user data within 30 days
- **Deletion request**: Nuke all PII (but keep aggregated metrics)
- **Portability**: structured, machine-readable (JSON)
- **Rectification**: fix inaccurate data
- **Restriction**: temporarily halt processing

### International Data Transfers
- **Schrems II**: EU→US transfers require SCCs + TIA
- **Standard Contractual Clauses (SCC)**: ensure adequate protection
- **Adequacy decisions**: EU↔UK, EU↔Japan OK; EU↔US ⚠️
- **Pseudonymization**: reduce GDPR scope (but still PII)

### Retention Policies
- **Message data**: 30 days default, 1 year for premium
- **Analytics**: 90 days aggregated, then aggregate-only
- **Logs**: 7 days (PII purged), 30 days aggregated
- **Payment data**: 7 years (tax law), but separate DB
- **Backups**: 30 days (encrypted, auto-purge)

### Breach Notification
- **GDPR**: notify SA within 72h, affected data subjects without undue delay
- **CCPA**: notify Attorney General if >500 residents
- **Encrypted data**: not reportable if key not compromised

---

## Quality Gates

1. **Deletion completeness**: verify all tables wiped (< 1hr)
2. **Export completeness**: 100% of user data exportable
3. **Consent logging**: every collection event audited
4. **Age gate**: no data from under-13 without parental consent
5. **Retention auto-purge**: scheduled job runs daily
6. **Cross-border**: no EU→US without SCC

---

## When to Apply

- Any new user data collection point
- Analytics implementation
- Cross-border data transfer
- AI/ML training data sourcing
- Payment processing
- Logging (structured logging without PII)
- Third-party SDK integration
- Data retention policy setup
