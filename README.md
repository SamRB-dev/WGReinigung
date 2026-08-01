# WG Clean

A shared mobile app for managing cleaning duties in a household.

## Features

- Weekly cleaner rotation
- Shared cleaning checklist for kitchen, bathroom, and common areas
- Plastic and general waste included in the weekly checklist
- Bio-waste scheduling every three days
- Push notifications for cleaning, bio-waste, and admin announcements
- Multiple reminders during the week and on bio-waste days
- Admin controls for household settings, reminders, invitations, and announcements
- English and German language support
- Supabase authentication, database, migrations, and Edge Functions
- Dark interface with amber and cyan accents

## Fully automated APK build

Create `.env` and `.env.docker` from their example files and fill in the required Supabase and Expo credentials. Then run one command from the repository root:

```powershell
python scripts/build_apk.py
```

The script automatically:

1. Checks Docker and Docker Compose.
2. Normalizes shell-script line endings.
3. Removes old project containers, networks, volumes, and locally built Compose images.
4. Prunes dangling Docker images.
5. Pulls the newest base image and rebuilds the WG Clean image without cache.
6. Installs exact dependencies from `package-lock.json`.
7. Runs configuration and TypeScript validation.
8. Deploys Supabase migrations and all Edge Functions.
9. Starts a new EAS Android preview APK build and waits for completion.
10. Prints the latest Android build status.

Optional flags:

```powershell
python scripts/build_apk.py --keep-volumes
python scripts/build_apk.py --skip-deploy
python scripts/build_apk.py --skip-apk
```

On Linux or macOS, `./build-apk.sh` runs the same Python automation.

## Individual Docker commands

```bash
docker compose run --rm wgclean install
docker compose run --rm wgclean validate
docker compose run --rm wgclean deploy
docker compose run --rm wgclean build-apk
docker compose run --rm wgclean status
```
