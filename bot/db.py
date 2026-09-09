import random
import sqlite3
import string
from contextlib import closing
from datetime import datetime, timedelta, timezone

from bot.config import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS game_codes (
    code TEXT PRIMARY KEY,
    created_by INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | played
    created_at TEXT NOT NULL,
    played_at TEXT,
    user_id INTEGER
);

CREATE TABLE IF NOT EXISTS tickets (
    code TEXT PRIMARY KEY,
    game_code TEXT,
    user_id INTEGER NOT NULL,
    username TEXT,
    prize_key TEXT NOT NULL,
    prize_label TEXT NOT NULL,
    tier TEXT NOT NULL,
    cost_uah REAL NOT NULL DEFAULT 0,
    requires_purchase INTEGER NOT NULL DEFAULT 0,
    valid_from TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    created_at TEXT NOT NULL,
    redeemed_at TEXT,
    redeemed_amount REAL
);
"""


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(get_conn()) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _gen_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
    return "".join(random.choices(alphabet, k=length))


# ---------------------------------------------------------------- game codes

def create_game_code(created_by: int, amount: float) -> str:
    code = _gen_code()
    with closing(get_conn()) as conn:
        while conn.execute("SELECT 1 FROM game_codes WHERE code = ?", (code,)).fetchone():
            code = _gen_code()
        conn.execute(
            "INSERT INTO game_codes (code, created_by, amount, created_at) VALUES (?, ?, ?, ?)",
            (code, created_by, amount, _now().isoformat()),
        )
        conn.commit()
    return code


def get_game_code(code: str) -> sqlite3.Row | None:
    with closing(get_conn()) as conn:
        return conn.execute(
            "SELECT * FROM game_codes WHERE code = ?", (code.strip().upper(),)
        ).fetchone()


def mark_game_code_played(code: str, user_id: int) -> bool:
    """Atomically claims a pending code. Returns False if already used/missing."""
    code = code.strip().upper()
    with closing(get_conn()) as conn:
        cur = conn.execute(
            "UPDATE game_codes SET status = 'played', played_at = ?, user_id = ? "
            "WHERE code = ? AND status = 'pending'",
            (_now().isoformat(), user_id, code),
        )
        conn.commit()
        return cur.rowcount == 1


# -------------------------------------------------------------- prize budget

def prize_count_last_30_days(prize_key: str) -> int:
    since = (_now() - timedelta(days=30)).isoformat()
    with closing(get_conn()) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM tickets WHERE prize_key = ? AND created_at >= ?",
            (prize_key, since),
        ).fetchone()
    return row["c"]


# -------------------------------------------------------------------- tickets

def create_ticket(
    user_id: int,
    username: str | None,
    game_code: str | None,
    prize: dict,
) -> tuple[str, datetime, datetime]:
    code = _gen_code()
    now = _now()
    valid_from = now if not prize["requires_purchase"] else now + timedelta(days=1)
    valid_until = valid_from + timedelta(days=prize["valid_days"])

    with closing(get_conn()) as conn:
        while conn.execute("SELECT 1 FROM tickets WHERE code = ?", (code,)).fetchone():
            code = _gen_code()
        conn.execute(
            "INSERT INTO tickets (code, game_code, user_id, username, prize_key, prize_label, "
            "tier, cost_uah, requires_purchase, valid_from, valid_until, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                code, game_code, user_id, username,
                prize["key"], prize["label"], prize["tier"], prize["cost_uah"],
                int(prize["requires_purchase"]),
                valid_from.isoformat(), valid_until.isoformat(), now.isoformat(),
            ),
        )
        conn.commit()
    return code, valid_from, valid_until


def get_ticket(code: str) -> sqlite3.Row | None:
    with closing(get_conn()) as conn:
        return conn.execute(
            "SELECT * FROM tickets WHERE code = ?", (code.strip().upper(),)
        ).fetchone()


def redeem_ticket(code: str, amount: float | None) -> tuple[bool, str]:
    """Returns (ok, reason). reason explains failure when ok is False."""
    code = code.strip().upper()
    with closing(get_conn()) as conn:
        row = conn.execute("SELECT * FROM tickets WHERE code = ?", (code,)).fetchone()
        if row is None:
            return False, "not_found"
        if row["redeemed_at"] is not None:
            return False, "already_redeemed"
        now = _now()
        if now < datetime.fromisoformat(row["valid_from"]):
            return False, "not_yet_valid"
        if now > datetime.fromisoformat(row["valid_until"]):
            return False, "expired"
        if row["requires_purchase"] and not amount:
            return False, "amount_required"
        conn.execute(
            "UPDATE tickets SET redeemed_at = ?, redeemed_amount = ? WHERE code = ?",
            (now.isoformat(), amount, code),
        )
        conn.commit()
    return True, "ok"


# --------------------------------------------------------------------- stats

def get_stats(days: int) -> dict:
    since = (_now() - timedelta(days=days)).isoformat()
    with closing(get_conn()) as conn:
        games_issued = conn.execute(
            "SELECT COUNT(*) c FROM game_codes WHERE created_at >= ?", (since,)
        ).fetchone()["c"]
        games_played = conn.execute(
            "SELECT COUNT(*) c FROM game_codes WHERE status = 'played' AND created_at >= ?", (since,)
        ).fetchone()["c"]
        tickets_by_tier = conn.execute(
            "SELECT tier, COUNT(*) c FROM tickets WHERE created_at >= ? GROUP BY tier", (since,)
        ).fetchall()
        redeemed = conn.execute(
            "SELECT COUNT(*) c, COALESCE(SUM(redeemed_amount),0) revenue, "
            "COALESCE(SUM(cost_uah),0) cost "
            "FROM tickets WHERE redeemed_at IS NOT NULL AND created_at >= ?",
            (since,),
        ).fetchone()
        pending_cost = conn.execute(
            "SELECT COALESCE(SUM(cost_uah),0) c FROM tickets "
            "WHERE redeemed_at IS NULL AND created_at >= ?", (since,)
        ).fetchone()["c"]
        unique_players = conn.execute(
            "SELECT COUNT(DISTINCT user_id) c FROM tickets WHERE created_at >= ?", (since,)
        ).fetchone()["c"]

    return {
        "period_days": days,
        "games_issued": games_issued,
        "games_played": games_played,
        "unique_players": unique_players,
        "tickets_by_tier": {r["tier"]: r["c"] for r in tickets_by_tier},
        "redeemed_count": redeemed["c"],
        "redeemed_revenue_uah": redeemed["revenue"],
        "redeemed_cost_uah": redeemed["cost"],
        "pending_cost_uah": pending_cost,
    }


def get_recent_tickets(limit: int = 15) -> list[sqlite3.Row]:
    with closing(get_conn()) as conn:
        return conn.execute(
            "SELECT * FROM tickets ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
