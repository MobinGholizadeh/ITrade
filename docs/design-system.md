# Red Broadcast implementation

User reference: `C:\Users\Mobin\Downloads\red-broadcast-DESIGN.md`. Applied 2026-11-03 to the existing research application.

## Shared visual language

White #FFFFFF background, #F2F2F2 surfaces, #0F0F0F primary text, #606060 metadata and #E5E5E5 dividers. #FF0000 marks the brand/live status; primary actions are black with white text. Links use #065FD4. Positive market values retain green and losses retain red. Small financial/status text uses darker green/orange/red variants for legibility on white.

Roboto 400/500/700 and Roboto Mono 400/500 are loaded through Next.js Google Fonts integration and served locally in the app bundle. Page titles use 24/32px, sections 20/28px, body 14/20px and metadata at least 12px. No external Google font request is required from the user's browser.

The header is 56px with working symbol search. Navigation is 240px expanded and 72px in rail mode; mobile uses a dismissible drawer with Escape support. Icon buttons are 40px circles, action/filter buttons are pills, form inputs are at least 40px, and content is fluid to 2200px. Native scrollbars are preserved.

News is a flat headline grid with horizontally scrolling category chips. Research charts use white canvas, subtle grid lines, high-contrast indicator colors and explicit green/red price direction. Settings and interactive risk panels retain light borders; informational cards use restrained neutral surfaces without shadows.

## Scope and accessibility

The source design targets video browsing. Its visual language is adapted to market/news/research content; there are no invented videos, thumbnails, microphone controls, social actions or fake activity.

Shared styles live in `src/app/globals.css`, risk layouts in `src/app/money-management/risk.css`, shell in `src/components/shell.tsx` and chart palette in `src/components/market-desk.tsx`. Focus outlines, skip navigation, labeled controls, pressed filter states, provider timestamps and data-quality labels remain visible. Tables scroll within their containers on small screens.

See [verification](verification.md) for desktop/mobile inspection results.
