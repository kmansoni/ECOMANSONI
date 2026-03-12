# Testing Authentication Flows

## Current Auth Flows

- Primary: `send-email-otp` + `verify-email-otp`
- Optional: `send-sms-otp` + `verify-sms-otp`
- Legacy `phone-auth` removed

## Manual Test: Email OTP (Primary)

1. Open `/auth`
2. Start login/registration with phone + email
3. Trigger OTP send to email
4. Enter OTP code from email
5. Verify successful session creation and redirect

Expected:

- User is authenticated
- Profile/session data is loaded
- Protected pages are accessible

## Manual Test: SMS OTP (Optional)

1. Call `send-sms-otp`
2. Capture `challenge_id` from response
3. Call `verify-sms-otp` with `phone`, `code`, and `challenge_id`
4. Verify successful sign-in/sign-up behavior

Expected:

- Wrong code increments attempts
- Expired code is rejected
- Valid code consumes OTP record

## Troubleshooting

| Error | Cause | Action |
|---|---|---|
| `JWT` / `auth` errors | Invalid or expired session | Re-login and retry |
| `does not exist` for OTP function | Missing migration/deployment | Deploy corresponding edge function/migrations |
| OTP accepted but no session | Verify env keys in edge functions | Check `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, OTP secrets |

## Notes

- This file was updated after removing deprecated `phone-auth` implementation.
