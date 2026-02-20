# Testing Phone-Auth Flow (No SMS)

## Updated Flow

The system now uses **phone-auth** Edge Function instead of SMS-based OTP:
- ✅ No SMS code required
- ✅ Direct login/registration
- ✅ Works in development

## Test Login

### 1. Owner Account (khan@mansoni.ru)

**URL:** http://localhost:5173

1. Click "Регистрация" (Register)
2. Enter phone: `+79333222922`
3. Wait for completion (no SMS code!)
4. Fill profile:
   - Имя: **Джехангир**
   - Фамилия: **Мансуров**
   - Email: **khan@mansoni.ru**
   - Дата рождения: **1995** (any date 18+)
   - Пол: **Мужской**
   - Тип: **Физ. лицо**
5. Click "Создать аккаунт"
6. Should redirect to Home page with "Добро пожаловать!" message

### 2. Test User

Repeat with:
- Phone: `+79999999999`
- Name: Test User
- Email: test@example.com

## Login Test

After registration:

1. Click "Вход" (Login)
2. Enter phone: `+79333222922` (or test user phone)
3. Wait - **should authenticate immediately without SMS**
4. Redirect to Home page

## Verification Badges

After Owner creation (manual via Supabase):

```sql
INSERT INTO user_verifications (user_id, verification_type, is_active, verified_by_admin_id, reason)
VALUES 
  ((SELECT user_id FROM profiles WHERE email = 'khan@mansoni.ru'), 'owner', true, '00000000-0000-0000-0000-000000000000', 'Owner initialization');
```

Owner should see **👑 Владелец** badge on their profile card.

## Admin Console Access

After Owner creation, Owner can access:
- **URL:** /admin (add to any page)
- Login required: Owner's phone (+79333222922)
- Verify selection: Owner

Admin features:
- View users
- Kill switch
- JIT escalation
- Audit logs
- Approval queue

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| "Missing authorization header" | Edge Function auth issue | Should work now with `supabase.functions.invoke()` |
| "Invalid JWT" | Auth token invalid | Ensure phone-auth returns valid accessToken |
| SMS code prompt (old flow) | Browser cached old code | Hard refresh: `Ctrl+Shift+R` |
| Blank page after register | Missing profile update | Check browser console for errors |

## Code Changes

- `src/pages/AuthPage.tsx` - Remove OTP mode, use `supabase.functions.invoke()`
- `src/components/auth/RegistrationModal.tsx` - Remove SMS flow, use `supabase.functions.invoke()`
- `supabase/functions/phone-auth/index.ts` - No SMS required (already updated)

## Next Steps

1. ✅ Test login/registration in browser
2. Create Owner account with full profile
3. Add verification badge for Owner
4. Test admin console access
5. Create test user via same phone-auth
6. Verify JIT escalation works
