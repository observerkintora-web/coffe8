import asyncio
import logging
import os

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiohttp import web

from bot import db
from bot.api import build_app
from bot.config import config
from bot.handlers import router


async def run_bot(bot: Bot) -> None:
    dp = Dispatcher()
    dp.include_router(router)
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


async def run_api(bot: Bot) -> None:
    app = build_app(bot)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.getenv("PORT", "8080"))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logging.info(f"Admin API listening on :{port}")
    await asyncio.Event().wait()  # keep running forever


async def main() -> None:
    logging.basicConfig(level=logging.INFO)

    if not config.bot_token:
        raise SystemExit("BOT_TOKEN is not set — copy .env.example to .env and fill it in.")
    if not config.webapp_url:
        raise SystemExit("WEBAPP_URL is not set — it must be an https:// URL where webapp/ is hosted.")

    db.init_db()
    bot = Bot(token=config.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    await asyncio.gather(run_bot(bot), run_api(bot))


if __name__ == "__main__":
    asyncio.run(main())
