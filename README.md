# WG Clean

A shared Expo mobile app for four roommates:

- one cleaner per week, rotating every Monday;
- shared room-by-room checklist;
- plastic and general waste in the weekly checklist;
- bio-waste every three days;
- backend email reminders sent to all four roommates;
- Supabase authentication, Postgres, RLS, Cron, and Edge Functions;
- Resend email delivery.

## 1. Requirements

- Node.js LTS
- Expo Go on your phone, or an Expo development build
- A Supabase project
- Supabase CLI
- A Resend account and verified sending domain

## 2. Configure the mobile app

```bash
cp .env.example .env
```

Add your Supabase project URL and **publishable key**. Never put the service-role key or Resend key in the app.

Install and run:

```bash
npm install
npx expo install --fix
npx expo start
```

Scan the QR code with Expo Go. Android and iPhone are both supported.

## 3. Create the database

Link the directory to your Supabase project and push the migration:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The first signed-in user creates the household and enters exactly four names/emails in rotation order. When the other roommates register with those email addresses, a database trigger links their accounts automatically.

## 4. Configure email delivery

Create a Resend API key and verify your sending domain. Set server-side secrets:

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx
npx supabase secrets set EMAIL_FROM="WG Clean <reminders@yourdomain.com>"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available automatically to deployed Edge Functions.

Deploy:

```bash
npx supabase functions deploy send-reminders --no-verify-jwt
```

Test manually:

```bash
npx supabase functions invoke send-reminders
```

## 5. Schedule the reminders

In Supabase Dashboard → Integrations → Cron, create an hourly Edge Function job for `send-reminders`.

Recommended cron expression:

```text
0 * * * *
```

The function itself checks each household's timezone and reminder hour. The database `email_log` provides idempotency, so each recipient receives each weekly or bio reminder only once.

Default behavior:

- Monday at 09:00 Europe/Berlin: weekly cleaning email to all four roommates.
- Every third bio-waste date at 09:00 Europe/Berlin: bio-waste email to all four roommates.
- The email names the responsible cleaner.

## 6. Build an installable Android APK

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

Change the package identifiers in `app.json` before publishing.

## Notes

- The included task guidelines are concise original summaries, not a copy of the linked landlord webpage.
- The MVP allows any household member to tick checklist items. Restricting completion to the assigned cleaner can be added in the RPC functions.
- Email reminders require a verified Resend domain to reach all four roommates.

## Docker automation

For an automated backend deployment and APK build workflow, see
[`DOCKER_AUTOMATION.md`](DOCKER_AUTOMATION.md).

Typical commands:

```bash
docker compose build
docker compose run --rm wgclean bootstrap   # once
docker compose run --rm wgclean deploy
docker compose run --rm wgclean build-apk
```

## Push-notification version

This build sends reminders through Expo Push Notifications only. Each signed-in roommate must install the APK, open the app once, and grant notification permission. The app stores the device's Expo push token in Supabase.

The `202608010002_push_notifications.sql` migration creates the token/log tables and an hourly Supabase Cron job. The Edge Function sends only at the household's configured local reminder hour, on Monday for weekly cleaning and every third day for bio-waste.

Before the first APK build, run `eas init` so `app.json` receives `extra.eas.projectId`. Android push delivery also requires FCM credentials configured for the Expo project.

## Version 1.1 changes

- Signup button always remains available and displays validation messages.
- Native confirmation redirect uses `wgclean://auth/callback`.
- Immediate local + remote push notification test from the Home screen.
- Household creator becomes admin.
- Admin can change household name and reminder hours, and send announcements to every registered phone.
- Weekly reminders: Monday, Wednesday, Friday, and Sunday at the configured hours (default 09:00 and 18:00) until completed.
- Bio-waste reminders: every due day at configured hours (default 09:00, 14:00, and 19:00) until completed.
- English/German language setting; English is default.
- New black, amber, and cyan interface.

### Required Supabase redirect setting

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `wgclean://auth/callback`
- Redirect URL: `wgclean://**`

Then deploy and rebuild:

```bash
docker compose run --rm wgclean validate
docker compose run --rm wgclean deploy
docker compose run --rm wgclean build-apk
```
