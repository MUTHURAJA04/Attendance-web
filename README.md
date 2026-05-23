# Attendance & Payroll Suite

Monorepo for the internal attendance + payroll platform.

## Apps
- `apps/web`: Next.js admin dashboard
- `apps/api`: NestJS API
 
Planned:
- `apps/mobile`: Android biometric companion app (face/fingerprint) for device integration

## Packages
- `packages/shared`: shared types and constants

## Supabase Edge Functions
The employee onboarding API is now implemented as a Supabase Edge Function:
- `supabase/functions/employees`
 - `supabase/functions/branches`
 - `supabase/functions/roles`

Deploy with the Supabase CLI and set secrets in your Supabase project:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Dev
- `pnpm install`
- `pnpm dev:web`
- `pnpm dev:api`
