# Build an installable Android APK

This app is configured to create an APK with the `preview` EAS profile.

## 1. Install Node.js

Install the current Node.js LTS release on your computer.

## 2. Configure Supabase

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and add your public Supabase project values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

Never place the Resend secret key in this file. Resend remains inside the Supabase Edge Function.

## 3. Install dependencies

```bash
npm install
npx expo install --fix
```

## 4. Install and sign in to EAS

```bash
npm install --global eas-cli
eas login
```

Create a free Expo account when prompted if needed.

## 5. Link and configure the project

```bash
eas build:configure
```

Accept Android credentials managed by Expo when prompted. EAS will create and securely manage the Android signing keystore.

## 6. Build the APK

```bash
npm run build:apk
```

Equivalent command:

```bash
eas build --platform android --profile preview
```

The build happens on Expo's servers. When it finishes, EAS prints a download page. Open that page on the Android phone, download the `.apk`, allow installation from that browser or file manager, and install it.

## Updating the app

After changing the code, run the APK build command again. Install the new APK over the old version. The Android package name must remain unchanged for it to update the existing installation.

## Google Play later

For Google Play, generate an AAB instead:

```bash
npm run build:playstore
```

The APK profile is for direct installation and testing. The production profile creates the store-oriented Android App Bundle.
