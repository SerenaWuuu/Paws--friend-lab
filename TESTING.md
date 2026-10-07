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

## Still needs on-device testing (requires the real Pages deploy)

- [ ] **Live camera on iPhone Safari**: `getUserMedia` needs HTTPS, so this
      only works after deploying to GitHub Pages. Verify: rear camera opens,
      predictions update ~1/sec, flip-camera and stop buttons work,
      permission-denied state shows the friendly fallback.
- [ ] **Upload mode on iPhone**: photo picker, drag-drop (desktop), and the
      12 MB / non-image guards.
- [ ] **Accuracy spot-check**: run 5-10 real cat/dog photos through and
      confirm top-1 breed is sensible; tune `MIN_CONFIDENCE` (currently 0.12)
      if the "not sure" state triggers too often or too rarely.
- [ ] **Orange tabby easter egg**: point at an orange tabby and confirm the
      special quip fires (hue sampling is heuristic; may need tuning).
- [ ] **Cold load on cellular**: model download is ~15 MB; confirm the
      loading state reads well on a slow connection.

## Known limitations (honest)

- Cat breed coverage is 5 breeds (Tabby, Mackerel Tabby, Persian, Siamese,
  Egyptian Mau), because that is what ImageNet/MobileNet knows. Most
  domestic shorthairs will read as "Tabby", which is fair. Dog coverage is
  excellent at 118 breeds.
- The scanner identifies the single most prominent animal; it does not do
  multi-pet scenes or face detection.
