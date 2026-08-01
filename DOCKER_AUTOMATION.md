# WG Clean Docker automation

This setup automates dependency installation, validation, Supabase deployment,
Edge Function deployment and EAS APK builds.

## 1. Prerequisites

Install Docker Desktop and start it.

## 2. Configuration

The mobile app reads public Supabase values from `.env`.
Automation secrets are stored in `.env.docker`, which must never be committed.

```powershell
Copy-Item .env.docker.example .env.docker
```

Fill in all values in `.env.docker`.

Create tokens:

- Supabase dashboard: Account > Access Tokens
- Expo dashboard: Account Settings > Access Tokens
- Resend dashboard: API Keys

`EMAIL_FROM` must use a sender/domain verified in Resend.

## 3. Build the Docker image

```powershell
docker compose build
```

## 4. One-time setup

This opens interactive Supabase and Expo login/setup prompts:

```powershell
docker compose run --rm wgclean bootstrap
```

You normally run this only once. Afterwards, token-based commands are non-interactive.

## 5. Validate the app

```powershell
docker compose run --rm wgclean validate
```

## 6. Deploy backend

```powershell
docker compose run --rm wgclean deploy
```

This command:

1. links the configured Supabase project;
2. pushes database migrations;
3. uploads Resend secrets;
4. deploys the `send-reminders` Edge Function.

## 7. Generate the APK

```powershell
docker compose run --rm wgclean build-apk
```

The container uploads the source to Expo EAS. EAS compiles and signs the APK in
the cloud. The finished command prints the build URL.

## 8. Re-run later

After source or database changes:

```powershell
docker compose run --rm wgclean validate
docker compose run --rm wgclean deploy
docker compose run --rm wgclean build-apk
```

Or, with GNU Make:

```bash
make validate
make deploy
make apk
```

## Security

Never commit `.env` or `.env.docker`. Never put the Supabase database password,
service-role key, Resend key or Expo token in `app.json` or source code.
