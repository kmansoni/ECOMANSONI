# Multi-account Architecture (Target)

## Goal

Provide stable multi-account behavior with the following guarantees:

- click on account never logs out current session by itself;
- auth recovery/add account runs in popup flow on top of current session;
- session errors are separated from profile data errors;
- transient network failures never become hard reauth state;
- one source of truth for account list, active account, and per-account status.

## Problems Found in Audit

- two storages are mixed for account identity/session fallback (vault vs account container);
- missing profile fields (for example username) are treated as auth failures;
- timeout/network errors are converted into requiresReauth too aggressively;
- UI blocks account click path and redirects to auth instead of in-place recovery.

## Core Principles

1. Single source of truth
- Use one registry for account records.
- Keep auth artifacts and profile snapshot in explicit sub-sections.

2. State machine first
- Drive account lifecycle by finite states and transitions.
- No implicit transitions from UI side effects.

3. Error taxonomy
- Auth errors, network errors, and profile errors are distinct classes.
- UI decisions are mapped by class, not by raw exception text.

4. Non-destructive UX
- Current active session remains active until next session is fully activated.
- Canceling popup leaves system unchanged.

## Data Model

```ts
export type AccountStatus =
  | "active"
  | "ready"
  | "reauth_required"
  | "profile_incomplete"
  | "switching";

export type FailureClass =
  | "none"
  | "network_transient"
  | "auth_expired"
  | "auth_missing_credentials"
  | "profile_missing_fields"
  | "backend_unavailable";

export interface AccountRecord {
  accountId: string;
  addedAt: string;
  lastActiveAt: string;

  status: AccountStatus;
  failureClass: FailureClass;

  profile: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
    updatedAt: string | null;
  } | null;

  credentials: {
    hasRefreshToken: boolean;
    hasSessionPointer: boolean;
    expiresAt: number | null;
  };
}
```

## State Machine

### States

- active: current authorized account
- ready: account can be switched to immediately
- switching: activation in progress
- reauth_required: auth credentials invalid/expired
- profile_incomplete: auth is valid but profile snapshot is incomplete

### Transitions

- ready -> switching: user requests switch
- switching -> active: session activation succeeds
- switching -> ready: activation canceled by user
- switching -> reauth_required: activation returns auth_expired/auth_missing_credentials
- switching -> ready: activation fails with network_transient/backend_unavailable
- active -> profile_incomplete: profile refresh failed by profile_missing_fields
- profile_incomplete -> ready|active: profile repaired and fetched successfully

## Error Mapping Contract

Map low-level errors into FailureClass:

- timeout/fetch/network -> network_transient
- HTTP 401/invalid refresh token/missing tokens -> auth_expired or auth_missing_credentials
- profile missing username/display requirements -> profile_missing_fields
- 5xx service unavailable -> backend_unavailable

Only auth_expired/auth_missing_credentials can move account to reauth_required.

## Service Layers

1. AccountRegistryService
- read/write account records
- set active account id
- update statuses atomically

2. SessionActivationService
- activate by refresh token first
- fallback by session pointer only if present
- returns typed result: success | recoverable_failure | hard_auth_failure

3. ProfileSnapshotService
- fetch profile independently from session switching
- profile failures never demote valid session to reauth

4. MultiAccountOrchestrator
- single entrypoints: switchAccount, addAccount, recoverAccount
- applies state machine transitions

## UI Architecture

### Account Switcher Drawer

Per account click behavior:

- active + healthy: no-op
- ready: run switch
- reauth_required: open auth popup sheet (password/otp)
- profile_incomplete: open lightweight profile recovery hint, keep switch allowed if auth healthy

### Auth Popup Sheet (non-destructive)

- Opened as nested popup over current session UI.
- Supports:
  - email + password sign-in
  - email OTP sign-in/register flow
- Success:
  - account credentials updated
  - session activation to target/new account
  - popup closes
- Cancel:
  - no logout
  - no navigation to auth page
  - current active session untouched

## Concurrency and Consistency

- account operations are mutex-guarded (already present, keep strict)
- use operation id/sequence for stale async response ignore
- never write activeAccountId before successful activation
- cross-tab sync broadcasts only committed active changes

## Migration Plan

### Phase 1 (already started)

- remove redirect-to-auth on account click for reauth-required paths
- open in-place auth popup flow in switcher/settings

### Phase 2

- introduce FailureClass + AccountStatus in registry
- stop using requiresReauth as universal error bucket

### Phase 3

- unify account container + vault into one registry contract
- make session pointer optional metadata, not primary dependency

### Phase 4

- add integration tests for:
  - network timeout during switch (must not force reauth)
  - missing profile username (must not logout)
  - cancel popup (must keep current session)
  - successful popup auth (must activate new session)

## Acceptance Criteria

- No navigation to /auth from account click in switcher/settings recovery path.
- No signOut side effects during failed/canceled account recovery.
- profile_not_loaded does not block account switch by itself.
- reauth_required only set by typed hard auth failures.
- current session survives cancellation of auth popup.
