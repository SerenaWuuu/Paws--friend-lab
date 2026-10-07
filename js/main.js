/* Paws Friend Lab: landing page interactions. */
(function () {
  "use strict";

  function init() {
    /* Footer year */
    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    /* Header shadow on scroll */
    var header = document.getElementById("site-header");
    function onScroll() {
      if (header) header.classList.toggle("scrolled", window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* Smooth anchor scrolling (respect reduced motion) */
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var target = document.querySelector(a.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    });

    /* Reveal-on-scroll */
    if ("IntersectionObserver" in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("revealed");
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
    } else {
      document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("revealed"); });
    }

    /* Konami-style easter egg: click the hero paw 5 times */
    var paw = document.getElementById("hero-paw");
    var clicks = 0;
    if (paw) {
      paw.addEventListener("click", function () {
        clicks++;
        paw.classList.remove("paw-boop");
        void paw.offsetWidth;
        paw.classList.add("paw-boop");
        if (clicks === 5) {
          clicks = 0;
          var msg = document.getElementById("paw-secret");
          if (msg) {
            msg.hidden = false;
            setTimeout(function () { msg.hidden = true; }, 4000);
          }
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
