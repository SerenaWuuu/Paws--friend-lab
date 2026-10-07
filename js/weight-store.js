/* Paws Friend Lab: Weight Tracker data layer.
 * Local-first. All state lives in localStorage under one key.
 * Adapted from the Cat Care Log store, plus coat patterns on profiles and
 * medication schedules with due/overdue computation. On first run it offers
 * a one-time import from the retired standalone Cat Care Log app.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'paws-friend-lab/weight/v1';
  var LEGACY_KEY = 'cat-care-log/v1';
  var ENTRY_TYPES = ['feeding', 'water', 'weight', 'litter', 'vet', 'med'];
  var FOOD_TYPES = ['dry', 'wet', 'treat', 'raw', 'other'];
  var KG_TO_LB = 2.20462;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function dayKey(ts) {
    var d = new Date(ts);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function blankState() {
    return { version: 2, unit: 'kg', cats: [], activeCatId: null, entries: [], meds: [] };
  }

  function isValidEntryType(t) { return ENTRY_TYPES.indexOf(t) !== -1; }

  function cleanMed(m) {
    if (!m || typeof m.id !== 'string' || typeof m.catId !== 'string') return null;
    var name = typeof m.name === 'string' ? m.name.trim().slice(0, 60) : '';
    if (!name) return null;
    var times = Array.isArray(m.times) ? m.times.filter(function (t) { return typeof t === 'string' && TIME_RE.test(t); }) : [];
    if (!times.length) return null;
    return {
      id: m.id,
      catId: m.catId,
      name: name,
      dosage: typeof m.dosage === 'string' ? m.dosage.trim().slice(0, 60) : '',
      times: times.slice(0, 8),
      lastTakenTs: typeof m.lastTakenTs === 'number' ? m.lastTakenTs : null,
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now()
    };
  }

  function validateState(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, error: 'not_an_object' };
    if (!Array.isArray(s.cats) || !Array.isArray(s.entries)) return { ok: false, error: 'missing_arrays' };
    var cats = [];
    for (var i = 0; i < s.cats.length; i++) {
      var c = s.cats[i];
      if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.name.trim()) {
        return { ok: false, error: 'bad_cat' };
      }
      cats.push({
        id: c.id,
        name: c.name.trim().slice(0, 40),
        photo: typeof c.photo === 'string' ? c.photo : null,
        birthday: typeof c.birthday === 'string' ? c.birthday : null,
        coat: typeof c.coat === 'string' ? c.coat : null,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now()
      });
    }
    var entries = [];
    for (var j = 0; j < s.entries.length; j++) {
      var e = s.entries[j];
      if (!e || typeof e.id !== 'string' || typeof e.catId !== 'string' ||
          !isValidEntryType(e.type) || typeof e.ts !== 'number') {
        return { ok: false, error: 'bad_entry' };
      }
      entries.push({
        id: e.id,
        catId: e.catId,
        type: e.type,
        ts: e.ts,
        amount: typeof e.amount === 'number' ? e.amount : null,
        foodType: typeof e.foodType === 'string' ? e.foodType : null,
        value: typeof e.value === 'number' ? e.value : null,
        note: typeof e.note === 'string' ? e.note.slice(0, 280) : null
      });
    }
    var meds = [];
    if (Array.isArray(s.meds)) {
      for (var k = 0; k < s.meds.length; k++) {
        var cm = cleanMed(s.meds[k]);
        if (cm) meds.push(cm);
      }
    }
    var ids = {};
    cats.forEach(function (c) { ids[c.id] = true; });
    meds = meds.filter(function (m) { return ids[m.catId]; });
    entries = entries.filter(function (e) { return ids[e.catId]; });
    var unit = s.unit === 'lb' ? 'lb' : 'kg';
    var activeCatId = typeof s.activeCatId === 'string' ? s.activeCatId : null;
    if (activeCatId && !ids[activeCatId]) activeCatId = cats.length ? cats[0].id : null;
    entries.sort(function (a, b) { return b.ts - a.ts; });
    return { ok: true, state: { version: 2, unit: unit, cats: cats, activeCatId: activeCatId, entries: entries, meds: meds } };
  }

  function createStore(storage) {
    var state = blankState();

    function save() {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        throw new Error('storage_full');
      }
    }

    function load() {
      var raw = null;
      try { raw = storage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
      if (!raw) {
        /* One-time migration from the retired standalone Cat Care Log. */
        try {
          var legacy = storage.getItem(LEGACY_KEY);
          if (legacy) {
            var checked = validateState(JSON.parse(legacy));
            if (checked.ok && (checked.state.cats.length || checked.state.entries.length)) {
              state = checked.state;
              save();
              return 'migrated';
            }
          }
        } catch (e) { /* fall through to blank */ }
        state = blankState();
        return 'fresh';
      }
      try {
        var checked = validateState(JSON.parse(raw));
        state = checked.ok ? checked.state : blankState();
      } catch (e) {
        state = blankState();
      }
      return 'loaded';
    }

    function getCat(id) {
      for (var i = 0; i < state.cats.length; i++) {
        if (state.cats[i].id === id) return state.cats[i];
      }
      return null;
    }

    function ensureActive() {
      if (!getCat(state.activeCatId) && state.cats.length) {
        state.activeCatId = state.cats[0].id;
      }
    }

    function getMed(id) {
      for (var i = 0; i < state.meds.length; i++) {
        if (state.meds[i].id === id) return state.meds[i];
      }
      return null;
    }

    var api = {
      ENTRY_TYPES: ENTRY_TYPES,
      FOOD_TYPES: FOOD_TYPES,
      load: load,
      save: save,

      listCats: function () { return state.cats.slice(); },
      getCat: getCat,
      getActiveCat: function () { ensureActive(); return getCat(state.activeCatId); },
      getActiveCatId: function () { ensureActive(); return state.activeCatId; },

      addCat: function (name, opts) {
        var clean = String(name || '').trim().slice(0, 40);
        if (!clean) return { ok: false, error: 'name_required' };
        opts = opts || {};
        var cat = {
          id: uid(), name: clean, photo: null,
          birthday: opts.birthday || null, coat: opts.coat || null,
          createdAt: Date.now()
        };
        state.cats.push(cat);
        state.activeCatId = cat.id;
        save();
        return { ok: true, cat: cat };
      },

      setActiveCat: function (id) {
        if (!getCat(id)) return false;
        state.activeCatId = id;
        save();
        return true;
      },

      updateCat: function (id, patch) {
        var cat = getCat(id);
        if (!cat) return false;
        if (patch.name !== undefined) {
          var clean = String(patch.name).trim().slice(0, 40);
          if (!clean) return false;
          cat.name = clean;
        }
        if (patch.photo !== undefined) cat.photo = patch.photo || null;
        if (patch.birthday !== undefined) cat.birthday = patch.birthday || null;
        if (patch.coat !== undefined) cat.coat = patch.coat || null;
        save();
        return true;
      },

      removeCat: function (id) {
        var before = state.cats.length;
        state.cats = state.cats.filter(function (c) { return c.id !== id; });
        state.entries = state.entries.filter(function (e) { return e.catId !== id; });
        state.meds = state.meds.filter(function (m) { return m.catId !== id; });
        if (state.activeCatId === id) {
          state.activeCatId = state.cats.length ? state.cats[0].id : null;
        }
        save();
        return state.cats.length < before;
      },

      log: function (type, fields) {
        if (!isValidEntryType(type)) return { ok: false, error: 'bad_type' };
        ensureActive();
        if (!state.activeCatId) return { ok: false, error: 'no_cat' };
        fields = fields || {};
        var entry = {
          id: uid(),
          catId: state.activeCatId,
          type: type,
          ts: typeof fields.ts === 'number' ? fields.ts : Date.now(),
          amount: typeof fields.amount === 'number' ? fields.amount : null,
          foodType: typeof fields.foodType === 'string' ? fields.foodType : null,
          value: typeof fields.value === 'number' ? fields.value : null,
          note: typeof fields.note === 'string' && fields.note.trim() ? fields.note.trim().slice(0, 280) : null
        };
        state.entries.unshift(entry);
        save();
        return { ok: true, entry: entry };
      },

      removeEntry: function (id) {
        var before = state.entries.length;
        state.entries = state.entries.filter(function (e) { return e.id !== id; });
        if (state.entries.length < before) { save(); return true; }
        return false;
      },

      entriesFor: function (catId, opts) {
        opts = opts || {};
        return state.entries.filter(function (e) {
          if (e.catId !== catId) return false;
          if (opts.type && e.type !== opts.type) return false;
          if (opts.from && e.ts < opts.from) return false;
          if (opts.to && e.ts > opts.to) return false;
          return true;
        });
      },

      entriesOnDay: function (catId, ts) {
        var start = startOfDay(ts);
        return api.entriesFor(catId, { from: start, to: start + 86400000 - 1 });
      },

      streakDays: function (catId, nowTs) {
        var now = typeof nowTs === 'number' ? nowTs : Date.now();
        var daysWithLogs = {};
        state.entries.forEach(function (e) {
          if (e.catId === catId) daysWithLogs[dayKey(e.ts)] = true;
        });
        var cursor = startOfDay(now);
        if (!daysWithLogs[dayKey(cursor)]) cursor -= 86400000;
        var streak = 0;
        while (daysWithLogs[dayKey(cursor)]) { streak++; cursor -= 86400000; }
        return streak;
      },

      feedingsByDay: function (catId, days, nowTs) {
        var now = typeof nowTs === 'number' ? nowTs : Date.now();
        var out = [];
        for (var i = days - 1; i >= 0; i--) {
          var ts = startOfDay(now) - i * 86400000;
          var count = 0;
          state.entries.forEach(function (e) {
            if (e.catId === catId && e.type === 'feeding' && e.ts >= ts && e.ts < ts + 86400000) count++;
          });
          out.push({ key: dayKey(ts), ts: ts, count: count });
        }
        return out;
      },

      weightPoints: function (catId) {
        return state.entries
          .filter(function (e) { return e.catId === catId && e.type === 'weight' && typeof e.value === 'number'; })
          .map(function (e) { return { ts: e.ts, kg: e.value }; })
          .sort(function (a, b) { return a.ts - b.ts; });
      },

      getUnit: function () { return state.unit; },
      setUnit: function (unit) {
        if (unit !== 'kg' && unit !== 'lb') return false;
        state.unit = unit;
        save();
        return true;
      },
      toDisplayWeight: function (kg) {
        if (typeof kg !== 'number') return null;
        return state.unit === 'lb' ? kg * KG_TO_LB : kg;
      },

      /* ---------- Medication schedules ---------- */

      medsFor: function (catId) {
        return state.meds.filter(function (m) { return m.catId === catId; });
      },

      addMed: function (catId, fields) {
        if (!getCat(catId)) return { ok: false, error: 'no_cat' };
        var m = cleanMed({
          id: uid(), catId: catId,
          name: fields.name, dosage: fields.dosage, times: fields.times,
          lastTakenTs: null, createdAt: Date.now()
        });
        if (!m) return { ok: false, error: 'bad_med' };
        state.meds.push(m);
        save();
        return { ok: true, med: m };
      },

      updateMed: function (id, patch) {
        var m = getMed(id);
        if (!m) return false;
        var merged = cleanMed({
          id: m.id, catId: m.catId,
          name: patch.name !== undefined ? patch.name : m.name,
          dosage: patch.dosage !== undefined ? patch.dosage : m.dosage,
          times: patch.times !== undefined ? patch.times : m.times,
          lastTakenTs: m.lastTakenTs, createdAt: m.createdAt
        });
        if (!merged) return false;
        m.name = merged.name; m.dosage = merged.dosage; m.times = merged.times;
        save();
        return true;
      },

      removeMed: function (id) {
        var before = state.meds.length;
        state.meds = state.meds.filter(function (m) { return m.id !== id; });
        if (state.meds.length < before) { save(); return true; }
        return false;
      },

      markMedTaken: function (id) {
        var m = getMed(id);
        if (!m) return false;
        m.lastTakenTs = Date.now();
        api.log('med', { note: m.name + (m.dosage ? ' (' + m.dosage + ')' : '') });
        save();
        return true;
      },

      /* Due state for one schedule, computed live. A dose counts as taken
       * if lastTakenTs falls within 30 min before its time and now. */
      medDue: function (med, nowTs) {
        var now = typeof nowTs === 'number' ? nowTs : Date.now();
        var sod = startOfDay(now);
        var best = null;
        med.times.forEach(function (t) {
          var parts = t.split(':');
          var dueTs = sod + (+parts[0]) * 3600000 + (+parts[1]) * 60000;
          var taken = med.lastTakenTs && med.lastTakenTs >= dueTs - 30 * 60000 && med.lastTakenTs <= now;
          if (taken) return;
          var st, rank;
          if (now >= dueTs) {
            if (now - dueTs <= 60 * 60000) { st = 'due'; rank = 1; }
            else { st = 'overdue'; rank = 0; }
          } else { st = 'upcoming'; rank = 2; }
          if (!best || rank < best.rank || (rank === best.rank && dueTs < best.ts)) {
            best = { state: st, rank: rank, ts: dueTs, time: t };
          }
        });
        if (!best) return { state: 'done', label: 'All doses taken today' };
        var d = new Date(best.ts);
        var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
        var h12 = h % 12 || 12;
        var label = h12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
        if (best.state === 'overdue') return { state: 'overdue', label: 'Overdue since ' + label, ts: best.ts };
        if (best.state === 'due') return { state: 'due', label: 'Due now (' + label + ')', ts: best.ts };
        return { state: 'upcoming', label: 'Next at ' + label, ts: best.ts };
      },

      exportData: function () { return JSON.stringify(state, null, 2); },

      importData: function (jsonStr) {
        var parsed;
        try { parsed = JSON.parse(jsonStr); } catch (e) { return { ok: false, error: 'not_json' }; }
        var checked = validateState(parsed);
        if (!checked.ok) return { ok: false, error: checked.error };
        state = checked.state;
        save();
        return { ok: true, cats: state.cats.length, entries: state.entries.length };
      },

      wipe: function () { state = blankState(); save(); },
      entryCount: function () { return state.entries.length; }
    };

    load();
    return api;
  }

  root.PFLWeightStore = {
    createStore: createStore,
    STORAGE_KEY: STORAGE_KEY,
    ENTRY_TYPES: ENTRY_TYPES,
    FOOD_TYPES: FOOD_TYPES
  };
})(typeof window !== 'undefined' ? window : this);
