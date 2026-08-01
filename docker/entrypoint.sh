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

case "${1:-help}" in
  help)
    cat <<'TXT'
WG Clean Docker commands

  docker compose run --rm wgclean validate
  docker compose run --rm wgclean bootstrap
  docker compose run --rm wgclean deploy
  docker compose run --rm wgclean build-apk
  docker compose run --rm wgclean status

bootstrap  One-time interactive Expo/Supabase setup.
deploy     Push DB migrations, push scheduler and Edge Function.
build-apk  Trigger a non-interactive EAS cloud APK build.
TXT
    ;;

  validate)
    check_app_env
    npm run typecheck
    echo "Configuration and TypeScript checks passed."
    ;;

  bootstrap)
    check_app_env
    required SUPABASE_PROJECT_REF
    echo "Logging in to Supabase (interactive)..."
    npx supabase login
    npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
    echo "Logging in to Expo (interactive)..."
    npx eas login
    npx eas init
    npx eas build:configure
    echo "Bootstrap complete. Export access tokens before running automated commands."
    ;;

  deploy)
    check_app_env
    required SUPABASE_ACCESS_TOKEN
    required SUPABASE_PROJECT_REF
    required SUPABASE_DB_PASSWORD
    export SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
    npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
    npx supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
    npx supabase functions deploy send-reminders --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
    npx supabase functions deploy send-test-push --project-ref "$SUPABASE_PROJECT_REF"
    echo "Supabase database and reminder function deployed."
    ;;

  build-apk)
    check_app_env
    required EXPO_TOKEN
    if ! grep -q '"projectId"' app.json; then
      npx eas init --force --non-interactive
    fi
    npx eas build \
      --platform android \
      --profile preview \
      --non-interactive \
      --wait
    ;;

  status)
    required EXPO_TOKEN
    npx eas build:list --platform android --limit 5 --non-interactive
    ;;

  shell)
    exec bash
    ;;

  *)
    exec "$@"
    ;;
esac
