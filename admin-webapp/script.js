(function () {
  "use strict";

  // Same origin as this page (served by the bot's aiohttp app) — see README
  // for why this can't be a separate static host like the game can.
  var API_URL = "/api/admin/stats";

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  var TIER_LABELS = { common: "Обычные", rare: "Редкие", epic: "Эпик", legendary: "Легендарные" };
  var currentDays = 7;

  var loadingEl = document.getElementById("loading");
  var deniedEl = document.getElementById("deniedMsg");
  var contentEl = document.getElementById("content");

  function fmt(n) {
    return Math.round(n).toLocaleString("ru-RU");
  }

  async function loadStats(days) {
    loadingEl.hidden = false;
    contentEl.hidden = true;
    deniedEl.hidden = true;

    var initData = tg ? tg.initData : "";
    try {
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, days: days }),
      });
      if (res.status === 403) {
        loadingEl.hidden = true;
        deniedEl.hidden = false;
        return;
      }
      var data = await res.json();
      render(data);
    } catch (err) {
      loadingEl.textContent = "Не удалось загрузить данные. Попробуйте позже.";
    }
  }

  function render(s) {
    loadingEl.hidden = true;
    contentEl.hidden = false;

    document.getElementById("gamesIssued").textContent = s.games_issued;
    document.getElementById("gamesPlayed").textContent = s.games_played;
    document.getElementById("uniquePlayers").textContent = s.unique_players;
    document.getElementById("redeemedCount").textContent = s.redeemed_count;

    var tiersBar = document.getElementById("tiersBar");
    tiersBar.innerHTML = "";
    var maxTier = Math.max(1, ...Object.values(s.tickets_by_tier));
    ["common", "rare", "epic", "legendary"].forEach(function (tier) {
      var count = s.tickets_by_tier[tier] || 0;
      var pct = Math.round((count / maxTier) * 100);
      var row = document.createElement("div");
      row.className = "tier-row";
      row.innerHTML =
        "<span>" + TIER_LABELS[tier] + "</span>" +
        '<span class="tier-bar-bg"><span class="tier-bar-fill" style="width:' + pct + '%"></span></span>' +
        "<span>" + count + "</span>";
      tiersBar.appendChild(row);
    });

    document.getElementById("revenue").textContent = fmt(s.redeemed_revenue_uah) + " грн";
    document.getElementById("costUsed").textContent = fmt(s.redeemed_cost_uah) + " грн";
    document.getElementById("costPending").textContent = fmt(s.pending_cost_uah) + " грн";
    document.getElementById("roi").textContent = s.redeemed_cost_uah
      ? (s.redeemed_revenue_uah / s.redeemed_cost_uah).toFixed(1) + "× к затратам"
      : "—";

    var list = document.getElementById("recentList");
    list.innerHTML = "";
    (s.recent_tickets || []).forEach(function (t) {
      var item = document.createElement("div");
      item.className = "recent-item";
      item.innerHTML =
        "<span>" + t.prize_label + "</span>" +
        '<span class="status ' + (t.redeemed ? "redeemed" : "pending") + '">' +
        (t.redeemed ? "использован" : "ожидает") +
        "</span>";
      list.appendChild(item);
    });
  }

  document.getElementById("periodSwitch").addEventListener("click", function (evt) {
    var btn = evt.target.closest("button[data-days]");
    if (!btn) return;
    document.querySelectorAll(".period-switch button").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    currentDays = parseInt(btn.dataset.days, 10);
    loadStats(currentDays);
  });

  loadStats(currentDays);
})();
