# Testing notes: Batch 01 (Breed Scanner)

## Verified on 2026-10-06 (build machine)

- **JS syntax**: `node --check` passes on `js/labels.js`, `js/scanner.js`, `js/main.js`.
- **CDN libraries reachable (HTTP 200)**:
  - `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js`
  - `https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js`
  - `https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap`
- **Model weights reachable**: the TF.js MobileNetV2 graph model behind
  `@tensorflow-models/mobilenet` resolves via TF Hub
  (`https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2`)
  to a signed `storage.googleapis.com` `model.json`; followed the redirect
  chain with curl and got **HTTP 200, 86,414 bytes**. The model is real and
  loadable, not a placeholder.
- **Label map grounded**: the 131-entry breed map in `js/labels.js` was
  generated from the exact 1,000-class label object embedded in
  `@tensorflow-models/mobilenet@2.1.1` (extracted programmatically, not
  hand-typed): 118 dog breeds (ImageNet indices 151-268), 5 domestic cat
  breeds (281-285), 8 wild cats (286-293). Breed display names were
  normalized with a title-case rule plus a hand-reviewed override list
  (e.g. "Blenheim spaniel" -> "Cavalier King Charles Spaniel").
- **Copy check**: no em-dashes anywhere in the site (`grep` for U+2014
  returns nothing); UI copy is English, warm, and human.
- **Version compatibility**: `@tensorflow-models/mobilenet@2.1.1` declares
  peer deps `@tensorflow/tfjs-core ^4.9.0` / `@tensorflow/tfjs-converter
  ^4.9.0`, matching the pinned `@tensorflow/tfjs@4.17.0`.

## CLIP upgrade verified on 2026-10-06 (build machine)

- **Viability confirmed before building**: transformers.js v3 bundle
  `@huggingface/transformers@3.0.0/dist/transformers.min.js` on jsDelivr
  returns **HTTP 200**; the model page for `Xenova/clip-vit-base-patch32`
  carries `pipeline_tag: zero-shot-image-classification`, is not gated, and
  the transformers.js docs list the `zero-shot-image-classification` pipeline.
- **ONNX weights reachable (followed redirects to HF CDN, all HTTP 200)**:
  - `config.json` (4,524 bytes)
  - `onnx/vision_model_quantized.onnx` (~89 MB)
  - `onnx/text_model_quantized.onnx` (~64.5 MB)
  - fp16 variants also exist but are ~300 MB total, so the default
    quantized build is used (one-time ~153 MB download, then cached in
    IndexedDB by transformers.js).
- **JS syntax**: `node --check` passes on all six files
  (`labels.js`, `fx.js`, `scanner.js`, `main.js`, `weight-store.js`, `weight.js`).
- **Breed data**: 71 CLIP candidates (65 TICA-recognized breeds + 6
  coat-pattern generics: Domestic Shorthair, Domestic Longhair, Tabby,
  Tuxedo, Calico, Tortoiseshell). Every one of the 118 dog breeds and all
  71 cat candidates has its own unique quip (190 breed quips total, verified
  programmatically; the 8 wild-cat labels intentionally reuse the generic
  wild quips since they are not pets). No em-dashes anywhere (`grep` clean).
- **Routing logic unit-tested in Node** (stubbed labels): confident dog ->
  dog path; low-confidence dog -> honest "unsure"; any cat label -> CLIP;
  tiger at 0.3 -> CLIP (likely an orange tabby misread); tiger at 0.9 ->
  wild path; no detections -> no-pet state.
- **Weight store unit-tested in Node** (localStorage shim): addCat with
  coat, 6 entry types, streak/feedings/weight-points math, med
  add/update/remove, due/overdue/taken state machine, export/import
  round-trip preserving meds, one-time migration from the legacy
  `cat-care-log/v1` key. All pass.
- **HTML integrity**: all 63 static IDs referenced by `weight.js` exist in
  `index.html` (the rest are created dynamically inside sheets, same pattern
  as the reference app); div/section/main/button tags balanced.
- **GitHub links**: all footers/roadmap cards point at the canonical
  `SerenaWuuu` account (fixed from `SerenaWuu`).
- **Celebration engine**: 7 effect styles (confetti, paw rain, sparkles,
  hearts, stars, bubbles, snow); 186 breeds mapped to groups in
  `window.PFL_FX_GROUPS`, the rest fall back by species; fires once per
  breed per session-view (guarded by `lastFxBreed`, reset on mode/camera
  changes); disabled under `prefers-reduced-motion`.

## Still needs on-device testing (requires the real Pages deploy)

- [ ] **Live camera on iPhone Safari**: `getUserMedia` needs HTTPS, so this
      only works after deploying to GitHub Pages. Verify: rear camera opens,
      predictions update ~1/sec, flip-camera and stop buttons work,
      permission-denied state shows the friendly fallback.
- [ ] **CLIP first download on iPhone**: ~153 MB on first cat detection.
      Verify the progress bar reads well, the (GPU)/(CPU) badge is honest,
      and the model caches (second visit should skip the download).
- [ ] **WebGPU path**: confirm on a WebGPU-capable iPhone that the warmup
      passes and inference runs; on older devices confirm silent fallback
      to wasm with no user-facing error.
- [ ] **Upload mode on iPhone**: photo picker and the 12 MB / non-image
      guards; CLIP fallback renders the quick MobileNet guess if the
      expert fails to load.
- [ ] **Accuracy spot-check**: run 10+ real cat photos through CLIP and
      confirm top-1 breed is sensible; tune the candidate list if everyday
      shorthairs skew oddly.
- [ ] **Orange tabby easter egg**: point at an orange tabby and confirm the
      special quip fires (hue sampling is heuristic; may need tuning).
- [ ] **Celebration effects**: confirm each of the 7 styles renders and
      does not block taps (`pointer-events: none`); check
      `prefers-reduced-motion` disables them.
- [ ] **Weight Tracker on iPhone**: quick-log 3-tap flow, canvas charts at
      360px widths, sheet safe-area, photo upload quota path, .ics file
      import into Apple Calendar, med due/overdue states across midnight.
- [ ] **Cold load on cellular**: MobileNet is ~15 MB, CLIP ~153 MB;
      confirm loading states read well on a slow connection.

## Known limitations (honest)

- Cat breed identification is zero-shot AI guessing, for fun: the 71
  candidates cover popular breeds plus everyday coat patterns, but rare
  breeds and lookalikes will sometimes miss. Framed as "AI guess" in UI.
- Dog path is unchanged: MobileNet's 118 ImageNet breeds, fast and local.
- The scanner identifies the single most prominent animal; it does not do
  multi-pet scenes or face detection.
- Medication reminders nudge only while the page is open; a static site
  cannot send background push notifications. The .ics export gives real
  phone alerts via the calendar. This is stated in the UI.
