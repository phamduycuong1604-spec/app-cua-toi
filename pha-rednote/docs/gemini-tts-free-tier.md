# Gemini TTS Free Tier

The translation client uses `web/phaha/gemini-tts.js` for TTS. Hearing and
translation keep their existing implementation. The downloader is unchanged.

- One shared request queue, including calls from voice previews. A packet keeps
  the API key it sent; usage is charged to that key and model.
- Retry-After (seconds or HTTP date), Google RetryInfo and textual retry durations
  are honored. Waits up to 15 seconds retry the same pair once. Longer delays
  suspend that pair and try another key. Total quota waiting per packet is at
  most 15 seconds. Network attempts have a 60-second timeout and the packet's
  transport attempt budget is 90 seconds.
- Daily state is in `phaha-tts-quota-v1`, indexed by key fingerprint or known
  Google project identity plus model. Daily exhaustion lasts until the next
  America/Los_Angeles calendar day. Initial remaining counts assume 10 requests
  per model per day and are estimates; this device cannot observe usage elsewhere.
  A reported daily quota value replaces that assumption.
- Prefer the model with the most remaining quota, then configured/default order.
  Once the first packet succeeds, lock its model AND voice. All later packets
  rotate only API keys for that exact model and voice. Requests cannot change
  the locked voice even if settings are edited while a run is active.
- Default model order: gemini-3.8-flash-tts, gemini-3.1-flash-tts-preview,
  gemini-2.5-flash-preview-tts. An explicit Advanced setting can precede these.
  Unavailable models are skipped on HTTP 404; availability is not assumed.
- Keys in the same project do not add quota. Project identities are joined only
  when Google reports them; absent such identity the app cannot reliably know
  that two keys belong to one project. Rotation visits each candidate at most
  once per packet, apart from one permitted short retry.
- Speech gaps below 1.2 seconds are grouped into packets of about 40 seconds.
  Unusually long individual rows are split without discarding text. The original
  subtitle rows are not modified.
- Successful trimmed audio is cached with its model/provider and voice/text
  identity in IndexedDB. Model-specific variants retain older successful audio
  without allowing it to replace the current lock. Private-mode storage failure falls back to memory for
  the current page session. Failed or empty audio is not cached. Voice/text edits
  invalidate the corresponding cache entry on a new run. Audio from another
  model or provider is retained in storage but excluded from a locked Gemini run.
- If the locked model is exhausted on every key/project, pause immediately
  with TTS_LOCKED_DAY_EXHAUSTED. Temporary unavailability pauses with
  TTS_LOCKED_UNAVAILABLE. Neither condition switches model or provider.
  Successful packets survive rerun and page reload where IndexedDB is available;
  their metadata restores the same lock, and only missing packets are sent.
  A pause also cancels parallel rendering and prevents export of partial speech.
- Before any Gemini audio has succeeded (and when no Gemini cache restores a
  lock), the existing initial model selection and configured provider fallback
  remain available. A new run clears the in-memory lock; matching cached Gemini
  packets restore it. Explicitly choosing a different voice on a new run uses a
  separate cache identity.
- Silence trimming, timestamp placement, normal 1.6x speed cap and delayed 1.9x
  cap remain unchanged.

Tests cover queue serialization, 429 thresholds, quota persistence/day reset,
known shared projects, key rotation under a model/voice lock, cancellation,
initial fallback before a lock, quota pause without provider fallback,
rerun/reload caching, denied storage, grouping and timing caps. Provider responses
and IndexedDB are controlled test doubles; real Google quota and iPhone behavior
still depend on the account and device.

## Spoken text and music-only intervals

`loi-noi.js` removes recognized music/sound captions before number and symbol
normalization. Previously `[nhạc mở đầu]` lost only its brackets and became
spoken narration. Known standalone music labels and bracketed sound labels are
now excluded, while normal dialogue about music and technical parentheticals
remain intact. The raw subtitle table is not rewritten.

Only narrated text is passed to TTS. No prose instructions are prepended to its
text field. Gemini listening instructions explicitly exclude music-only rows;
Whisper labels such as `[音乐]` are filtered before translation as well.

The original timestamps are retained. An intro with no speech creates no TTS
request and remains silence in the synthesized voice track, leaving the original
music to the existing mixer. Speech packets do not merge across an explicit
music-only row. Ordinary nearby dialogue still groups up to 40 seconds to save
quota, as requested. This change does not add per-word forced alignment inside
those groups, and cannot detect every possible hallucination in generated audio.

Changed spoken text gets a different audio-cache identity, so an old packet that
actually included a removed music label is not reused. Valid cached narration,
model/voice locks, pause-on-exhaustion, and speed caps are retained.
