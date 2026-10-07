/* Paws Friend Lab: celebration effects.
 * A tiny dependency-free particle engine. On each confident identification,
 * the breed's group effect fires once (confetti, paw rain, sparkles, hearts,
 * stars, bubbles, or snow). pointer-events: none, so it never blocks taps.
 */
(function () {
  "use strict";

  var EMOJI = {
    paws: ["\uD83D\uDC3E"],
    sparkles: ["\u2728", "\uD83C\uDF1F"],
    hearts: ["\uD83D\uDC95", "\u2764\uFE0F", "\uD83D\uDC96"],
    stars: ["\u2B50", "\uD83C\uDF1F"],
    bubbles: ["\uD83E\uDEE7"],
    snow: ["\u2744\uFE0F", "\u2745"]
  };
  var CONFETTI_COLORS = ["#ff6b4a", "#ffc53d", "#1f9e8e", "#7c6ff0", "#ff8fab", "#4cc9f0"];

  function layer() {
    var el = document.getElementById("fx-layer");
    if (!el) {
      el = document.createElement("div");
      el.id = "fx-layer";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    return el;
  }

  function rnd(min, max) { return min + Math.random() * (max - min); }

  function burst(effect) {
    var host = layer();
    var count = effect === "confetti" ? 46 : 26;
    for (var i = 0; i < count; i++) {
      var s = document.createElement("span");
      var rising = effect === "hearts" || effect === "bubbles";
      s.className = "fx-p" + (rising ? " fx-rise" : " fx-fall");
      if (effect === "confetti") {
        s.className += " fx-chip";
        s.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      } else {
        var set = EMOJI[effect] || EMOJI.paws;
        s.textContent = set[i % set.length];
        s.style.fontSize = rnd(1.1, 2.3).toFixed(2) + "rem";
      }
      s.style.left = rnd(0, 96).toFixed(1) + "vw";
      s.style.animationDuration = rnd(2.2, 4).toFixed(2) + "s";
      s.style.animationDelay = rnd(0, 0.6).toFixed(2) + "s";
      host.appendChild(s);
      (function (el) {
        setTimeout(function () { el.remove(); }, 4800);
      })(s);
    }
  }

  function effectFor(breed, species) {
    var map = window.PFL_FX || {};
    if (breed && map[breed]) return map[breed];
    if (species === "cat") return "paws";
    if (species === "dog") return "confetti";
    return "stars";
  }

  function celebrate(breed, species) {
    try {
      burst(effectFor(breed, species));
    } catch (e) {
      /* Celebration is garnish. Never let it break the meal. */
    }
  }

  window.PFLFX = { celebrate: celebrate, burst: burst };
})();
