/* Paws Friend Lab: Breed Scanner.
 * Two on-device brains: MobileNet (ImageNet) via TensorFlow.js does the fast
 * first pass and owns all 118 dog breeds. When it spots a cat, the CLIP
 * zero-shot breed expert (transformers.js, Xenova/clip-vit-base-patch32)
 * names the breed from 60+ candidates. No photo ever leaves the browser.
 */
(function () {
  "use strict";

  var TFJS_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js";
  var MOBILENET_URL = "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js";
  var TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js";
  var CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
  var TOP_K = 8;
  var MIN_CONFIDENCE = 0.12;
  var DOG_CONFIDENT = 0.2;
  var WILD_CONFIDENT = 0.5;
  var LOOP_MS = 1000;
  var CLIP_MS = 2000;

  var BREEDS = window.PFL_BREEDS || {};
  var QUIPS = window.PFL_QUIPS || { dog: [], cat: [], wild: [], unsure: [], noPet: [], breed: {} };
  var CAT_CANDIDATES = (window.PFL_CAT_BREEDS || []).map(function (b) {
    return { breed: b, prompt: "a photo of a " + b + " cat" };
  });

  var model = null;
  var modelPromise = null;
  var clipClassifier = null;
  var clipPromise = null;
  var stream = null;
  var loopTimer = null;
  var facingMode = "environment";
  var currentMode = "camera";
  var lastQuipSeed = 0;

  function $(id) { return document.getElementById(id); }

  function pick(arr) {
    if (!arr || !arr.length) return "";
    lastQuipSeed = (lastQuipSeed + 1) % arr.length;
    return arr[lastQuipSeed];
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureModel(statusEl) {
    if (model) return Promise.resolve(model);
    if (modelPromise) return modelPromise;
    setStatus(statusEl, "loading", "Waking up the lab cats", "Fetching the brain. This takes a few seconds the first time.");
    modelPromise = loadScript(TFJS_URL)
      .then(function () { return loadScript(MOBILENET_URL); })
      .then(function () { return window.mobilenet.load(); })
      .then(function (m) {
        model = m;
        return m;
      })
      .catch(function (err) {
        modelPromise = null;
        throw err;
      });
    return modelPromise;
  }

  function shortFileName(f) {
    var parts = String(f).split("/");
    return parts[parts.length - 1];
  }

  /* Download progress bar for the CLIP model. transformers.js caches the
   * weights in IndexedDB, so this download only happens once. */
  function setDownloadProgress(statusEl, file, fraction) {
    if (!statusEl) return;
    var pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
    statusEl.className = "scan-status scan-status-loading";
    statusEl.innerHTML =
      '<div class="scan-status-icon" aria-hidden="true"><span class="paw-loader"></span></div>' +
      '<div style="flex:1;min-width:0"><p class="scan-status-title">Calling the cat breed expert</p>' +
      '<p class="scan-status-text">First visit downloads the expert (about 150 MB, once). After that it lives on your phone.</p>' +
      '<div class="dl-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
      '<div class="dl-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<p class="scan-status-text">' + shortFileName(file) + " " + pct + "%</p></div>";
    statusEl.hidden = false;
  }

  /* Lazy-load the CLIP zero-shot classifier. Tries WebGPU first for GPU
   * acceleration, falls back to wasm automatically. progress_callback gives
   * real per-file download progress while the weights come down. */
  var clipDevice = null;
  var clipDeviceTrying = null;

  function makeProgressCb(statusEl) {
    return function (p) {
      if (!statusEl) return;
      if (p && p.status === "progress" && p.file) {
        setDownloadProgress(statusEl, p.file, (p.progress || 0) / 100);
      } else if (p && (p.status === "done" || p.status === "ready")) {
        setStatus(statusEl, "loading",
          "Cat expert is ready" + (clipDeviceTrying === "webgpu" ? " (GPU)" : " (CPU)"),
          "Giving your cat a very careful look.");
      }
    };
  }

  /* Tiny warmup inference: proves the execution provider actually runs,
   * so a broken WebGPU setup falls back to wasm instead of failing later. */
  function warmupClassifier(c) {
    var t = document.createElement("canvas");
    t.width = 4; t.height = 4;
    var ctx = t.getContext("2d");
    ctx.fillStyle = "#888888"; ctx.fillRect(0, 0, 4, 4);
    return c(t, ["a photo of a cat", "a photo of a dog"]).then(function () { return c; });
  }

  function tryClipDevice(statusEl, device) {
    clipDeviceTrying = device;
    return window.transformers.pipeline("zero-shot-image-classification", CLIP_MODEL_ID, {
      device: device,
      progress_callback: makeProgressCb(statusEl)
    }).then(function (c) {
      return warmupClassifier(c).then(function (ok) {
        return { classifier: ok, device: device };
      });
    });
  }

  function ensureClip(statusEl) {
    if (clipClassifier) return Promise.resolve(clipClassifier);
    if (clipPromise) return clipPromise;
    setDownloadProgress(statusEl, "waking up", 0);
    clipPromise = loadScript(TRANSFORMERS_URL).then(function () {
      return tryClipDevice(statusEl, "webgpu").catch(function () {
        clipDevice = null;
        return tryClipDevice(statusEl, "wasm");
      });
    }).then(function (res) {
      clipClassifier = res.classifier;
      clipDevice = res.device;
      return clipClassifier;
    }).catch(function (err) {
      clipPromise = null;
      clipDevice = null;
      throw err;
    });
    return clipPromise;
  }

  /* Routing: MobileNet stays the fast first pass. Dogs are its home turf
   * (118 breeds), so a confident dog answer goes straight through. Anything
   * feline goes to the CLIP breed expert. Anything else keeps the old
   * honest "not sure" behavior instead of forcing a guess. */
  function decideRoute(pets) {
    if (!pets.length) return "none";
    var top = pets[0];
    if (top.species === "wild" && top.probability >= WILD_CONFIDENT) return "wild";
    if (top.species === "dog" && top.probability >= DOG_CONFIDENT) return "dog";
    if (top.species === "cat" || top.species === "wild") return "cat";
    return "unsure";
  }

  /* Downscale a video frame for CLIP. The vision encoder only wants 224px. */
  function snapFrame(video) {
    var c = document.createElement("canvas");
    var w = video.videoWidth || 480, h = video.videoHeight || 480;
    var scale = Math.min(1, 480 / Math.max(w, h));
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
  }

  /* Run the CLIP breed expert on an image/canvas/video-frame source.
   * Returns a pets-style array: [{breed, species, probability}]. */
  function runClipCat(source, statusEl) {
    return ensureClip(statusEl).then(function (classifier) {
      var prompts = CAT_CANDIDATES.map(function (c) { return c.prompt; });
      return classifier(source, prompts);
    }).then(function (out) {
      var byPrompt = {};
      CAT_CANDIDATES.forEach(function (c) { byPrompt[c.prompt] = c.breed; });
      var pets = [];
      (out || []).slice(0, 3).forEach(function (r) {
        var breed = byPrompt[r.label];
        if (breed) pets.push({ breed: breed, species: "cat", probability: r.score, clip: true });
      });
      return pets;
    });
  }

  function setStatus(el, kind, title, text) {
    if (!el) return;
    el.className = "scan-status scan-status-" + kind;
    el.innerHTML =
      '<div class="scan-status-icon" aria-hidden="true">' + statusIcon(kind) + "</div>" +
      '<div><p class="scan-status-title">' + title + "</p>" +
      (text ? '<p class="scan-status-text">' + text + "</p>" : "") + "</div>";
    el.hidden = false;
  }

  function hideStatus(el) { if (el) el.hidden = true; }

  function statusIcon(kind) {
    if (kind === "loading") return '<span class="paw-loader" aria-hidden="true"></span>';
    if (kind === "error") return "😿";
    if (kind === "denied") return "🙈";
    if (kind === "empty") return "🔍";
    return "🐾";
  }

  function petPredictions(predictions) {
    var out = [];
    for (var i = 0; i < predictions.length; i++) {
      var p = predictions[i];
      if (BREEDS[p.className]) {
        out.push({
          className: p.className,
          probability: p.probability,
          species: BREEDS[p.className].species,
          breed: BREEDS[p.className].breed
        });
      }
    }
    return out.slice(0, 3);
  }

  function speciesEmoji(species) {
    if (species === "cat") return "🐱";
    if (species === "dog") return "🐶";
    return "🦁";
  }

  function quipFor(top) {
    if (!top) return "";
    if ((top.breed === "Tabby" || top.breed === "Mackerel Tabby") && top.orange) {
      return QUIPS.orangeTabby;
    }
    if (QUIPS.breed && QUIPS.breed[top.breed]) return QUIPS.breed[top.breed];
    if (top.species === "dog") return pick(QUIPS.dog);
    if (top.species === "cat") return pick(QUIPS.cat);
    return pick(QUIPS.wild);
  }

  function renderResults(container, pets, sourceForColor) {
    if (!pets.length) {
      container.innerHTML =
        '<div class="result-card result-empty">' +
        '<p class="result-quip">' + pick(QUIPS.noPet) + "</p>" +
        "</div>";
      return;
    }
    var top = pets[0];
    if (top.probability < MIN_CONFIDENCE) {
      container.innerHTML =
        '<div class="result-card result-empty">' +
        '<p class="result-quip">' + pick(QUIPS.unsure) + "</p>" +
        '<p class="result-hint">Best guess was ' + top.breed + " at " + Math.round(top.probability * 100) + "%.</p>" +
        "</div>";
      return;
    }
    if (sourceForColor && (top.breed === "Tabby" || top.breed === "Mackerel Tabby")) {
      top.orange = looksOrange(sourceForColor);
    }
    /* Celebration, once per breed: confetti, paw rain, sparkles, hearts,
     * stars, bubbles, or snow, depending on the breed group. */
    if (window.PFLFX && top.breed !== lastFxBreed) {
      lastFxBreed = top.breed;
      window.PFLFX.celebrate(top.breed, top.species);
    }
    var html = '<p class="result-quip">' + quipFor(top) + "</p>";
    pets.forEach(function (p, i) {
      var pct = Math.round(p.probability * 100);
      html +=
        '<div class="result-row' + (i === 0 ? " result-top" : "") + '">' +
        '<div class="result-row-head"><span class="result-breed">' + speciesEmoji(p.species) + " " + p.breed + "</span>" +
        '<span class="result-pct">' + pct + "%</span></div>" +
        '<div class="result-bar"><div class="result-bar-fill" style="width:' + pct + '%"></div></div>' +
        "</div>";
    });
    container.innerHTML = '<div class="result-card">' + html + "</div>";
  }

  /* Fun easter egg: is this tabby more of an orange tabby? Sample the
   * center of the frame and check for a strong orange hue. */
  function looksOrange(source) {
    try {
      var w = source.videoWidth || source.naturalWidth || source.width;
      var h = source.videoHeight || source.naturalHeight || source.height;
      if (!w || !h) return false;
      var c = document.createElement("canvas");
      var size = 48;
      c.width = size; c.height = size;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      var cw = w * 0.4, ch = h * 0.4;
      ctx.drawImage(source, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;
      var orange = 0, total = 0;
      for (var i = 0; i < data.length; i += 4) {
        var r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var d = max - min, s = max === 0 ? 0 : d / max;
        var hue = 0;
        if (d !== 0) {
          if (max === r) hue = ((g - b) / d) % 6;
          else if (max === g) hue = (b - r) / d + 2;
          else hue = (r - g) / d + 4;
          hue *= 60;
          if (hue < 0) hue += 360;
        }
        total++;
        if (hue >= 12 && hue <= 48 && s > 0.35 && max > 0.25) orange++;
      }
      return total > 0 && orange / total > 0.22;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- Camera mode ---------------- */

  function startCamera() {
    var video = $("cam-video");
    var status = $("cam-status");
    var results = $("cam-results");
    stopCamera();
    setStatus(status, "loading", "Opening your camera", "One sec, asking your phone nicely.");
    results.innerHTML = "";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(status, "error", "No camera API here",
        "This browser does not support camera access. The upload mode below works great though.");
      return;
    }

    ensureModel(status).then(function () {
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false
      });
    }).then(function (s) {
      stream = s;
      video.srcObject = s;
      return video.play();
    }).then(function () {
      hideStatus(status);
      $("cam-live").hidden = false;
      loopPredict();
    }).catch(function (err) {
      var name = err && err.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus(status, "denied", "Camera shy? Totally fine.",
          "You said no to camera access, and I respect that. Tap below to scan a photo instead, it works just as well.");
        showFallbackButton(status, "Use photo upload");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus(status, "empty", "Hmm, no camera found",
          "This device does not seem to have a camera I can use. Photo upload has you covered.");
        showFallbackButton(status, "Use photo upload");
      } else if (err && err.message && err.message.indexOf("Failed to load") === 0) {
        setStatus(status, "error", "The brain failed to load",
          "I could not download the AI model. Check your connection and try again.");
        showRetryButton(status, startCamera);
      } else {
        setStatus(status, "error", "Well, that did not work",
          "Something odd happened with the camera (" + (name || "unknown error") + "). You can retry, or switch to photo upload.");
        showRetryButton(status, startCamera);
        showFallbackButton(status, "Use photo upload instead");
      }
    });
  }

  function showFallbackButton(statusEl, label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-soft";
    btn.textContent = label;
    btn.addEventListener("click", function () { switchMode("upload"); });
    statusEl.appendChild(btn);
  }

  function showRetryButton(statusEl, fn) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-soft";
    btn.textContent = "Try again";
    btn.addEventListener("click", fn);
    statusEl.appendChild(btn);
  }

  /* CLIP state for live mode: throttle to one expert call per CLIP_MS,
   * reuse the last answer while the scene looks stable. */
  var lastClipAt = 0;
  var lastClipPets = null;
  var clipRunning = false;
  var clipCooldownUntil = 0;
  var lastFxBreed = null;

  function loopPredict() {
    clearTimeout(loopTimer);
    var video = $("cam-video");
    var status = $("cam-status");
    var results = $("cam-results");
    if (!model || !stream || video.readyState < 2) {
      loopTimer = setTimeout(loopPredict, LOOP_MS);
      return;
    }
    model.classify(video, TOP_K).then(function (preds) {
      var pets = petPredictions(preds);
      var route = decideRoute(pets);
      if (route !== "cat") {
        /* Dog, confident wildcat, unsure, or no pet: MobileNet said its
         * piece, render it as-is. */
        lastClipPets = null;
        renderResults(results, pets, video);
        return;
      }
      /* Feline: consult the breed expert, at most once per CLIP_MS. */
      var now = Date.now();
      if (lastClipPets) {
        hideStatus(status);
        renderResults(results, lastClipPets, video);
      } else if (!clipPromise && now >= clipCooldownUntil) {
        setStatus(status, "loading", "Cat spotted. Consulting the breed expert.",
          "The specialist is taking a careful look. One moment.");
      }
      if (!clipRunning && now - lastClipAt >= CLIP_MS && now >= clipCooldownUntil) {
        lastClipAt = now;
        clipRunning = true;
        runClipCat(snapFrame(video), status).then(function (clipPets) {
          clipRunning = false;
          if (!stream) return;
          if (clipPets.length) {
            lastClipPets = clipPets;
            hideStatus(status);
            renderResults(results, clipPets, video);
          }
        }).catch(function () {
          clipRunning = false;
          /* Expert unreachable (offline, download failed): back off for a
           * minute and fall back to MobileNet's coarse cat label. */
          clipCooldownUntil = Date.now() + 60000;
          if (stream && !lastClipPets) {
            setStatus(status, "error", "The breed expert could not be reached",
              "Showing the quick guess instead. It will retry automatically when your connection is back.");
            renderResults(results, pets, video);
          }
        });
      }
    }).catch(function () {
      /* A single dropped frame is not worth bothering anyone about. */
    }).finally(function () {
      if (stream) loopTimer = setTimeout(loopPredict, LOOP_MS);
    });
  }

  function stopCamera() {
    clearTimeout(loopTimer);
    loopTimer = null;
    lastFxBreed = null;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    var video = $("cam-video");
    if (video) { video.pause(); video.srcObject = null; }
    var live = $("cam-live");
    if (live) live.hidden = true;
  }

  function flipCamera() {
    facingMode = facingMode === "environment" ? "user" : "environment";
    startCamera();
  }

  /* ---------------- Upload mode ---------------- */

  function handleFile(file) {
    var status = $("upload-status");
    var results = $("upload-results");
    var preview = $("upload-preview");
    results.innerHTML = "";
    lastFxBreed = null;
    if (!file) return;
    if (!file.type || file.type.indexOf("image/") !== 0) {
      setStatus(status, "error", "That is not a photo",
        "I can only sniff image files (JPG, PNG, WebP and friends). Try another file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setStatus(status, "error", "Whoa, big photo",
        "That file is over 12 MB. A smaller photo will scan faster anyway.");
      return;
    }
    setStatus(status, "loading", "Reading your photo", "Developing it in the lab darkroom.");
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      preview.innerHTML = "";
      preview.appendChild(img);
      preview.hidden = false;
      ensureModel(status).then(function () {
        setStatus(status, "loading", "Sniffing the pixels", "The model is giving your pet a good look.");
        return model.classify(img, TOP_K);
      }).then(function (preds) {
        var pets = petPredictions(preds);
        var route = decideRoute(pets);
        if (route !== "cat") {
          hideStatus(status);
          renderResults(results, pets, img);
          return null;
        }
        return runClipCat(img, status).then(function (clipPets) {
          hideStatus(status);
          if (clipPets.length) {
            renderResults(results, clipPets, img);
          } else {
            setStatus(status, "error", "The expert drew a blank",
              "The breed specialist could not decide on this one. Try a clearer photo.");
          }
        }, function () {
          /* CLIP failed to load or run: fall back to the quick guess. */
          hideStatus(status);
          setStatus(status, "error", "The breed expert could not load",
            "Showing the quick guess instead. Check your connection and retry for the full 60+ breed check.");
          showRetryButton(status, function () { handleFile(file); });
          renderResults(results, pets, img);
        });
      }).catch(function (err) {
        if (err && err.message && err.message.indexOf("Failed to load") === 0) {
          setStatus(status, "error", "The brain failed to load",
            "I could not download the AI model. Check your connection and try again.");
          showRetryButton(status, function () { handleFile(file); });
        } else {
          setStatus(status, "error", "Hmm, that photo confused me",
            "Something went wrong reading this image. Try a different one.");
        }
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setStatus(status, "error", "Could not read that file",
        "The image seems to be corrupted. Try another photo.");
    };
    img.src = url;
    img.alt = "Uploaded pet photo";
  }

  function initUpload() {
    var drop = $("drop-zone");
    var input = $("file-input");
    if (!drop || drop.dataset.ready) return;
    drop.dataset.ready = "1";
    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    input.addEventListener("change", function () {
      if (input.files && input.files[0]) handleFile(input.files[0]);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.add("drag-over"); });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.remove("drag-over"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  /* ---------------- Mode switching ---------------- */

  function switchMode(mode) {
    currentMode = mode;
    var camPane = $("pane-camera"), upPane = $("pane-upload");
    var camTab = $("tab-camera"), upTab = $("tab-upload");
    if (mode === "camera") {
      stopCamera();
      camPane.hidden = false; upPane.hidden = true;
      camTab.classList.add("active"); upTab.classList.remove("active");
      camTab.setAttribute("aria-selected", "true"); upTab.setAttribute("aria-selected", "false");
      startCamera();
    } else {
      stopCamera();
      camPane.hidden = true; upPane.hidden = false;
      upTab.classList.add("active"); camTab.classList.remove("active");
      upTab.setAttribute("aria-selected", "true"); camTab.setAttribute("aria-selected", "false");
      initUpload();
    }
  }

  function init() {
    $("tab-camera").addEventListener("click", function () { switchMode("camera"); });
    $("tab-upload").addEventListener("click", function () { switchMode("upload"); });
    $("flip-camera").addEventListener("click", flipCamera);
    $("stop-camera").addEventListener("click", function () {
      stopCamera();
      setStatus($("cam-status"), "empty", "Camera off",
        "The lens is closed. Tap the camera tab whenever you want to scan again.");
      $("cam-results").innerHTML = "";
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { clearTimeout(loopTimer); loopTimer = null; }
      else if (currentMode === "camera" && stream && model) { loopPredict(); }
    });
    /* Lazy-load the model as soon as the scanner scrolls into view,
     * so it is warm by the time someone taps a tab. */
    if ("IntersectionObserver" in window) {
      var seen = false;
      var io = new IntersectionObserver(function (entries) {
        if (!seen && entries[0].isIntersecting) {
          seen = true;
          ensureModel(null).catch(function () { /* will retry on tap */ });
          io.disconnect();
        }
      }, { rootMargin: "400px" });
      io.observe($("scanner"));
    }
    /* Do not auto-start the camera; wait for an explicit tap. */
  }

  window.PFLScanner = {
    init: init,
    preload: function () { ensureModel(null).catch(function () {}); },
    stop: stopCamera
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
