(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  var API_BASE = ""; // set to your Render URL if hosting webapp separately
  var API_URL = API_BASE + "/api/play";
  var CARD_COUNT = 5;

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
  var screenReveal = document.getElementById("screenReveal");
  var openBtn = document.getElementById("openBtn");
  var flashEl = document.getElementById("flash");
  var canvas = document.getElementById("fx");
  var ctx = canvas.getContext("2d");

  var picked = false;
  var pendingResult = null;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  function randomOtherKey() {
    return ALL_KEYS[Math.floor(Math.random() * ALL_KEYS.length)];
  }

  // ---------------- Screen 1: fanned cards ----------------

  function renderCards() {
    cardsEl.innerHTML = "";
    for (var i = 0; i < CARD_COUNT; i++) {
      var slot = document.createElement("div");
      slot.className = "card-slot";
      slot.dataset.i = String(i);
      slot.innerHTML =
        '<button type="button" class="card-btn">' +
        '<span class="card-inner">' +
        '<span class="face back"><img src="assets/prizes/card_back.webp" alt="" /></span>' +
        '<span class="face front mystery">🎁</span>' +
        "</span></button>";
      slot.querySelector(".card-btn").addEventListener("click", function (evt) {
        onCardClick(evt.currentTarget.closest(".card-slot"));
      });
      cardsEl.appendChild(slot);
    }
  }

  function switchView(from, to) {
    from.classList.add("leave");
    setTimeout(function () {
      from.hidden = true;
      from.classList.remove("leave");
      to.hidden = false;
      to.classList.add("enter");
      setTimeout(function () { to.classList.remove("enter"); }, 500);
    }, 260);
  }

  async function onCardClick(chosenSlot) {
    if (picked) return;
    picked = true;

    // fire the request immediately so it's likely resolved by the time
    // the guest taps "Відкрити" — no dead waiting after that tap.
    var resultPromise = fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData, code: startParam }),
    })
      .then(function (res) { return res.json(); })
      .catch(function () { return { ok: false, reason: "network" }; });

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");

    document.getElementById("pickTitle").textContent = "А ось що ховалось у картках…";
    document.getElementById("pickSub").textContent = "Одну з них ви щойно обрали.";
    document.getElementById("footnotePick").hidden = true;

    var allSlots = Array.prototype.slice.call(cardsEl.querySelectorAll(".card-slot"));
    allSlots.forEach(function (slot) {
      var inner = slot.querySelector(".card-inner");
      var front = slot.querySelector(".face.front");
      if (slot === chosenSlot) {
        slot.classList.add("chosen");
        front.classList.add("mystery");
        front.textContent = "✨";
      } else {
        var key = randomOtherKey();
        var meta = PRIZE_META[key];
        slot.classList.add("other", meta.tier);
        front.classList.remove("mystery");
        front.innerHTML =
          '<span class="tier-tag">' + meta.tier + "</span>" +
          '<img src="assets/prizes/' + meta.icon + '.webp" alt="" />' +
          '<span class="card-name">' + meta.name + "</span>";
      }
      inner.style.transform = "rotateY(180deg)";
      inner.style.transition = "transform 0.7s cubic-bezier(.34,1.1,.4,1)";
    });

    setTimeout(function () {
      openBtn.hidden = false;
      openBtn.classList.add("rise-in");
    }, 750);

    pendingResult = await resultPromise;

    openBtn.onclick = function () { onOpenClick(); };
  }

  var FAIL_MESSAGES = {
    code_used: "Цей код вже використаний. Попросіть новий код у бариста при наступній покупці.",
    no_code: "Потрібен персональний код від бариста — він видається після оплати замовлення.",
    bad_auth: "Не вдалося підтвердити запит. Спробуйте відкрити гру ще раз через QR.",
    network: "Немає з'єднання. Перевірте інтернет і спробуйте ще раз.",
  };

  function onOpenClick() {
    if (!pendingResult) return;
    if (!pendingResult.ok) {
      alert(FAIL_MESSAGES[pendingResult.reason] || "Щось пішло не так. Спробуйте ще раз.");
      location.reload();
      return;
    }
    renderReveal(pendingResult);
  }

  // ---------------- Screen 2: reveal with casino-style burst ----------------

  var beanImg = new Image();
  beanImg.src = "assets/prizes/bean.webp";

  function burstParticles(tier) {
    var count = tier === "legendary" ? 55 : tier === "epic" ? 42 : tier === "rare" ? 34 : 24;
    var cx = canvas.width / 2;
    var cy = canvas.height * 0.32;
    var groundY = canvas.height * 0.98;
    var particles = [];
    for (var i = 0; i < count; i++) {
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      var speed = 6 + Math.random() * 9;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 12 + Math.random() * 12,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.35,
        bounces: 0,
        life: 1,
        decay: 0.006 + Math.random() * 0.008, // faster fade — controlled 1-1.5s burst, not endless
      });
    }

    var start = performance.now();
    function tick(now) {
      var dt = Math.min((now - start) / 16.6, 2.5);
      start = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = false;
      particles.forEach(function (p) {
        if (p.life <= 0) return;
        alive = true;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.35 * dt;
        p.rot += p.vrot * dt;

        if (p.y > groundY && p.bounces < 2) {
          p.y = groundY;
          p.vy *= -0.45;
          p.vx *= 0.7;
          p.bounces++;
        }
        if (p.y > groundY) p.life -= 0.04;

        p.life -= p.decay * dt;
        ctx.globalAlpha = Math.max(p.life, 0);
        if (beanImg.complete && beanImg.naturalWidth) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          var h = p.size * (beanImg.naturalHeight / beanImg.naturalWidth);
          ctx.drawImage(beanImg, -p.size / 2, -h / 2, p.size, h);
          ctx.restore();
        }
      });
      ctx.globalAlpha = 1;
      if (alive) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(tick);
  }

  function screenShake(intensity) {
    var el = document.querySelector(".screen");
    var frames = [
      { transform: "translate(0,0)" },
      { transform: "translate(-" + intensity + "px, " + intensity * 0.6 + "px)" },
      { transform: "translate(" + intensity + "px, -" + intensity * 0.4 + "px)" },
      { transform: "translate(-" + intensity * 0.6 + "px, " + intensity * 0.3 + "px)" },
      { transform: "translate(" + intensity * 0.3 + "px, 0)" },
      { transform: "translate(0,0)" },
    ];
    el.animate(frames, { duration: 380, easing: "ease-out" });
  }

  function renderReveal(result) {
    var meta = PRIZE_META[result.prize.key] || { icon: "gift_box", name: result.prize.label, tier: "common" };
    var tier = result.prize.tier || meta.tier;

    document.getElementById("tierBadge").textContent = tier.toUpperCase();
    document.getElementById("tierBadge").className = "tier-badge " + tier;
    document.getElementById("revealIconWrap").querySelector(".rays").className = "rays " + tier;
    document.getElementById("revealIcon").src = "assets/prizes/" + meta.icon + ".webp";
    document.getElementById("revealLabel").textContent = meta.name;

    var vf = new Date(result.valid_from);
    var vu = new Date(result.valid_until);
    var fmt = function (d) {
      return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }) +
        " " + d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    };
    document.getElementById("validityBox").textContent = result.prize.requires_purchase
      ? "🗓 Приз активується " + fmt(vf) + " і діє до " + fmt(vu) + ". Покажіть код на касі при наступному замовленні."
      : "🗓 Приз діє до " + fmt(vu) + ".";

    switchView(screenPick, screenReveal);

    setTimeout(function () {
      flashEl.classList.remove("fire");
      void flashEl.offsetWidth; // restart animation
      flashEl.classList.add("fire");
      burstParticles(tier);
      screenShake(tier === "legendary" ? 10 : tier === "epic" ? 7 : 4);
      document.getElementById("revealIconWrap").classList.add("shimmer");
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    }, 280);

    document.getElementById("nextBtn").onclick = function () {
      if (tg && tg.close) tg.close();
    };
  }

  renderCards();
})();
