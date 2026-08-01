@echo off
where eas >nul 2>nul
if errorlevel 1 (
  echo EAS CLI is not installed. Installing it now...
  call npm install --global eas-cli
  if errorlevel 1 exit /b 1
)
call eas login
if errorlevel 1 exit /b 1
call npm install
if errorlevel 1 exit /b 1
call npx expo install --fix
if errorlevel 1 exit /b 1
call eas build --platform android --profile preview
