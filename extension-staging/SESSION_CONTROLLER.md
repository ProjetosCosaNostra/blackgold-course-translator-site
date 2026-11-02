# Session controller, staging only

This is an independent bridge between the browser Translator API adapter and the caption coordinator. It does not contain Udemy DOM selectors and must NOT be described as an integrated or installed fix.

Integration order after verified retrieval of the original extension source: translator-api-adapter.js, caption-coordinator.js, session-controller.js, then the original vetted content script.

Call setLesson with courseId, lectureId, sourceLanguage and targetLanguage. The method only checks availability; it does not create or download language models. Call activateFromGesture directly inside a trusted user click handler (without awaiting anything first). Then send individual subtitle cues to showCue. The close method clears the caption cache and releases the model.

The model is retained across lecture changes for the same language pair. Changing language pair requires another availability check and a new user activation. No installed extension, real course, browser or mobile functionality has been verified here.

Validation: node tools/check-session-controller.mjs, run by GitHub Actions on staging.

Navigating between lectures while the same language model is still being created returns model-loading and preserves the in-flight creation. This avoids a repeated user download/activation request. Tests simulate the delayed model and verify it is not aborted until the session closes.
