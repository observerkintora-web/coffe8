"""
Prize catalog for one coffee shop. Later, when supporting multiple shops,
this becomes a per-shop config loaded from the DB instead of a flat file —
the structure below is deliberately already shaped for that.

Tiers control how the prize *feels* to the guest (common vs a rare drop),
weight controls the odds within a tier draw, cost_uah is the shop's
internal cost (not the menu price) used for reporting, requires_purchase
means the prize only applies on top of a paid order (drives a return
visit), and monthly_limit caps how many of that prize can ever be handed
out in a rolling 30-day window — this is what makes "1 free coffee/month"
a hard guarantee rather than a probability that could theoretically spike.
"""

TIERS = ["common", "rare", "epic", "legendary"]

PRIZES = [
    # --- common: always available, no budget cap ---------------------
    {
        "key": "syrup",
        "label": "🍯 Бесплатный сироп",
        "icon": "🍯",
        "tier": "common",
        "weight": 35,
        "cost_uah": 5,
        "requires_purchase": True,
        "valid_days": 3,
        "monthly_limit": None,
    },
    {
        "key": "size_up",
        "label": "📏 Бесплатный апгрейд размера",
        "icon": "📏",
        "tier": "common",
        "weight": 25,
        "cost_uah": 8,
        "requires_purchase": True,
        "valid_days": 3,
        "monthly_limit": None,
    },
    {
        "key": "discount_10",
        "label": "💸 -10% на следующий заказ",
        "icon": "💸",
        "tier": "common",
        "weight": 22,
        "cost_uah": 15,
        "requires_purchase": True,
        "valid_days": 3,
        "monthly_limit": None,
    },
    {
        "key": "extra_shot",
        "label": "➕ Бесплатный extra shot",
        "icon": "➕",
        "tier": "common",
        "weight": 18,
        "cost_uah": 6,
        "requires_purchase": True,
        "valid_days": 3,
        "monthly_limit": None,
    },
    # --- rare: budget-capped, shows up a few times a week -------------
    {
        "key": "discount_50_second",
        "label": "💰 Второй напиток -50%",
        "icon": "💰",
        "tier": "rare",
        "weight": 100,
        "cost_uah": 40,
        "requires_purchase": True,
        "valid_days": 3,
        "monthly_limit": 40,
    },
    # --- epic: a real drop, hard monthly cap ---------------------------
    {
        "key": "free_coffee",
        "label": "☕ Бесплатный кофе",
        "icon": "☕",
        "tier": "epic",
        "weight": 100,
        "cost_uah": 25,
        "requires_purchase": True,
        "valid_days": 3,
        "monthly_limit": 20,
    },
    # --- legendary: the "did you hear someone won that" prize ----------
    {
        "key": "free_dessert",
        "label": "🍰 Бесплатный десерт",
        "icon": "🍰",
        "tier": "legendary",
        "weight": 100,
        "cost_uah": 60,
        "requires_purchase": True,
        "valid_days": 3,
        "monthly_limit": 3,
    },
]

# Odds of landing in each tier's draw at all (must sum to 100).
# Within the chosen tier, PRIZES' per-tier weights above decide which
# specific prize is picked.
TIER_ODDS = {
    "common": 78,
    "rare": 16,
    "epic": 5,
    "legendary": 1,
}

PRIZE_BY_KEY = {p["key"]: p for p in PRIZES}


def prizes_in_tier(tier: str) -> list[dict]:
    return [p for p in PRIZES if p["tier"] == tier]
