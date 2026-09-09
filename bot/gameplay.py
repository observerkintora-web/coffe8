import random

from bot import db
from bot.prizes import PRIZES, TIER_ODDS, prizes_in_tier


def _pick_from(pool: list[dict]) -> dict:
    total = sum(p["weight"] for p in pool)
    roll = random.uniform(0, total)
    for p in pool:
        roll -= p["weight"]
        if roll <= 0:
            return p
    return pool[-1]


def draw_prize() -> dict:
    """
    Picks a tier by TIER_ODDS, then a prize within that tier by weight.
    If every prize in the rolled tier has hit its monthly_limit, falls
    back to the common tier (which has no cap) so a guest always wins
    something — the budget cap protects cost, it never produces a loss.
    """
    tiers = list(TIER_ODDS.keys())
    weights = list(TIER_ODDS.values())
    tier = random.choices(tiers, weights=weights, k=1)[0]

    pool = [
        p for p in prizes_in_tier(tier)
        if p["monthly_limit"] is None or db.prize_count_last_30_days(p["key"]) < p["monthly_limit"]
    ]
    if not pool:
        pool = prizes_in_tier("common")

    return _pick_from(pool)
