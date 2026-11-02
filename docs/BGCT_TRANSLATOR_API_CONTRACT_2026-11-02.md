# BGCT Browser Translator API — runtime staged, not integrated
Date: 2026-11-02. Source status: `E:\BlackGold_Course_Translator\01_EXTENSION` is not present in connected GitHub repositories. The actual 0.6.0 RC1 remains unchanged.

## Technical implementation produced
- `translator-api-adapter.js` is a classic IIFE, with injected `TranslatorCtor` for verifiable tests, no backend and no remote service.
- `inspect(source,target)` probes `Translator.availability` without downloading a language model.
- `startFromGesture()` invokes `Translator.create` synchronously, before the first async suspension; **it MUST be directly called in an actual click handler**, not from an automatic page load or `setTimeout`. All prepare work must be performed ahead of the click.
- `downloadprogress` maps `loaded` 0..1 to 0..100 and informs UI.
- `translate` returns structured success/error and rejects stale results after a lesson/language change; `reset` releases a previous translation session.
- Invalid language pairs, browser missing API, unavailable/downloadable/downloading model, create failures and translate failures all have defined statuses.
- Text translation only. NO integration with Udemy selectors, DOM, caption matching, user storage or actual extension UI is implied.
- Status `needs-activation` is localized in PT-BR/EN/ES with helper support.

## User-visible safeguards
Never claim the translation is ready before the local model is created. Never start a model download on passive page load. Do not promise mobile browser extension support. The browser supports models/translation pairs conditional on environment and version. A course must supply authorized captions/transcript.

## Evidence and references
- Chrome Translator API: https://developer.chrome.com/docs/ai/translator-api
- Microsoft Edge Translator API: https://learn.microsoft.com/en-us/microsoft-edge/web-platform/translator-api
- Historical source excerpt file: BGCT_TRANSLATOR_CURRENT.txt, `updateLiveCaptionStatus` strings.
- Historical RC1 audit: BGCT_GATE09A_STORE_AUDIT.txt, commit c29010f1aabfc15124b3d05889338cf772a576fd; SHA256 f7ce5acd03fdb059d919b896dfe760d64402ef47173ce5e0506b509393148f49.

## Remains blocked
Full original extension source, real Chrome/Edge tests, actual Udemy caption integration, preservation of old feature set, release and approval. No merge/deploy in this staging step.
