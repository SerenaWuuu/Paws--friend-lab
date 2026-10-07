/* Paws Friend Lab: Weight Tracker UI.
 * The unified tracker: quick-log, trends, medication schedules with
 * reminders, cat profiles, and data tools. All local-first (localStorage).
 * Apple Health-inspired cards on the dark lab theme. No em-dashes in copy.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var COATS = [
    { key: "orange-tabby", label: "Orange tabby", css: "linear-gradient(135deg,#f5a623,#d97a12)" },
    { key: "gray-tabby", label: "Gray tabby", css: "linear-gradient(135deg,#9aa0a6,#5f646b)" },
    { key: "brown-tabby", label: "Brown tabby", css: "linear-gradient(135deg,#a9744f,#6e4a2c)" },
    { key: "tuxedo", label: "Tuxedo", css: "linear-gradient(135deg,#2b2b2b 55%,#f2f2f2 55%)" },
    { key: "calico", label: "Calico", css: "linear-gradient(135deg,#e8912d 33%,#2b2b2b 33%,#2b2b2b 66%,#f2f2f2 66%)" },
    { key: "tortoiseshell", label: "Tortoiseshell", css: "linear-gradient(135deg,#3a2a1a,#b06a2a 55%,#2b2118)" },
    { key: "siamese-point", label: "Siamese point", css: "linear-gradient(135deg,#e8dcc8,#8a6f55)" },
    { key: "black", label: "Black", css: "linear-gradient(135deg,#3d3d3d,#101010)" },
    { key: "white", label: "White", css: "linear-gradient(135deg,#ffffff,#d5d5d5)" },
    { key: "gray", label: "Gray", css: "linear-gradient(135deg,#b0b6bb,#767d84)" },
    { key: "ginger", label: "Ginger", css: "linear-gradient(135deg,#f7b267,#dd7430)" },
    { key: "cream", label: "Cream", css: "linear-gradient(135deg,#f7ead7,#dfc69c)" }
  ];

  function coatLabel(key) {
    for (var i = 0; i < COATS.length; i++) {
      if (COATS[i].key === key) return COATS[i].label;
    }
    return null;
  }

  var TYPE_META = {
    feeding: { icon: "🍽️", title: "Meal" },
    water: { icon: "💧", title: "Water" },
    weight: { icon: "⚖️", title: "Weigh-in" },
    litter: { icon: "💩", title: "Litter" },
    vet: { icon: "🏥", title: "Vet visit" },
    med: { icon: "💊", title: "Meds" }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtTime(ts) {
    var d = new Date(ts), h = d.getHours(), ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + pad(d.getMinutes()) + " " + ap;
  }
  function fmtClock(hhmm) {
    var p = hhmm.split(":"), h = +p[0], ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + p[1] + " " + ap;
  }
  function dayLabel(ts) {
    var now = Date.now();
    var d = new Date(ts), t = new Date(now);
    var dk = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
    var tk = t.getFullYear() + "-" + t.getMonth() + "-" + t.getDate();
    var y = new Date(now - 86400000);
    var yk = y.getFullYear() + "-" + y.getMonth() + "-" + y.getDate();
    if (dk === tk) return "Today";
    if (dk === yk) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  function toLocalInputValue(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function parseLocalInputValue(v) {
    var d = new Date(v);
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
  }
  function catAge(birthday) {
    if (!birthday) return null;
    var b = new Date(birthday + "T00:00:00");
    if (isNaN(b.getTime())) return null;
    var now = new Date();
    var months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (months < 0) return null;
    if (months < 1) return "just a baby";
    if (months < 12) return months + (months === 1 ? " month old" : " months old");
    var yrs = Math.floor(months / 12), rem = months % 12;
    var s = yrs + (yrs === 1 ? " yr" : " yrs");
    if (rem) s += " " + rem + " mo";
    return s + " old";
  }

  /* ---------------- Store ---------------- */
  var hadLegacy = false;
  try {
    hadLegacy = !window.localStorage.getItem("paws-friend-lab/weight/v1") &&
      !!window.localStorage.getItem("cat-care-log/v1");
  } catch (e) { hadLegacy = false; }
  var store = window.PFLWeightStore.createStore(window.localStorage);

  /* ---------------- Toast + sheet ---------------- */
  var toastTimer = null;
  function toast(msg, undoFn) {
    var el = $("wToast");
    el.innerHTML = esc(msg) + (undoFn ? ' <button type="button" id="wToastUndo">Undo</button>' : "");
    el.classList.add("show");
    if (undoFn) {
      $("wToastUndo").addEventListener("click", function () {
        undoFn();
        el.classList.remove("show");
      });
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3200);
  }
  function openSheet(title, sub, bodyHTML) {
    $("wSheetTitle").textContent = title;
    $("wSheetSub").textContent = sub || "";
    $("wSheetBody").innerHTML = bodyHTML;
    $("wSheetBackdrop").classList.add("open");
    $("wSheet").classList.add("open");
  }
  function closeSheet() {
    $("wSheetBackdrop").classList.remove("open");
    $("wSheet").classList.remove("open");
  }

  /* ---------------- Main + sub tabs ---------------- */
  function switchMainTab(which) {
    var isWeight = which === "weight";
    $("maintab-scanner").classList.toggle("active", !isWeight);
    $("maintab-weight").classList.toggle("active", isWeight);
    $("maintab-scanner").setAttribute("aria-selected", String(!isWeight));
    $("maintab-weight").setAttribute("aria-selected", String(isWeight));
    $("pane-scanner").hidden = isWeight;
    $("pane-weight").hidden = !isWeight;
    if (isWeight) {
      if (window.PFLScanner && window.PFLScanner.stop) window.PFLScanner.stop();
      renderWeightAll();
    }
  }
  function switchWTab(name) {
    $all("[data-wtab]").forEach(function (b) {
      var on = b.getAttribute("data-wtab") === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    $all(".w-subpane").forEach(function (p) {
      p.hidden = p.id !== "wsub-" + name;
    });
    if (name === "trends") renderTrends();
    if (name === "meds") renderMeds();
    if (name === "cats") renderCatsTab();
    if (name === "log") { renderHead(); renderToday(); }
  }

  /* ---------------- Rendering ---------------- */
  function currentCat() { return store.getActiveCat(); }

  function renderHead() {
    var cat = currentCat();
    if (!cat) {
      $("wAvatar").innerHTML = "🐱";
      $("wCatName").textContent = "Weight Tracker";
      $("wCatMeta").textContent = "Add a cat to begin";
      $("wStreakPill").innerHTML = "🐾";
      return;
    }
    $("wAvatar").innerHTML = cat.photo ? '<img src="' + cat.photo + '" alt="">' : "🐱";
    $("wCatName").textContent = cat.name;
    var bits = [];
    var age = catAge(cat.birthday);
    if (age) bits.push(age);
    var cl = coatLabel(cat.coat);
    if (cl) bits.push(cl);
    var pts = store.weightPoints(cat.id);
    if (pts.length) {
      var w = store.toDisplayWeight(pts[pts.length - 1].kg);
      bits.push((Math.round(w * 10) / 10) + " " + store.getUnit());
    }
    $("wCatMeta").textContent = bits.length ? bits.join(" · ") : "No details yet";
    var streak = store.streakDays(cat.id);
    $("wStreakPill").innerHTML = streak > 0 ? "🔥 " + streak + (streak === 1 ? " day" : " days") : "🐾 start today";
  }

  function entryMeta(e) {
    var meta = TYPE_META[e.type] || { icon: "🐾", title: "Log" };
    var detail = "";
    if (e.type === "feeding") {
      var parts = [];
      if (typeof e.amount === "number") parts.push(e.amount + "g");
      if (e.foodType) parts.push(e.foodType);
      detail = parts.join(" · ");
    } else if (e.type === "weight") {
      var w = store.toDisplayWeight(e.value);
      detail = (Math.round(w * 10) / 10) + " " + store.getUnit();
    }
    if (e.note) detail = detail ? detail + ", " + e.note : e.note;
    return { icon: meta.icon, title: meta.title, detail: detail };
  }
  function entryHTML(e) {
    var m = entryMeta(e);
    return '<div class="w-entry" data-id="' + e.id + '">' +
      '<span class="e">' + m.icon + "</span>" +
      '<div class="body"><div class="title">' + esc(m.title) + "</div>" +
      (m.detail ? '<div class="meta">' + esc(m.detail) + " · " + fmtTime(e.ts) + "</div>"
                : '<div class="meta">' + fmtTime(e.ts) + "</div>") +
      '</div><button class="del" aria-label="Delete entry">×</button></div>';
  }
  function bindEntryDeletes(container) {
    container.querySelectorAll(".w-entry .del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".w-entry").getAttribute("data-id");
        store.removeEntry(id);
        renderWeightAll();
        toast("Entry deleted. No take-backs from the cat.");
      });
    });
  }

  function renderToday() {
    var cat = currentCat();
    var list = $("wTodayList");
    if (!cat) {
      list.innerHTML = '<div class="w-empty"><div class="big">🐱</div><p><strong>Add a cat first.</strong></p><p>Head to the Cats tab to introduce your tiny ruler.</p></div>';
      return;
    }
    var entries = store.entriesOnDay(cat.id, Date.now());
    if (!entries.length) {
      list.innerHTML = '<div class="w-empty"><div class="big">🐱</div>' +
        "<p><strong>Nothing logged today.</strong></p>" +
        "<p>Tap a button above. Three taps and the cat will respect you.</p></div>";
      return;
    }
    list.innerHTML = '<div class="w-daylabel">Today</div>' + entries.map(entryHTML).join("");
    bindEntryDeletes(list);
  }

  function streakCopy(n) {
    if (n <= 0) return "No streak yet. Log something today and the counter starts purring.";
    if (n === 1) return "One day logged. Every legend starts somewhere.";
    return n + " day logging streak. The cat has noticed your devotion.";
  }

  /* ----- Canvas charts (dependency-free, Health-style gradients) ----- */
  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function chartEmpty(wrapId, icon, title, sub) {
    $(wrapId).innerHTML = '<div class="w-chart-empty"><div style="font-size:2rem;margin-bottom:0.4rem">' + icon + "</div>" +
      "<p><strong>" + esc(title) + "</strong><br>" + esc(sub) + "</p></div>";
  }

  function drawWeightChart() {
    var cat = currentCat();
    var canvas = $("wWeightChart");
    var pts = cat ? store.weightPoints(cat.id) : [];
    if (!pts.length) {
      chartEmpty("wWeightWrap", "⚖️", "No weigh-ins yet.", "Log a weight and the trend line will appear here.");
      return;
    }
    $("wWeightWrap").innerHTML = "";
    var fresh = document.createElement("canvas");
    fresh.id = "wWeightChart";
    $("wWeightWrap").appendChild(fresh);
    var box = setupCanvas(fresh), ctx = box.ctx, W = box.w, H = box.h;
    var unit = store.getUnit();
    var vals = pts.map(function (p) { return store.toDisplayWeight(p.kg); });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var spanPad = (max - min) * 0.25 || Math.max(max * 0.05, 0.5);
    min -= spanPad; max += spanPad;
    var L = 46, R = 12, T = 16, B = 26;
    function X(i) { return L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)); }
    function Y(v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); }
    ctx.strokeStyle = "rgba(255,248,240,0.12)";
    ctx.fillStyle = "rgba(255,248,240,0.45)";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gv = min + (max - min) * g / 3;
      var gy = Y(gv);
      ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(W - R, gy); ctx.stroke();
      ctx.fillText((Math.round(gv * 10) / 10) + " " + unit, 4, gy + 3);
    }
    var px = pts.map(function (_, i) { return X(i); });
    var py = vals.map(function (v) { return Y(v); });
    /* Area gradient */
    var grad = ctx.createLinearGradient(0, T, 0, H - B);
    grad.addColorStop(0, "rgba(255,107,74,0.35)");
    grad.addColorStop(1, "rgba(255,107,74,0.02)");
    ctx.beginPath();
    ctx.moveTo(px[0], H - B);
    if (pts.length === 1) {
      ctx.lineTo(px[0], py[0]);
    } else {
      ctx.lineTo(px[0], py[0]);
      for (var i = 1; i < px.length; i++) {
        var xc = (px[i - 1] + px[i]) / 2, yc = (py[i - 1] + py[i]) / 2;
        ctx.quadraticCurveTo(px[i - 1], py[i - 1], xc, yc);
      }
      ctx.lineTo(px[px.length - 1], py[py.length - 1]);
    }
    ctx.lineTo(px[px.length - 1], H - B);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    /* Line */
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.moveTo(px[0] - 24, py[0]); ctx.lineTo(px[0] + 24, py[0]);
    } else {
      ctx.moveTo(px[0], py[0]);
      for (var j = 1; j < px.length; j++) {
        var xc2 = (px[j - 1] + px[j]) / 2, yc2 = (py[j - 1] + py[j]) / 2;
        ctx.quadraticCurveTo(px[j - 1], py[j - 1], xc2, yc2);
      }
      ctx.lineTo(px[px.length - 1], py[py.length - 1]);
    }
    ctx.strokeStyle = "#ff6b4a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
    /* Dots + min/max pins */
    var minI = 0, maxI = 0;
    vals.forEach(function (v, k) { if (v < vals[minI]) minI = k; if (v > vals[maxI]) maxI = k; });
    px.forEach(function (x, k) {
      ctx.beginPath();
      ctx.arc(x, py[k], 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff6b4a";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    });
    ctx.fillStyle = "rgba(255,248,240,0.75)";
    ctx.font = "700 10px -apple-system, sans-serif";
    if (pts.length > 1) {
      ctx.fillText("max " + (Math.round(vals[maxI] * 10) / 10), Math.min(px[maxI] + 8, W - 64), py[maxI] - 8);
      ctx.fillText("min " + (Math.round(vals[minI] * 10) / 10), Math.min(px[minI] + 8, W - 64), py[minI] + 16);
    }
    /* X labels */
    ctx.fillStyle = "rgba(255,248,240,0.45)";
    ctx.font = "10px -apple-system, sans-serif";
    function dstr(ts) { var d = new Date(ts); return (d.getMonth() + 1) + "/" + d.getDate(); }
    ctx.fillText(dstr(pts[0].ts), L, H - 8);
    if (pts.length > 2) {
      var mid = dstr(pts[Math.floor(pts.length / 2)].ts);
      ctx.fillText(mid, W / 2 - 14, H - 8);
    }
    if (pts.length > 1) {
      var last = dstr(pts[pts.length - 1].ts);
      ctx.fillText(last, W - R - 30, H - 8);
    }
  }

  function drawMealsChart() {
    var cat = currentCat();
    var days = cat ? store.feedingsByDay(cat.id, 7) : [];
    var total = days.reduce(function (s, d) { return s + d.count; }, 0);
    if (!total) {
      chartEmpty("wMealsWrap", "🍽️", "No meals logged in the last 7 days.", "Somebody is either fasting or you forgot to tap.");
      return;
    }
    $("wMealsWrap").innerHTML = "";
    var fresh = document.createElement("canvas");
    fresh.id = "wMealsChart";
    $("wMealsWrap").appendChild(fresh);
    var box = setupCanvas(fresh), ctx = box.ctx, W = box.w, H = box.h;
    var maxC = Math.max.apply(null, days.map(function (d) { return d.count; }));
    var L = 8, R = 8, T = 20, B = 24;
    var slot = (W - L - R) / days.length;
    var bw = Math.min(44, slot * 0.52);
    var dayNames = ["S", "M", "T", "W", "T", "F", "S"];
    days.forEach(function (d, i) {
      var h = maxC ? (H - T - B) * d.count / maxC : 0;
      var x = L + slot * i + (slot - bw) / 2;
      var y = H - B - h;
      ctx.fillStyle = d.count === 0 ? "rgba(255,248,240,0.14)" : (i === days.length - 1 ? "#ff6b4a" : "#1f9e8e");
      var bh = Math.max(h, 4);
      var by = h === 0 ? H - B - 4 : y;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, by, bw, bh, [7, 7, 3, 3]);
        ctx.fill();
      } else {
        ctx.fillRect(x, by, bw, bh);
      }
      if (d.count > 0) {
        ctx.fillStyle = "rgba(255,248,240,0.75)";
        ctx.font = "700 10px -apple-system, sans-serif";
        ctx.fillText(String(d.count), x + bw / 2 - 3, by - 5);
      }
      ctx.fillStyle = "rgba(255,248,240,0.45)";
      ctx.font = "10px -apple-system, sans-serif";
      var dn = new Date(d.ts).getDay();
      ctx.fillText(dayNames[dn], x + bw / 2 - 3, H - 8);
    });
  }

  function renderTrends() {
    var cat = currentCat();
    var banner = $("wStreakBanner");
    if (!cat) { banner.style.display = "none"; }
    else {
      banner.style.display = "flex";
      var n = store.streakDays(cat.id);
      $("wStreakNum").textContent = n > 0 ? n : "–";
      $("wStreakText").textContent = streakCopy(n);
    }
    drawWeightChart();
    drawMealsChart();
    var box = $("wWeekTimeline");
    if (!cat) { box.innerHTML = ""; return; }
    var from = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - 6 * 86400000;
    var entries = store.entriesFor(cat.id, { from: from });
    if (!entries.length) {
      box.innerHTML = '<div class="w-empty"><div class="big">📓</div>' +
        "<p><strong>A blank week.</strong></p><p>The journal is empty and the cat is judging you.</p></div>";
      return;
    }
    var groups = {}, order = [], seen = {};
    entries.forEach(function (e) {
      var k = dayLabel(e.ts);
      (groups[k] = groups[k] || []).push(e);
      if (!seen[k]) { seen[k] = true; order.push(k); }
    });
    box.innerHTML = order.map(function (k) {
      return '<div class="w-daylabel">' + esc(k) + "</div>" + groups[k].map(entryHTML).join("");
    }).join("");
    bindEntryDeletes(box);
  }

  /* ---------------- Medications ---------------- */
  function renderMeds() {
    var cat = currentCat();
    var list = $("wMedList");
    if (!cat) {
      list.innerHTML = '<div class="w-card"><div class="w-empty"><div class="big">💊</div><p><strong>No cat, no meds.</strong></p><p>Add a cat first.</p></div></div>';
      return;
    }
    var meds = store.medsFor(cat.id);
    if (!meds.length) {
      list.innerHTML = '<div class="w-card"><div class="w-empty"><div class="big">💊</div>' +
        "<p><strong>No medications scheduled.</strong></p><p>For the healthy ones, this page stays beautifully empty.</p></div></div>";
      return;
    }
    list.innerHTML = meds.map(function (m) {
      var due = store.medDue(m, Date.now());
      var cls = due.state === "overdue" ? "overdue" : due.state === "due" ? "due" : "ok";
      var pill = due.state === "overdue" ? "🔴" : due.state === "due" ? "🟡" : "🟢";
      return '<div class="w-med ' + cls + '" data-id="' + m.id + '">' +
        '<div class="m-head"><span style="font-size:1.3rem">💊</span>' +
        '<div class="m-name">' + esc(m.name) + (m.dosage ? ' <span class="m-dose">' + esc(m.dosage) + "</span>" : "") + "</div>" +
        '<span class="m-status">' + pill + " " + esc(due.label) + "</span></div>" +
        '<div class="m-times">' + m.times.map(fmtClock).join(" · ") + " daily</div>" +
        '<div class="m-actions">' +
        '<button class="btn btn-primary" data-act="taken">✓ Mark taken</button>' +
        '<button class="btn btn-ghost" data-act="ics">📅 Calendar</button>' +
        '<button class="btn btn-ghost" data-act="edit">Edit</button>' +
        '<button class="btn btn-ghost" data-act="del" aria-label="Delete medication">🗑</button>' +
        "</div></div>";
    }).join("");
    list.querySelectorAll(".w-med").forEach(function (el) {
      var id = el.getAttribute("data-id");
      el.querySelector('[data-act="taken"]').addEventListener("click", function () {
        store.markMedTaken(id);
        renderMeds(); renderHead();
        toast("Dose logged. Administered with minimal drama, hopefully.");
      });
      el.querySelector('[data-act="ics"]').addEventListener("click", function () {
        exportMedICS(id);
      });
      el.querySelector('[data-act="edit"]').addEventListener("click", function () {
        openMedSheet(id);
      });
      el.querySelector('[data-act="del"]').addEventListener("click", function () {
        var m = store.medsFor(currentCat().id).filter(function (x) { return x.id === id; })[0];
        openSheet("Remove " + (m ? m.name : "medication") + "?",
          "The schedule and its reminders go away. Logged doses stay in history.",
          '<div class="w-btnrow"><button class="btn btn-ghost" id="wCancelDel">Keep it</button>' +
          '<button class="btn btn-danger" id="wConfirmDel">Remove</button></div>');
        $("wCancelDel").addEventListener("click", closeSheet);
        $("wConfirmDel").addEventListener("click", function () {
          store.removeMed(id);
          closeSheet(); renderMeds();
          toast("Medication removed.");
        });
      });
    });
  }

  function defaultTimes(n) {
    var presets = {
      1: ["08:00"],
      2: ["08:00", "20:00"],
      3: ["08:00", "14:00", "20:00"],
      4: ["08:00", "12:00", "18:00", "22:00"]
    };
    return presets[n] || ["08:00"];
  }

  function openMedSheet(medId) {
    var cat = currentCat();
    if (!cat) return;
    var existing = medId ? store.medsFor(cat.id).filter(function (m) { return m.id === medId; })[0] : null;
    var times = existing ? existing.times.slice() : defaultTimes(2);
    function timesHTML() {
      return times.map(function (t, i) {
        return '<div class="w-times-row"><input type="time" class="wMedTime" data-i="' + i + '" value="' + t + '">' +
          (times.length > 1 ? '<button type="button" class="btn btn-ghost wMedTimeDel" data-i="' + i + '">×</button>' : "") + "</div>";
      }).join("");
    }
    function drawTimes() {
      $("wMedTimes").innerHTML = timesHTML() +
        (times.length < 8 ? '<button type="button" class="btn btn-ghost btn-block" id="wMedTimeAdd">＋ Add a time</button>' : "");
      $all(".wMedTime").forEach(function (inp) {
        inp.addEventListener("change", function () {
          times[+inp.getAttribute("data-i")] = inp.value || "08:00";
        });
      });
      $all(".wMedTimeDel").forEach(function (b) {
        b.addEventListener("click", function () {
          times.splice(+b.getAttribute("data-i"), 1);
          drawTimes();
        });
      });
      var add = $("wMedTimeAdd");
      if (add) add.addEventListener("click", function () {
        times.push("08:00");
        drawTimes();
      });
    }
    openSheet(existing ? "Edit medication" : "Add medication",
      "Name it, dose it, set the times. The tracker will nudge you while this page is open.",
      '<div class="w-field"><label>Medication name</label>' +
      '<input type="text" id="wMedName" maxlength="60" placeholder="e.g. Methimazole" value="' + esc(existing ? existing.name : "") + '"></div>' +
      '<div class="w-field"><label>Dosage</label>' +
      '<input type="text" id="wMedDose" maxlength="60" placeholder="e.g. 2.5mg, half pill" value="' + esc(existing ? existing.dosage : "") + '"></div>' +
      '<div class="w-field"><label>Times per day</label><div id="wMedTimes"></div></div>' +
      '<button class="btn btn-primary btn-block" id="wMedSave">' + (existing ? "Save medication" : "Add medication") + " 💊</button>");
    drawTimes();
    $("wMedSave").addEventListener("click", function () {
      var name = $("wMedName").value.trim();
      var dose = $("wMedDose").value.trim();
      var clean = times.filter(function (t) { return /^\d{2}:\d{2}$/.test(t); });
      if (!name) { toast("Give the medication a name first."); return; }
      if (!clean.length) { toast("Set at least one daily time."); return; }
      var res = existing
        ? (store.updateMed(medId, { name: name, dosage: dose, times: clean }) ? { ok: true } : { ok: false })
        : store.addMed(cat.id, { name: name, dosage: dose, times: clean });
      if (!res.ok) { toast("Could not save. The cat objects to the paperwork."); return; }
      closeSheet();
      renderMeds();
      toast(existing ? "Medication updated." : "Medication scheduled. The patient has been notified. Probably.");
    });
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  function exportMedICS(medId) {
    var cat = currentCat();
    var med = cat && store.medsFor(cat.id).filter(function (m) { return m.id === medId; })[0];
    if (!med) return;
    function icsLocal(d) {
      return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" +
        pad(d.getHours()) + pad(d.getMinutes()) + "00";
    }
    var stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Paws Friend Lab//Weight Tracker//EN"];
    med.times.forEach(function (t, i) {
      var p = t.split(":");
      var start = new Date();
      start.setHours(+p[0], +p[1], 0, 0);
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + med.id + "-" + i + "@pawsfriendlab");
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART:" + icsLocal(start));
      lines.push("RRULE:FREQ=DAILY");
      lines.push("SUMMARY:" + icsEscape("💊 " + cat.name + ": " + med.name + (med.dosage ? " (" + med.dosage + ")" : "")));
      lines.push("DESCRIPTION:" + icsEscape("Medication reminder from Paws Friend Lab Weight Tracker."));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "medication-" + med.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast("Calendar file downloaded. Import it and your phone will handle the nagging.");
  }

  /* ---------------- Cats tab ---------------- */
  function renderCatsTab() {
    var cats = store.listCats();
    var activeId = store.getActiveCatId();
    var chips = cats.map(function (c) {
      var pic = c.photo ? '<img src="' + c.photo + '" alt="">' : "🐱";
      return '<button class="w-catchip' + (c.id === activeId ? " sel" : "") + '" data-id="' + c.id + '">' +
        '<span class="mini">' + pic + "</span>" + esc(c.name) + "</button>";
    }).join("");
    chips += '<button class="w-catchip add" id="wAddCatChip">＋ Add cat</button>';
    $("wCatChips").innerHTML = chips;
    $all("#wCatChips .w-catchip[data-id]").forEach(function (b) {
      b.addEventListener("click", function () {
        store.setActiveCat(b.getAttribute("data-id"));
        renderWeightAll();
        toast("Now tracking " + store.getActiveCat().name + ".");
      });
    });
    $("wAddCatChip").addEventListener("click", function () { openCatSheet(null); });

    var cat = currentCat();
    var prof = $("wProfileCard");
    if (!cat) {
      prof.innerHTML = '<div class="w-empty"><div class="big">🐈</div><p><strong>No cats yet.</strong></p><p>Add your first cat to start the journal.</p></div>';
      return;
    }
    var total = store.entriesFor(cat.id).length;
    var streak = store.streakDays(cat.id);
    var age = catAge(cat.birthday);
    var cl = coatLabel(cat.coat);
    prof.innerHTML =
      '<div class="w-profile-top">' +
        '<div class="w-profile-photo" id="wProfilePhoto">' +
          (cat.photo ? '<img src="' + cat.photo + '" alt="">' : "🐱") +
          '<span class="cam">📷</span></div>' +
        '<div style="flex:1;min-width:0"><h4 style="margin-bottom:0.15rem">' + esc(cat.name) + "</h4>" +
        '<p class="w-hint" style="margin:0">' +
          esc([age || "Age unknown", cl || "Coat unknown"].join(" · ")) + "</p></div>" +
      "</div>" +
      '<div class="w-statrow">' +
        '<div class="w-stat"><div class="v">' + total + '</div><div class="k">logs</div></div>' +
        '<div class="w-stat"><div class="v">' + streak + '</div><div class="k">day streak</div></div>' +
        '<div class="w-stat"><div class="v">' + store.feedingsByDay(cat.id, 1)[0].count + '</div><div class="k">meals today</div></div>' +
      "</div>" +
      '<div class="w-btnrow"><button class="btn btn-ghost" id="wEditProfile">Edit profile</button>' +
      '<button class="btn btn-ghost" id="wRemoveCat">Remove cat</button></div>' +
      '<input type="file" id="wPhotoInput" accept="image/*" hidden>';
    $("wEditProfile").addEventListener("click", function () { openCatSheet(cat); });
    $("wRemoveCat").addEventListener("click", function () {
      openSheet("Remove " + cat.name + "?",
        "This deletes the cat, every log, and every medication schedule attached to it.",
        '<div class="w-btnrow"><button class="btn btn-ghost" id="wKeepCat">Keep ' + esc(cat.name) + "</button>" +
        '<button class="btn btn-danger" id="wConfirmRemoveCat">Remove</button></div>');
      $("wKeepCat").addEventListener("click", closeSheet);
      $("wConfirmRemoveCat").addEventListener("click", function () {
        store.removeCat(cat.id);
        closeSheet();
        renderWeightAll();
        toast("Cat removed. The remaining cats send their regards.");
      });
    });
    $("wProfilePhoto").addEventListener("click", function () { $("wPhotoInput").click(); });
    $("wPhotoInput").addEventListener("change", handlePhotoUpload);
  }

  function coatPickerHTML(selected) {
    return '<div class="w-coatgrid">' + COATS.map(function (c) {
      return '<button type="button" class="w-coat' + (c.key === selected ? " sel" : "") + '" data-coat="' + c.key + '">' +
        '<span class="sw" style="background:' + c.css + '"></span>' + esc(c.label) + "</button>";
    }).join("") + "</div>";
  }

  function openCatSheet(cat) {
    var isNew = !cat;
    var coat = cat ? cat.coat : null;
    openSheet(isNew ? "Add a cat" : "Edit profile",
      isNew ? "Every journal needs a protagonist." : "Keep the records worthy of the cat.",
      '<div class="w-field"><label>Name</label>' +
      '<input type="text" id="wCatNameInput" maxlength="40" placeholder="e.g. Mochi" autocomplete="off" value="' + esc(cat ? cat.name : "") + '"></div>' +
      '<div class="w-field"><label>Coat pattern</label><div id="wCoatPicker">' + coatPickerHTML(coat) + "</div></div>" +
      '<div class="w-field"><label>Birthday</label>' +
      '<input type="date" id="wCatBday" value="' + esc(cat && cat.birthday ? cat.birthday : "") + '"></div>' +
      '<button class="btn btn-primary btn-block" id="wCatSave">' + (isNew ? "Add cat 🐱" : "Save profile") + "</button>");
    $all("#wCoatPicker .w-coat").forEach(function (b) {
      b.addEventListener("click", function () {
        $all("#wCoatPicker .w-coat").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        coat = b.getAttribute("data-coat");
      });
    });
    var save = function () {
      var name = $("wCatNameInput").value;
      var bday = $("wCatBday").value || null;
      var res = isNew
        ? store.addCat(name, { coat: coat, birthday: bday })
        : (store.updateCat(cat.id, { name: name, coat: coat, birthday: bday }) ? { ok: true } : { ok: false });
      if (!res.ok) { toast("The cat needs a name to begin."); return; }
      closeSheet();
      renderWeightAll();
      toast(isNew ? "Welcome, " + res.cat.name + ". The journal begins." : "Profile updated.");
    };
    $("wCatSave").addEventListener("click", save);
    $("wCatNameInput").addEventListener("keydown", function (ev) { if (ev.key === "Enter") save(); });
    if (isNew) $("wCatNameInput").focus();
  }

  function handlePhotoUpload(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    var cat = currentCat();
    if (!file || !cat) return;
    if (!file.type.match(/^image\//)) { toast("That is not a photo. The cat is confused."); return; }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      var max = 256;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        store.updateCat(cat.id, { photo: canvas.toDataURL("image/jpeg", 0.82) });
        renderWeightAll();
        toast("Photo updated. Photogenic as ever.");
      } catch (e) {
        toast("Photo is too large to store. Try a smaller one.");
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast("Could not read that photo.");
    };
    img.src = url;
  }

  /* ---------------- Quick log sheets ---------------- */
  function timeField() {
    return '<div class="w-field"><label>When</label>' +
      '<input type="datetime-local" id="wTime" value="' + toLocalInputValue(Date.now()) + '"></div>';
  }
  function noteField(ph) {
    return '<div class="w-field"><label>Note (optional)</label>' +
      '<input type="text" id="wNote" maxlength="120" placeholder="' + esc(ph) + '"></div>';
  }
  function instantLog(type, successMsg) {
    var res = store.log(type, {});
    if (!res.ok) { toast("Could not log. The cat is unimpressed."); return; }
    var id = res.entry.id;
    renderWeightAll();
    toast(successMsg, function () {
      store.removeEntry(id);
      renderWeightAll();
      toast("Undone. Like it never happened.");
    });
  }
  function lastFeedingPrefs() {
    var cat = currentCat();
    var past = cat ? store.entriesFor(cat.id, { type: "feeding" }) : [];
    return {
      amount: past.length && typeof past[0].amount === "number" ? past[0].amount : 50,
      foodType: past.length && past[0].foodType ? past[0].foodType : "dry"
    };
  }
  function openFeeding() {
    var prefs = lastFeedingPrefs();
    var chips = window.PFLWeightStore.FOOD_TYPES.map(function (f) {
      return '<button type="button" class="w-chip' + (f === prefs.foodType ? " sel" : "") + '" data-v="' + f + '">' + f + "</button>";
    }).join("");
    openSheet("Log a meal", "Three taps and dinner is documented.",
      '<div class="w-field"><label>Amount (grams)</label><div class="w-stepper">' +
      '<button type="button" id="wAmtDown">−</button>' +
      '<input type="number" id="wAmount" value="' + prefs.amount + '" min="0" max="2000" inputmode="numeric">' +
      '<button type="button" id="wAmtUp">＋</button></div></div>' +
      '<div class="w-field"><label>Food type</label><div class="w-chips" id="wFoodChips">' + chips + "</div></div>" +
      timeField() + noteField("e.g. inhaled it in 30 seconds") +
      '<button class="btn btn-primary btn-block" id="wSaveFeeding">Log meal 🍽️</button>');
    var amt = $("wAmount");
    $("wAmtDown").addEventListener("click", function () { amt.value = Math.max(0, (parseInt(amt.value, 10) || 0) - 10); });
    $("wAmtUp").addEventListener("click", function () { amt.value = Math.min(2000, (parseInt(amt.value, 10) || 0) + 10); });
    var foodType = prefs.foodType;
    $all("#wFoodChips .w-chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $all("#wFoodChips .w-chip").forEach(function (x) { x.classList.remove("sel"); });
        c.classList.add("sel");
        foodType = c.getAttribute("data-v");
      });
    });
    $("wSaveFeeding").addEventListener("click", function () {
      var res = store.log("feeding", {
        amount: Math.max(0, parseInt(amt.value, 10) || 0),
        foodType: foodType,
        ts: parseLocalInputValue($("wTime").value),
        note: $("wNote").value
      });
      closeSheet();
      if (res.ok) { renderWeightAll(); toast("Meal logged. The bowl is empty, the cat is smug."); }
    });
  }
  function openWeightLog() {
    var unit = store.getUnit();
    var pts = currentCat() ? store.weightPoints(currentCat().id) : [];
    var last = pts.length ? store.toDisplayWeight(pts[pts.length - 1].kg) : null;
    openSheet("Log weight", "The scale never lies. The cat disagrees.",
      '<div class="w-field"><label>Unit</label><div class="w-chips" id="wUnitChips">' +
      '<button type="button" class="w-chip' + (unit === "kg" ? " sel" : "") + '" data-v="kg">kg</button>' +
      '<button type="button" class="w-chip' + (unit === "lb" ? " sel" : "") + '" data-v="lb">lb</button></div></div>' +
      '<div class="w-field"><label>Weight' + (last != null ? " (last: " + (Math.round(last * 10) / 10) + " " + unit + ")" : "") + "</label>" +
      '<input type="number" id="wWeightVal" step="0.1" min="0" max="60" inputmode="decimal" placeholder="e.g. 4.2"></div>' +
      timeField() + noteField("e.g. after breakfast, very round") +
      '<button class="btn btn-primary btn-block" id="wSaveWeight">Log weight ⚖️</button>');
    var curUnit = unit;
    $all("#wUnitChips .w-chip").forEach(function (c) {
      c.addEventListener("click", function () {
        $all("#wUnitChips .w-chip").forEach(function (x) { x.classList.remove("sel"); });
        c.classList.add("sel");
        curUnit = c.getAttribute("data-v");
        store.setUnit(curUnit);
      });
    });
    $("wSaveWeight").addEventListener("click", function () {
      var v = parseFloat($("wWeightVal").value);
      if (!(v > 0)) { toast("Enter a weight first. Any number, the cat will dispute it."); return; }
      var kg = curUnit === "lb" ? v / 2.20462 : v;
      var res = store.log("weight", {
        value: Math.round(kg * 100) / 100,
        ts: parseLocalInputValue($("wTime").value),
        note: $("wNote").value
      });
      closeSheet();
      if (res.ok) { renderWeightAll(); toast("Weight logged. Brave of you."); }
    });
  }
  function openVet() {
    openSheet("Log vet visit", "For the record books and the insurance forms.",
      timeField() + noteField("e.g. annual checkup, vaccines") +
      '<button class="btn btn-primary btn-block" id="wSaveVet">Log vet visit 🏥</button>');
    $("wSaveVet").addEventListener("click", function () {
      var res = store.log("vet", { ts: parseLocalInputValue($("wTime").value), note: $("wNote").value });
      closeSheet();
      if (res.ok) { renderWeightAll(); toast("Vet visit logged. The cat has already forgiven you. Probably."); }
    });
  }
  function openMedLog() {
    openSheet("Log medication", "Pills, drops, or mysterious vet ointments.",
      timeField() + noteField("e.g. flea treatment, half pill") +
      '<button class="btn btn-primary btn-block" id="wSaveMed">Log medication 💊</button>');
    $("wSaveMed").addEventListener("click", function () {
      var res = store.log("med", { ts: parseLocalInputValue($("wTime").value), note: $("wNote").value });
      closeSheet();
      if (res.ok) { renderWeightAll(); toast("Medication logged. Administered with minimal drama, hopefully."); }
    });
  }

  /* ---------------- Data: export / import / wipe ---------------- */
  function exportData() {
    var blob = new Blob([store.exportData()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "paws-weight-tracker-backup.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("Backup downloaded. Guard it with your life.");
  }
  function importDataFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var res = store.importData(String(reader.result || ""));
      if (!res.ok) {
        var why = {
          not_json: "That file is not valid JSON.",
          not_an_object: "That file does not look like a tracker backup.",
          missing_arrays: "That file is missing its cats or entries.",
          bad_cat: "That file has a damaged cat record.",
          bad_entry: "That file has a damaged log entry."
        }[res.error] || "Could not import that file.";
        toast(why + " Nothing was changed.");
        return;
      }
      renderWeightAll();
      toast("Imported " + res.cats + (res.cats === 1 ? " cat" : " cats") + " and " +
        res.entries + (res.entries === 1 ? " entry" : " entries") + ". Welcome back.");
    };
    reader.onerror = function () { toast("Could not read that file."); };
    reader.readAsText(file);
  }
  function openWipeConfirm() {
    openSheet("Erase everything?",
      "This will erase every crumb of data. The cat will never forgive you. Proceed?",
      '<div class="w-btnrow"><button class="btn btn-ghost" id="wKeepData">Keep my data</button>' +
      '<button class="btn btn-danger" id="wConfirmWipe">Erase everything</button></div>');
    $("wKeepData").addEventListener("click", closeSheet);
    $("wConfirmWipe").addEventListener("click", function () {
      store.wipe();
      closeSheet();
      renderWeightAll();
      maybeWelcome();
      toast("All data erased. The cat saw nothing.");
    });
  }

  function maybeWelcome() {
    if (store.listCats().length) return;
    openSheet("Welcome to the tracker 🐱", "A tiny journal for the tiny ruler of your house.",
      '<div class="w-field"><label>What is your cat called?</label>' +
      '<input type="text" id="wWelcomeName" maxlength="40" placeholder="e.g. Mochi" autocomplete="off"></div>' +
      '<button class="btn btn-primary btn-block" id="wWelcomeSave">Start tracking</button>' +
      '<p class="w-hint" style="text-align:center;margin-top:0.8rem">Everything stays on this device. No accounts, no cloud, no nonsense.</p>');
    var save = function () {
      var res = store.addCat($("wWelcomeName").value);
      if (!res.ok) { toast("The cat needs a name to begin."); return; }
      closeSheet();
      renderWeightAll();
      toast("Welcome, " + res.cat.name + ". Tap a button to log the first entry.");
    };
    $("wWelcomeSave").addEventListener("click", save);
    $("wWelcomeName").addEventListener("keydown", function (ev) { if (ev.key === "Enter") save(); });
    $("wWelcomeName").focus();
  }

  function renderWeightAll() {
    renderHead();
    renderToday();
    renderCatsTab();
    renderMeds();
    if (!$("wsub-trends").hidden) renderTrends();
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    $("maintab-scanner").addEventListener("click", function () { switchMainTab("scanner"); });
    $("maintab-weight").addEventListener("click", function () { switchMainTab("weight"); });
    $all("[data-wtab]").forEach(function (b) {
      b.addEventListener("click", function () { switchWTab(b.getAttribute("data-wtab")); });
    });
    $("wSheetBackdrop").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeSheet(); });

    var actions = {
      wLogFeeding: openFeeding,
      wLogWater: function () { instantLog("water", "💧 Water logged. Hydration is handled."); },
      wLogWeight: openWeightLog,
      wLogLitter: function () { instantLog("litter", "💩 Litter logged. A thankless but noble duty."); },
      wLogVet: openVet,
      wLogMed: openMedLog
    };
    Object.keys(actions).forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("click", actions[id]);
    });

    $("wAddMed").addEventListener("click", function () { openMedSheet(null); });
    $("wExportBtn").addEventListener("click", exportData);
    $("wImportBtn").addEventListener("click", function () { $("wImportInput").click(); });
    $("wImportInput").addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (f) importDataFile(f);
    });
    $("wWipeBtn").addEventListener("click", openWipeConfirm);

    window.addEventListener("resize", function () {
      if (!$("pane-weight").hidden && !$("wsub-trends").hidden) renderTrends();
    });

    renderWeightAll();
    if (hadLegacy) {
      toast("Imported your old Cat Care Log data. Welcome home.");
    }
    maybeWelcome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
