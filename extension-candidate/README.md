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

## Event-driven captions and stable lecture identity (2026-11-02)
The candidate listens to active video seek/seeked/play/ended/emptied events, active TextTrack cuechange and MutationObserver updates on the caption container, while retaining periodic polling as a fallback. The subtitle overlay is hidden immediately during seeking and after playback ends, avoiding re-display of obsolete DOM text. Video listeners and DOM observers are removed on navigation out of a supported course and on pagehide. Lecture identity is URL-based, falling back to the title only when there is no lecture ID in the path or query, so title/UTM changes do not reset a running translation.
New Chrome for Testing synthetic-browser checks cover these cases; real Udemy behavior and installed 0.6.0 parity remain unvalidated.

## Manual recovery after model setup failure
If native Translator.create() throws, rejects, or yields a session without translate(), the adapter preserves the previously inspected pair and re-enables an explicitly user-activated retry button. The browser never retries or downloads automatically, and the code remains guarded against stale results after closing or changing languages. The CI Chrome for Testing fixture simulates a failed first gesture and a successful second gesture. No real language model download or real Udemy lecture was used.

## Close/reopen memory safety
The X and Close panel actions now stop watching captions, clear translated text and caches, release the model and pause background polling. Only an explicit popup open restores the panel; the learner must activate the model again. The Chrome for Testing synthetic flow verifies model disposal, no hidden translation work, and explicit reopening without automatic downloads. No real Udemy account or original 0.6.0 source was tested.

## Delayed caption DOM on lecture switch (2026-11-02)
On single-page course navigation, the old caption DOM can survive briefly while the lecture ID changes. The candidate records the last cue from the preceding lesson and quarantines an identical cue under the new lecture ID until the source changes. The old overlay is cleared, and the new cue is not translated from the former lesson. This is covered in Chrome for Testing by changing the synthetic lecture URL first and the subtitle DOM later. The original installed extension and real Udemy lesson behavior remain unverified.

## Identical caption text across two lessons (2026-11-02)
After SPA lecture navigation, the candidate still quarantines a carried-over caption until the source changes. However, a new `TextTrack.cuechange` event or an observed DOM caption mutation releases the quarantine even when the new lecture repeats exactly the same words. This avoids permanently hiding a legitimate repeated sentence. Leaving a supported route hides the panel; returning to a lesson restores it unless the learner explicitly closed it. Synthetic Chrome tests cover both scenarios. No live Udemy selectors or native-language-model translations have been validated.

## Language-aware caption track selection (2026-11-02)
On pages with several active `HTMLVideoElement.textTracks`, the candidate now prioritizes the track matching the learner's selected source language (including region-tagged codes, such as en-US → en). A visible track explicitly labeled in another language prevents treating arbitrary DOM caption text as the source when no matching active cue exists. Unknown-language tracks remain eligible as a fallback. The Chrome-for-Testing synthetic fixture exercises ordered tracks and the return to DOM captions. Real Udemy subtitle track arrangements remain unverified.

## Visible course video selection (2026-11-02)
When there are multiple `<video>` elements, the candidate selects a visible video by viewport area rather than indiscriminately choosing the first unpaused player. It rejects hidden/off-screen/zero-area video elements, respects fullscreen ancestry, and slightly favors an already selected main video when scores are comparable. This prevents a small autoplaying preview from replacing the lecture caption source. In a synthetic browser test, the primary player is selected while a smaller preview plays, switching only when the primary is hidden, and returning when it becomes visible. This is not evidence that real Udemy video/iframe layouts have been tested. The original extension remains untouched.
