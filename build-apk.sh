#!/usr/bin/env sh
set -eu
if ! command -v eas >/dev/null 2>&1; then
  npm install --global eas-cli
fi
eas login
npm install
npx expo install --fix
eas build --platform android --profile preview
