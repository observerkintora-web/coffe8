import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _parse_admin_ids(raw: str) -> list[int]:
    return [int(x.strip()) for x in raw.split(",") if x.strip()]


@dataclass
class Config:
    bot_token: str = os.getenv("BOT_TOKEN", "")
    webapp_url: str = os.getenv("WEBAPP_URL", "")
    shop_name: str = os.getenv("SHOP_NAME", "Кофейня")
    admin_ids: list[int] = field(default_factory=lambda: _parse_admin_ids(os.getenv("ADMIN_IDS", "")))
    play_cooldown_hours: int = int(os.getenv("PLAY_COOLDOWN_HOURS", "24"))
    db_path: str = os.getenv("DB_PATH", "roulette.db")


config = Config()
