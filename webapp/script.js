(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  var API_URL = "/api/play";
  var CARD_COUNT = 5;
  var state = "PICK_IDLE";
  var picked = false;
  var pendingResult = null;
  var beanImg = new Image();
  beanImg.src = "assets/prizes/bean.webp";

  var PRIZE_META = {
    syrup: { icon: "syrup", name: "Сироп", tier: "common" },
    size_up: { icon: "size_up", name: "Апгрейд розміру", tier: "common" },
    discount_10: { icon: "discount_10", name: "-10% на замовлення", tier: "common" },
    extra_shot: { icon: "extra_shot", name: "Extra shot", tier: "common" },
    discount_50_second: { icon: "discount_50_second", name: "-50% на другий напій", tier: "rare" },
    free_coffee: { icon: "free_coffee", name: "Безкоштовна кава", tier: "epic" },
    free_dessert: { icon: "free_dessert", name: "Безкоштовний десерт", tier: "legendary" },
  };
  var ALL_KEYS = Object.keys(PRIZE_META);
  var startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
  var initData = (tg && tg.initData) || "";

  var cardsEl = document.getElementById("cards");
  var screenPick = document.getElementById("screenPick");
  var screenSuspense = document.getElementById("screenSuspense");
  var screenReveal = document.getElementById("screenReveal");
  var screenGallery = document.getElementById("screenGallery");
  var screenThanks = document.getElementById("screenThanks");
  var openBtn = document.getElementById("openBtn");
  var canvas = document.getElementById("fx");
  var ctx = canvas.getContext("2d");
  var flashEl = document.getElementById("flash");

  function setState(next) {
    state = next;
    document.body.dataset.state = next;
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  function switchView(from, to) {
    from.classList.add("leave");
    setTimeout(function () {
      from.hidden = true;
      from.classList.remove("leave");
      to.hidden = false;
      to.classList.add("enter");
      setTimeout(function () { to.classList.remove("enter"); }, 600);
    }, 280);
  }

  function metaFor(key) {
    return PRIZE_META[key] || PRIZE_META.syrup;
  }

  function shuffledKeys(excludedKey) {
    var keys = ALL_KEYS.filter(function (key) { return key !== excludedKey; });
    for (var i = keys.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = keys[i];
      keys[i] = keys[j];
      keys[j] = temp;
    }
    return keys;
  }

  function faceMarkup(meta, mystery) {
    if (mystery) return '<span class="face front mystery">✦</span>';
    return '<span class="face front prize-face ' + meta.tier + '">' +
      '<span class="tier-tag">' + meta.tier + '</span>' +
      '<img src="assets/prizes/' + meta.icon + '.webp" alt="" />' +
      '<span class="card-name">' + meta.name + '</span>' +
      '</span>';
  }

  function renderCards() {
    cardsEl.innerHTML = "";
    for (var i = 0; i < CARD_COUNT; i++) {
      var slot = document.createElement("div");
      slot.className = "card-slot";
      slot.dataset.i = String(i);
      slot.innerHTML = '<button type="button" class="card-btn" aria-label="Обрати картку ' + (i + 1) + '">' +
        '<span class="card-inner">' +
        '<span class="face back"><img src="assets/prizes/card_back.webp" alt="" /></span>' +
        faceMarkup(null, true) +
        '</span></button>';
      slot.querySelector(".card-btn").addEventListener("click", function (event) {
        onCardClick(event.currentTarget.closest(".card-slot"));
      });
      cardsEl.appendChild(slot);
    }
  }

  function requestPrize() {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData, code: startParam }),
    }).then(function (res) {
      return res.json();
    }).catch(function () {
      return { ok: false, reason: "network" };
    });
  }

  function revealAll(chosenSlot, result) {
    var winner = metaFor(result.prize.key);
    var alternatives = shuffledKeys(result.prize.key);
    var chosenIndex = Number(chosenSlot.dataset.i);
    var altIndex = 0;
    var slots = Array.prototype.slice.call(cardsEl.querySelectorAll(".card-slot"));

    slots.forEach(function (slot, index) {
      var meta = slot === chosenSlot ? winner : metaFor(alternatives[altIndex++ % alternatives.length]);
      var delay = slot === chosenSlot ? 0 : 70 + Math.abs(index - chosenIndex) * 40;
      slot.classList.add(slot === chosenSlot ? "chosen" : "other", meta.tier);
      slot.dataset.tier = meta.tier;
      slot.querySelector(".face.front").outerHTML = faceMarkup(meta, false);
      slot.querySelector(".card-inner").style.transitionDelay = delay + "ms";
      setTimeout(function () { slot.classList.add("flipped"); }, delay);
    });

    setTimeout(function () {
      setState("ALL_REVEALED");
      focusWinner(chosenSlot);
    }, 1900);
  }

  function focusWinner(chosenSlot) {
    setState("FOCUSING_WINNER");
    Array.prototype.slice.call(cardsEl.querySelectorAll(".card-slot")).forEach(function (slot) {
      if (slot !== chosenSlot) slot.classList.add("retreating");
    });
    chosenSlot.classList.add("winner-focus");

    setTimeout(function () {
      setState("WINNER_CLOSED");
      chosenSlot.classList.remove("flipped");
      switchView(screenPick, screenSuspense);
      setTimeout(function () { openBtn.classList.add("visible"); }, 350);
    }, 950);
  }

  var FAIL_MESSAGES = {
    code_used: "Цей код вже використаний. Попросіть новий код у бариста.",
    no_code: "Потрібен персональний код від бариста.",
    bad_auth: "Не вдалося підтвердити запит. Відкрийте гру через QR.",
    network: "Немає з'єднання. Перевірте інтернет і спробуйте ще раз.",
  };

  function onCardClick(chosenSlot) {
    if (picked || state !== "PICK_IDLE") return;
    picked = true;
    setState("PICK_SELECTED");
    chosenSlot.classList.add("tap-pulse");
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");

    var resultPromise = requestPrize();
    setTimeout(function () {
      resultPromise.then(function (result) {
        if (!result.ok) {
          alert(FAIL_MESSAGES[result.reason] || "Щось пішло не так. Спробуйте ще раз.");
          location.reload();
          return;
        }
        pendingResult = result;
        setState("REVEALING_ALL");
        revealAll(chosenSlot, result);
      });
    }, 170);
  }

  function burstParticles(tier) {
    var count = tier === "legendary" ? 30 : 26;
    var particles = [];
    var centerX = canvas.width / 2;
    var centerY = canvas.height * 0.38;
    for (var i = 0; i < count; i++) {
      var layer = i < count * 0.3 ? "back" : i < count * 0.75 ? "mid" : "front";
      var angle = Math.random() * Math.PI * 2;
      var speed = 2.8 + Math.random() * 7;
      particles.push({
        x: centerX + (Math.random() - 0.5) * 18,
        y: centerY + (Math.random() - 0.5) * 18,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: (layer === "front" ? 17 : layer === "mid" ? 12 : 8) + Math.random() * 7,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.24,
        delay: Math.random() * 180,
        age: 0,
        layer: layer,
        opacity: layer === "back" ? 0.4 : layer === "mid" ? 0.8 : 1,
      });
    }

    var start = performance.now();
    function tick(now) {
      var elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var active = false;
      particles.forEach(function (particle) {
        if (elapsed < particle.delay) return;
        particle.age += 16;
        if (particle.age > 1850) return;
        active = true;
        var burst = Math.min(particle.age / 700, 1);
        particle.x += particle.vx * (burst < 1 ? 1 : 0.55);
        particle.y += particle.vy * (burst < 1 ? 1 : 0.55) + (burst >= 1 ? 0.3 : 0);
        particle.vy += burst >= 1 ? 0.12 : 0;
        particle.rotation += particle.rotationSpeed;
        ctx.save();
        ctx.globalAlpha = particle.opacity * Math.max(0, 1 - Math.max(0, particle.age - 1350) / 500);
        ctx.filter = particle.layer === "back" ? "blur(1.5px)" : "none";
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        var height = particle.size * (beanImg.naturalHeight / Math.max(beanImg.naturalWidth, 1));
        if (beanImg.complete && beanImg.naturalWidth) {
          ctx.drawImage(beanImg, -particle.size / 2, -height / 2, particle.size, height);
        }
        ctx.restore();
      });
      if (active) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(tick);
  }

  function renderPrize(result) {
    var meta = metaFor(result.prize.key);
    var tier = result.prize.tier || meta.tier;
    document.getElementById("tierBadge").textContent = tier.toUpperCase();
    document.getElementById("tierBadge").className = "tier-badge " + tier;
    document.getElementById("revealIconWrap").querySelector(".rays").className = "rays " + tier;
    document.getElementById("revealIcon").src = "assets/prizes/" + meta.icon + ".webp";
    document.getElementById("revealLabel").textContent = meta.name;
    document.getElementById("validityBox").textContent = result.prize.requires_purchase
      ? "🗓 Приз активується завтра і діє кілька днів. Покажіть код на касі при наступному замовленні."
      : "🗓 Приз діє кілька днів.";
    switchView(screenSuspense, screenReveal);
    setTimeout(function () {
      setState("CELEBRATING");
      flashEl.classList.remove("fire");
      void flashEl.offsetWidth;
      flashEl.classList.add("fire");
      document.getElementById("revealIconWrap").classList.add("celebrate");
      burstParticles(tier);
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      setTimeout(function () { setState("PRIZE_IDLE"); }, 1500);
    }, 160);
  }

  function renderGallery() {
    var gallery = document.getElementById("galleryCards");
    gallery.innerHTML = "";
    ALL_KEYS.slice(0, CARD_COUNT).forEach(function (key, index) {
      var meta = metaFor(key);
      var card = document.createElement("div");
      card.className = "gallery-card " + meta.tier + (index === 2 ? " center" : "");
      card.style.setProperty("--fan-index", index);
      card.innerHTML = '<div class="gallery-card-inner">' +
        '<span class="gallery-rarity">' + meta.tier + '</span>' +
        '<img src="assets/prizes/' + meta.icon + '.webp" alt="" />' +
        '<span>' + meta.name + '</span></div>';
      gallery.appendChild(card);
    });
  }

  openBtn.addEventListener("click", function () {
    if (state !== "WINNER_CLOSED" || !pendingResult) return;
    setState("OPENING_WINNER");
    openBtn.classList.remove("visible");
    renderPrize(pendingResult);
  });

  document.getElementById("nextBtn").addEventListener("click", function () {
    if (state !== "PRIZE_IDLE" && state !== "CELEBRATING") return;
    setState("PRIZE_TRANSITION");
    switchView(screenReveal, screenThanks);
    setTimeout(function () {
      renderGallery();
      setState("PRIZE_GALLERY");
      switchView(screenThanks, screenGallery);
    }, 1350);
  });

  document.getElementById("closeBtn").addEventListener("click", function () {
    if (tg && tg.close) tg.close();
  });

  renderCards();
  setState("PICK_IDLE");
})();
