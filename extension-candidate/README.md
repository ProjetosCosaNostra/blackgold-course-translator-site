# BlackGold Course Translator — MV3 candidate (NOT ORIGINAL)

Date 2026-11-02. Branch-only DEVELOPMENT candidate. DO NOT MERGE, DEPLOY OR PUBLISH.

This candidate is a separate copy of the source-independent staging translation modules. It is NOT the original extension version 0.6.0. The original source has not been recovered; therefore feature parity, design approval, and actual Udemy operation are unverified.

Architecture:
- Manifest V3, scoped Udemy learning pages, minimum storage/activeTab permissions.
- Popup for interface language PT-BR / EN / ES, target and source preferences, and an open-panel action. Popup never starts model download.
- A content script panel invokes Translator.create only from a direct in-page click. This keeps transient activation at the correct execution surface.
- Existing staging modules govern availability, model activation, caption cancellation, cache, SPA lecture changes and same-language passthrough.
- In-page caption sources are native video textTracks when active or narrowly scoped DOM caption containers. Subtitle text is rendered as textContent, never HTML.
- Fullscreen relocation, a compact black/gold candidate UI, no external service or analytics, no fake ecosystem redirect.

Important gates: No Chrome/Edge real-course validation, no proof of DOM selector stability, and no feature-parity comparison against the original. Do not upload to extension stores. Do not replace the original 0.6.0. Installation of this candidate has NOT been performed.

Before release: retrieve full original source; compare requirements, behavior and approved visual baseline; test with authorized Udemy courses on Chrome/Edge desktop, full-screen and SPA lecture transitions; verify privacy and internationalization; obtain explicit release approval.

## Retry recovery in candidate
When the local model produces an error for a nonempty cue, the in-page button becomes a localized Retry translation control. It submits the same cue again without creating/downloading a second model. The real Chrome for Testing synthetic fixture checks empty output, translated error status, recovery and model reuse; no actual Udemy page or native translation model is tested.
