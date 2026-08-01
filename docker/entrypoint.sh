#!/usr/bin/env bash
set -Eeuo pipefail

required() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

check_app_env() {
  required EXPO_PUBLIC_SUPABASE_URL
  required EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
}

generate_icons() {
  node scripts/generate-icons.mjs
}

prepare_firebase_android() {
  required GOOGLE_SERVICES_JSON_BASE64
  printf '%s' "$GOOGLE_SERVICES_JSON_BASE64" | base64 --decode > google-services.json
  node -e "const fs=require('fs'); const value=JSON.parse(fs.readFileSync('google-services.json','utf8')); if(!value.project_info?.project_id || !Array.isArray(value.client)) throw new Error('Invalid google-services.json'); console.log('Firebase Android configuration prepared for', value.project_info.project_id);"
}

case "${1:-help}" in
  help)
    cat <<'TXT'
WG Clean Docker commands

  docker compose run --rm wgclean install
  docker compose run --rm wgclean validate
  docker compose run --rm wgclean bootstrap
  docker compose run --rm wgclean deploy
  docker compose run --rm wgclean build-apk
  docker compose run --rm wgclean status

install    Install exact dependencies from package-lock.json.
bootstrap  One-time interactive Expo/Supabase setup.
deploy     Push DB migrations, upload the FCM server secret, and deploy all Edge Functions.
build-apk  Generate icons/Firebase config and trigger a non-interactive EAS cloud APK build.
TXT
    ;;

  install)
    if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
    npx expo install --check
    ;;

  validate)
    check_app_env
    generate_icons
    prepare_firebase_android
    npm run typecheck
    echo "Configuration, Firebase Android setup, icons, and TypeScript checks passed."
    ;;

  bootstrap)
    check_app_env
    required SUPABASE_PROJECT_REF
    npx supabase login
    npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
    npx eas login
    npx eas init
    npx eas build:configure
    ;;

  deploy)
    check_app_env
    required SUPABASE_ACCESS_TOKEN
    required SUPABASE_PROJECT_REF
    required SUPABASE_DB_PASSWORD
    required FCM_SERVICE_ACCOUNT_JSON
    export SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
    npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
    npx supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
    npx supabase secrets set "FCM_SERVICE_ACCOUNT_JSON=$FCM_SERVICE_ACCOUNT_JSON" --project-ref "$SUPABASE_PROJECT_REF"
    npx supabase functions deploy send-reminders --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
    npx supabase functions deploy send-test-push --project-ref "$SUPABASE_PROJECT_REF"
    npx supabase functions deploy manage-roommates --project-ref "$SUPABASE_PROJECT_REF"
    echo "Supabase database, FCM secret, and all Edge Functions deployed."
    ;;

  build-apk)
    check_app_env
    required EXPO_TOKEN
    generate_icons
    prepare_firebase_android
    if ! grep -q '"projectId"' app.json; then npx eas init --force --non-interactive; fi
    npx eas build --platform android --profile preview --non-interactive --wait
    ;;

  status)
    required EXPO_TOKEN
    npx eas build:list --platform android --limit 5 --non-interactive
    ;;

  shell) exec bash ;;
  *) exec "$@" ;;
esac
