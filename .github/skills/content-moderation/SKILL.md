# Skill: Content Moderation & Safety

**Domain:** Spam detection, CSAM scanning, PII doxxing, toxic language, child safety  
**Files:** `src/lib/chat/moderation.ts`, `src/lib/chat/photodna.ts`, `src/lib/safety/`  
**When to apply:** Message content validation, image upload, user report handling

---

## Knowledge

### Spam Detection
- **Rate limiting**: X msg/min for new accounts, Y msg/min for trusted
- **Duplicate detection**: identical message fingerprint (hash)
- **Flood detection**: burst pattern (10 msg in 5s)
- **Content-based classifiers**: Naive Bayes, Logistic Regression (bag-of-words)
- **Behavioral profiling**: account age, friend count, send time distribution

### CSAM Detection (PhotoDNA)
- **Perceptual hashing**: pHash, dHash, aHash (robust to resize/crop)
- **PhotoDNA database**: NCMEC known hashes (Microsoft)
- **Cross-platform**: PDQHash (open source alternative)
- **Content type**: image only (not text)
- **Takedown procedure**: immediate report to NCMEC, preserve evidence

### PII Detection (Doxxing)
- **Regex patterns**: email (`/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i`), phone (`/(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/`), SSN (`/\d{3}-\d{2}-\d{4}/`)
- **Russian-specific**: INN (10/12 digits), SNILS (XXX-XXX-XXX-XX), passport series/number
- **Address extraction**: named entity recognition (NER)
- **Redaction**: replace with `[EMAIL_REDACTED]`, `[PHONE_REDACTED]`

### Toxic Language
- ** profanity lists**: Google's profanity filter, custom list
- **Hate speech detection**: keyword + context (BERT-based)
- **Harassment patterns**: repeated mentions, threats
- **Severity scoring**: 0 (clean) → 1 (toxic) → 2 (severely toxic)

### Child Safety (COPPA)
- **Age verification**: government ID upload (sumsub, jumio)
- **Age gating**: restrict features for <13
- **Predator detection**: grooming language patterns
- **Parental controls**: screen time limits, contact whitelist

### Ban Evasion
- **Fingerprinting**: canvas fingerprint, WebGL, audio fingerprint
- **IP address reuse**: banned IP → new account
- **Device ID reuse**: hardware identifiers (where available)
- **Behavioral similarity**: messaging patterns match known abuser

---

## Quality Gates

1. **Spam catch rate**: > 99% (F1-score)
2. **False positive rate**: < 0.1% (legitimate messages blocked)
3. **CSAM detection**: 100% (zero tolerance)
4. **PII detection recall**: > 95% (emails, phones)
5. **Toxicity AUC**: > 0.9 (precision/recall trade-off)
6. **Child safety filter**: no predatory content slips through

---

## When to Apply

- Message send validation
- Image upload pipeline
- User report review queue
- Automated moderation (flag/hide/delete)
- Age-gated content filter
- Bot/scam account detection
- Contact list restrictions (minors)
