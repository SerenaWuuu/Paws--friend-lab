# Paws Friend Lab

A growing toolbox of genuinely useful pet tech. Open source, downloadable, and fun on purpose.

**Batch 01: Breed Scanner.** Point your phone camera at a cat or dog (or upload a photo) and get the breed in about a second. The AI runs 100% in your browser, so pet photos never leave the device.

## How it works

- [MobileNetV2](https://github.com/tensorflow/tfjs-models/tree/master/mobilenet) (ImageNet, via TensorFlow.js) runs fully client-side.
- Predictions are filtered through a curated map of 118 dog breeds, 5 cat breeds, and 8 wild cousins (politely flagged as "not a pet").
- The model lazy-loads only when the scanner scrolls into view, so first paint stays fast.
- Live camera mode throttles inference to ~1 prediction/sec and prefers the rear camera.

## Project structure

```
Paws--friend-lab/
├── index.html          # Landing page + scanner + roadmap
├── css/style.css       # Mobile-first styles
├── js/
│   ├── labels.js       # Curated breed map (from the MobileNet label set) + copy
│   ├── scanner.js      # Breed Scanner logic (camera + upload)
│   └── main.js         # Landing page interactions
├── LICENSE             # MIT
├── TESTING.md          # What was verified, what still needs device testing
└── .nojekyll           # Lets GitHub Pages serve files as-is
```

## Preview locally

Any static server works:

```bash
cd Paws--friend-lab
python3 -m http.server 8000
# open http://localhost:8000
```

Note: `getUserMedia` (live camera mode) requires a secure context. On `localhost` it works; for remote testing you need HTTPS.

## Deploy to GitHub Pages

1. Push this folder's contents to the `main` branch of  `SerenaWuuu/Paws--friend-lab`.
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch `main`, folder `/(root)`.
4. Save. The site goes live at `https://serenawuu.github.io/Paws--friend-lab/` within a minute or two.

No build step, no Actions workflow needed. The `.nojekyll` file keeps Pages from processing the site with Jekyll.

## Roadmap

Each future tool gets its own repo (all open source, MIT):

| Tool | Repo | What it does |
|------|------|--------------|
| Data Toybox |  `SerenaWuuu/data-toybox` | CSV visualizer, SQL formatter, plain-English to SQL helper |
| Star Gazer |  `SerenaWuuu/star-gazer` | Tonight's sky chart + night-sky photo mode |
| Cloud Toolkit |  `SerenaWuuu/cloud-toolkit` | BigQuery/Azure Synapse cost estimator, resource naming helper |
| Cat Care Log |  `SerenaWuuu/cat-care-log` | Feeding/weight/vet tracker, stored on-device |

## License

MIT. See [LICENSE](LICENSE).
