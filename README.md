# WG Clean

A shared mobile app for managing cleaning duties in a four-person household.

## Features

- Weekly cleaner rotation
- Shared cleaning checklist for kitchen, bathroom, and common areas
- Plastic and general waste included in the weekly checklist
- Bio-waste scheduling every three days
- Push notifications for cleaning, bio-waste, and admin announcements
- Multiple reminders during the week and on bio-waste days
- Admin controls for household settings, reminders, and announcements
- English and German language support
- Supabase authentication, database, migrations, and Edge Functions
- Dark interface with amber and cyan accents

## Docker automation

Create your local environment files from the included examples, then run:

```bash
docker compose build
docker compose run --rm wgclean npm install --include=dev
docker compose run --rm wgclean validate
docker compose run --rm wgclean deploy
docker compose run --rm wgclean build-apk
```

Useful commands:

```bash
docker compose run --rm wgclean eas whoami
docker compose run --rm wgclean eas env:list --environment preview
docker compose run --rm wgclean eas build:list --platform android --limit 1
```
