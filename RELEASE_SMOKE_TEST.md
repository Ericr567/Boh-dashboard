# Release Smoke Test Checklist

Use this checklist before creating and pushing a release tag.

## Core quality
- [ ] Install dependencies succeeds.
- [ ] Lint passes (`npm run lint`).
- [ ] Production build passes (`npm run build`).
- [ ] App loads in browser without runtime errors.

## Kitchen profiles
- [ ] First launch shows kitchen selector when no kitchens exist.
- [ ] Creating a kitchen routes to dashboard.
- [ ] Switching kitchens changes visible data context.
- [ ] Prep, inventory, 86 list, notes, and recipes remain isolated between kitchens.
- [ ] Legacy import option appears when old storage keys exist.

## Product workflow
- [ ] Fire It moves Not Started to In Progress.
- [ ] Mark Ready moves In Progress to Ready.
- [ ] Service countdown shows and color changes by urgency.
- [ ] Recipe creation and delete work as expected.

## PWA and deploy
- [ ] Manifest is generated and install prompt appears (supported browsers).
- [ ] Service worker file is generated in dist output.
- [ ] Privacy and Terms links render correctly.
- [ ] Vercel SPA rewrites route to index document.
