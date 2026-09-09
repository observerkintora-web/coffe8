"""
Verifies Telegram Mini App `initData` server-side, per Telegram's documented
algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

Never trust initData without this check — anyone can send arbitrary JSON to
your API pretending to be any Telegram user. This is what proves a request
genuinely came from Telegram, for this exact bot, and wasn't tampered with.
"""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def verify_init_data(init_data: str, bot_token: str, max_age_seconds: int = 3600) -> dict | None:
    """Returns the parsed Telegram user dict if initData is valid, else None."""
    try:
        pairs = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        return None

    received_hash = pairs.pop("hash", None)
    if not received_hash:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    auth_date = pairs.get("auth_date")
    if auth_date and time.time() - int(auth_date) > max_age_seconds:
        return None  # stale initData — likely a replayed/captured request

    user_raw = pairs.get("user")
    if not user_raw:
        return None
    try:
        return json.loads(user_raw)
    except json.JSONDecodeError:
        return None
