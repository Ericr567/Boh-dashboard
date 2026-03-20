# LineFlow BOH Dashboard

LineFlow is a Back-of-House operations dashboard for service readiness. It provides quick visibility into prep progress, station workload, low-stock alerts, and shift handoff notes.

## Stack

- React 19
- TypeScript
- Vite 8
- ESLint 9

## Requirements

- Node.js 20+
- npm 10+

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Default local URL:

```text
http://localhost:5173/
```

## Build and Preview

Create a production build:

```bash
npm run build
```

Preview the built app:

```bash
npm run preview
```

Default preview URL:

```text
http://localhost:4173/
```

Note: The Vite base path is configured to use relative asset URLs so the app can be hosted from a subfolder and the generated `dist/index.html` can be opened in environments that do not serve from root.

## Scripts

- `npm run dev`: start local dev server
- `npm run build`: type-check and build production assets
- `npm run preview`: serve production build locally
- `npm run lint`: run ESLint checks

## Data and Backups

- LineFlow stores data in browser local storage by default.
- Use the in-app `Export Backup` button to create a JSON backup file.
- Use `Import Backup` to restore data from a previously exported backup file.

## CI Quality Gates

GitHub Actions runs lint and build checks on push and pull requests to `main` via [ci.yml](.github/workflows/ci.yml).

## Public-Facing Docs

- Privacy Policy: [PRIVACY.md](PRIVACY.md)
- Terms of Use: [TERMS.md](TERMS.md)
