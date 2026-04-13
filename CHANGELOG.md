# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-13

### Added
- Kitchen profiles with isolated local data per kitchen using namespaced storage keys.
- Kitchen selector and switcher UI for creating, selecting, and managing kitchen workspaces.
- Legacy data migration path to import pre-profile local data into a new kitchen.
- Recipe Book feature with create/delete, search, category and station filtering, and persistent storage.
- Service countdown timer with urgency color states.
- Prep station progress bars and workflow actions for Fire It and Mark Ready.
- PWA support with offline-capable service worker and installable manifest.
- Vercel SPA rewrite configuration and footer links for Privacy and Terms pages.

### Fixed
- Vercel install compatibility for dependency resolution with Vite 8 via npm legacy peer deps setting.
- Lint issues in kitchen profile persistence and keyboard submit behavior.

### Verified
- Lint passes with no errors.
- Production build succeeds and generates service worker assets.
