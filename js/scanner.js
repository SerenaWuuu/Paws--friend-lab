/* Paws Friend Lab: Breed Scanner.
 * Runs MobileNet (ImageNet) fully on-device via TensorFlow.js, then maps
 * predictions through a curated cat/dog breed list. No photo ever leaves
 * the browser.
 */
(function () {
  "use strict";

  var TFJS_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js";
  var MOBILENET_URL = "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js";
  var TOP_K = 8;
  var MIN_CONFIDENCE = 0.12;
  var LOOP_MS = 1000;

  var BREEDS = window.PFL_BREEDS || {};
  var QUIPS = window.PFL_QUIPS || { dog: [], cat: [], wild: [], unsure: [], noPet: [], breed: {} };

  var model = null;
  var modelPromise = null;
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

  function loopPredict() {
    clearTimeout(loopTimer);
    var video = $("cam-video");
    var results = $("cam-results");
    if (!model || !stream || video.readyState < 2) {
      loopTimer = setTimeout(loopPredict, LOOP_MS);
      return;
    }
    model.classify(video, TOP_K).then(function (preds) {
      var pets = petPredictions(preds);
      renderResults(results, pets, video);
    }).catch(function () {
      /* A single dropped frame is not worth bothering anyone about. */
    }).finally(function () {
      if (stream) loopTimer = setTimeout(loopPredict, LOOP_MS);
    });
  }

  function stopCamera() {
    clearTimeout(loopTimer);
    loopTimer = null;
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
        hideStatus(status);
        renderResults(results, petPredictions(preds), img);
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

  window.PFLScanner = { init: init, preload: function () { ensureModel(null).catch(function () {}); } };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
