# Direct Firebase Cloud Messaging setup

WG Clean sends Android remote notifications directly through the Firebase Cloud Messaging HTTP v1 API. Expo's push relay is not used.

## 1. Create the Firebase project

1. Open Firebase Console and create or select a project.
2. Add an Android app with package name `com.example.wgclean`.
3. Download the generated `google-services.json`.
4. In Google Cloud Console, ensure the **Firebase Cloud Messaging API (V1)** is enabled.

The package name in Firebase must exactly match `expo.android.package` in `app.json`.

## 2. Create the server credential

1. In Firebase Console, open **Project settings → Service accounts**.
2. Generate a new private key.
3. Keep the downloaded JSON private. Never commit it to GitHub.

## 3. Configure the Docker environment

Create or update `.env.docker`.

On PowerShell, encode `google-services.json` as one line:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("google-services.json")
[Convert]::ToBase64String($bytes)
```

Set the result as:

```env
GOOGLE_SERVICES_JSON_BASE64=PASTE_BASE64_HERE
```

Convert the service-account JSON to one compact line:

```powershell
(Get-Content "firebase-service-account.json" -Raw | ConvertFrom-Json | ConvertTo-Json -Compress)
```

Set the result as:

```env
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Both values are secrets. `.env.docker`, `google-services.json`, and `firebase-service-account.json` are ignored by Git.

## 4. Deploy and build

Run:

```powershell
python scripts/build_apk.py
```

The automation will:

- decode `GOOGLE_SERVICES_JSON_BASE64` into a temporary `google-services.json`;
- validate the Firebase Android configuration;
- push the FCM token database migration;
- upload `FCM_SERVICE_ACCOUNT_JSON` to Supabase Edge Function secrets;
- deploy the reminder and test-push functions;
- build a fresh Android APK.

## 5. Re-register devices

Existing Expo push tokens are disabled by the migration. Every user must install the new APK and open the Home screen once. The app then registers a native FCM token and keeps token rotations synchronized automatically.

The Admin **Test push for everyone** action sends an FCM notification to every active registered Android device in that household.
