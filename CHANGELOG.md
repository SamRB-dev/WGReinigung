# Changelog

All notable changes to WG Clean are documented in this file.

The format is based on Keep a Changelog, and the project follows semantic versioning.

## [Unreleased]

### Added

- Minimalist WG Clean app-icon source in `assets/wg-clean-icon.svg`.
- Secure, one-time household invitation codes.
- Native Android and iOS share-sheet invitations.
- GitHub Releases as the app distribution and installation source.
- Dedicated account signup page.
- Variable household sizes from one to twelve members.
- Admin roommate creation, invitation regeneration, sharing, revocation, and removal controls.
- Password-change and permanent account-deletion controls.
- Seven configurable daily cleaning reminders for the assigned roommate.
- Complete one-command Docker, Supabase, and EAS APK build automation.

### Changed

- Login is disabled until email and password fields are valid.
- Household rotation now uses the actual member count rather than a fixed four-person rotation.
- Cleaning notifications are sent only to the assigned roommate.
- Invitation codes are single-use, email-bound, revocable, and expire after seven days.
- Docker builds remove old project resources, rebuild without cache, validate, deploy, and start a fresh APK build.

### Removed

- Domain-dependent Resend invitation emails.
- Plain-text temporary passwords for roommates.
- Fixed four-person household requirement.
- Separate, incomplete interactive APK build path.

## [1.1.0] - 2026-08-01

### Added

- Initial WG Clean mobile application.
- Supabase authentication and household data model.
- Weekly cleaning checklist and rotation.
- Bio-waste scheduling.
- Push notifications and test-notification controls.
- Admin announcements and reminder schedule configuration.
- English and German language support.
- Dark interface with amber and cyan accents.
