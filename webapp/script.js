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
  var beanReady = false;
  beanImg.onload = function () { beanReady = true; };
  beanImg.src = "assets/prizes/bean.webp";

  var PRIZE_META = {
    syrup: { icon: "syrup", name: "Сироп", tier: "common", description: "Вільний вибір" },
    size_up: { icon: "size_up", name: "Апгрейд розміру", tier: "common", description: "Більший напій" },
    discount_10: { icon: "discount_10", name: "-10% на замовлення", tier: "common", description: "На наступну каву" },
    extra_shot: { icon: "extra_shot", name: "Extra shot", tier: "common", description: "Більше енергії" },
    discount_50_second: { icon: "discount_50_second", name: "-50% на другий напій", tier: "rare", description: "Для компанії" },
    free_coffee: { icon: "free_coffee", name: "Безкоштовна кава", tier: "epic", description: "Твій наступний фаворит" },
    free_dessert: { icon: "free_dessert", name: "Безкоштовний десерт", tier: "legendary", description: "Солодкий момент" },
  };
  var ALL_KEYS = Object.keys(PRIZE_META);
  var startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
  var initData = (tg && tg.initData) || "";

  var cardsEl = document.getElementById("cards");
  var screenPick = document.getElementById("screenPick");
  var screenSuspense = document.getElementById("screenSuspense");
  var screenReveal = document.getElementById("screenReveal");
  var screenCode = document.getElementById("screenCode");
  var screenGallery = document.getElementById("screenGallery");
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
    if (mystery) return '<span class="face front mystery" aria-hidden="true"></span>';
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
        setState("WINNER_CLOSED");
        switchView(screenPick, screenSuspense);
      });
    }, 170);
  }

  function burstParticles(tier) {
    if (!beanReady && (!beanImg.complete || !beanImg.naturalWidth)) {
      beanImg.addEventListener("load", function retryBurst() {
        burstParticles(tier);
      }, { once: true });
      return;
    }
    beanReady = true;
    var count = tier === "legendary" ? 52 : 44;
    var particles = [];
    var centerX = canvas.width / 2;
    var centerY = canvas.height * 0.38;
    for (var i = 0; i < count; i++) {
      var isRain = i >= 18;
      var layer = i < 12 ? "back" : i < 35 ? "mid" : "front";
      var angle = isRain ? Math.PI * (0.15 + Math.random() * 0.7) : Math.random() * Math.PI * 2;
      var speed = isRain ? 1.1 + Math.random() * 2.8 : 4.5 + Math.random() * 9;
      var scale = layer === "back" ? .8 + Math.random() * .25 : layer === "mid" ? 1 + Math.random() * .35 : 1.35 + Math.random() * .65;
      particles.push({
        x: isRain ? Math.random() * canvas.width : centerX + (Math.random() - 0.5) * 28,
        y: isRain ? -20 - Math.random() * 180 : centerY + (Math.random() - 0.5) * 28,
        vx: Math.cos(angle) * speed,
        vy: isRain ? 1.5 + Math.random() * 2.5 : Math.sin(angle) * speed - 2,
        gravity: isRain ? .035 + Math.random() * .045 : .1 + Math.random() * .12,
        size: (layer === "front" ? 25 : layer === "mid" ? 18 : 13) * scale,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * (isRain ? .16 : .32),
        delay: isRain ? 360 + Math.random() * 720 : Math.random() * 180,
        age: 0,
        layer: layer,
        opacity: layer === "back" ? 0.58 : layer === "mid" ? 0.95 : 1,
        isRain: isRain,
      });
    }

    var start = performance.now();
    var last = start;
    function tick(now) {
      var elapsed = now - start;
      var delta = Math.min(now - last, 32) / 16.67;
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var active = false;
      particles.forEach(function (particle) {
        if (elapsed < particle.delay) return;
        particle.age += delta * 16.67;
        if (particle.age > 2700) return;
        active = true;
        var burst = Math.min(particle.age / (particle.isRain ? 1100 : 700), 1);
        particle.x += particle.vx * delta * (burst < 1 ? 1 : .55);
        particle.y += particle.vy * delta;
        particle.vy += particle.gravity * delta;
        particle.rotation += particle.rotationSpeed * delta;
        ctx.save();
        ctx.globalAlpha = particle.opacity * Math.max(0, 1 - Math.max(0, particle.age - 2050) / 650);
        ctx.filter = particle.layer === "back" ? "blur(1.6px)" : particle.layer === "front" ? "blur(.25px)" : "none";
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

  function renderCodeScreen(result) {
    var meta = metaFor(result.prize.key);
    var tier = result.prize.tier || meta.tier;
    document.getElementById("codeTierBadge").textContent = rarityLabel(tier);
    document.getElementById("codeTierBadge").className = "tier-badge " + tier;
    document.getElementById("codePrizeIcon").src = "assets/prizes/" + meta.icon + ".webp";
    document.getElementById("codePrizeLabel").textContent = meta.name;
    document.getElementById("codePrizeDescription").textContent = meta.description;
    document.getElementById("ticketCode").textContent = result.ticket_code || "------";
    var validUntil = new Date(result.valid_until);
    var expiry = validUntil.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }) +
      ", " + validUntil.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    document.getElementById("codeValidity").textContent = result.prize.requires_purchase
      ? "Приз активується завтра. Діє до " + expiry + "."
      : "Приз діє до " + expiry + ".";
  }

  function showCodeScreen() {
    if (!pendingResult) return;
    renderCodeScreen(pendingResult);
    setState("PRIZE_CODE");
    switchView(screenReveal, screenCode);
  }

  function renderGallery() {
    var gallery = document.getElementById("galleryCards");
    var galleryKeys = ["free_coffee", "syrup", "free_dessert", "size_up", "discount_10", "extra_shot", "discount_50_second"];
    gallery.innerHTML = "";

    galleryKeys.forEach(function (key, index) {
      var meta = metaFor(key);
      var card = document.createElement("div");
      card.className = "gallery-card " + meta.tier;
      card.style.setProperty("--fan-index", index);
      card.style.setProperty("--card-delay", (index * 0.18) + "s");
      card.innerHTML = '<div class="gallery-card-inner">' +
        '<span class="gallery-rarity">' + rarityLabel(meta.tier) + '</span>' +
        '<img src="assets/prizes/' + meta.icon + '.webp" alt="" />' +
        '<span class="gallery-card-name">' + meta.name + '</span>' +
        '<span class="gallery-card-description">' + meta.description + '</span></div>';
      gallery.appendChild(card);
    });
  }

  function rarityLabel(tier) {
    return {
      common: "ЗВИЧАЙНИЙ",
      rare: "РІДКІСНИЙ",
      epic: "ЕПІЧНИЙ",
      legendary: "ЛЕГЕНДАРНИЙ",
    }[tier] || tier;
  }

  openBtn.addEventListener("click", function () {
    if (state !== "WINNER_CLOSED" || !pendingResult) return;
    setState("OPENING_WINNER");
    renderPrize(pendingResult);
  });

  document.getElementById("nextBtn").addEventListener("click", function () {
    if (state !== "PRIZE_IDLE" && state !== "CELEBRATING") return;
    showCodeScreen();
  });

  document.getElementById("copyCodeBtn").addEventListener("click", function () {
    if (!pendingResult || !pendingResult.ticket_code) return;
    var code = pendingResult.ticket_code;
    var feedback = document.getElementById("copyFeedback");
    var finish = function () {
      feedback.textContent = "Скопійовано ✓";
      setTimeout(function () { feedback.textContent = ""; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(finish).catch(function () { finish(); });
    } else {
      var input = document.createElement("textarea");
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      finish();
    }
  });

  document.getElementById("galleryBtn").addEventListener("click", function () {
    if (!pendingResult) return;
    renderGallery();
    setState("PRIZE_GALLERY");
    switchView(screenCode, screenGallery);
  });

  document.getElementById("backToCodeBtn").addEventListener("click", function () {
    if (!pendingResult) return;
    renderCodeScreen(pendingResult);
    setState("PRIZE_CODE");
    switchView(screenGallery, screenCode);
  });

  function closeMiniApp() {
    if (tg && typeof tg.close === "function") tg.close();
  }

  document.getElementById("finishBtn").addEventListener("click", closeMiniApp);
  document.getElementById("closeGalleryBtn").addEventListener("click", closeMiniApp);

  renderCards();
  setState("PICK_IDLE");
})();
