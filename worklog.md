---
Task ID: 2
Agent: Super Z (main)
Task: Refactor to local storage + PWA for offline support

Work Log:
- Rewrote page.tsx to use localStorage instead of API/Prisma
- All data (measurements, settings, notification prefs) stored in localStorage
- Lazy state initializers to avoid setState-in-effect lint errors
- CSV export fully client-side using Blob + download link
- Created manifest.json for PWA installability
- Created sw.js service worker with network-first for navigation, cache-first for static assets
- Generated PWA icons (192x192, 512x512) using sharp + SVG
- Updated layout.tsx with manifest link, viewport meta, service worker registration, apple-touch-icon
- Verified: data persists in localStorage, all tabs work, no console errors

Stage Summary:
- App now works entirely offline after first load
- All data stays on device — zero server dependency
- PWA-ready: installable on home screen, works without browser chrome
- Footer text updated: "Все данные хранятся только на этом устройстве. Интернет не нужен."
