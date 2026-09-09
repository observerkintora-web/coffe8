import logging

from aiogram import Bot
from aiohttp import web

from bot import db
from bot.auth import verify_init_data
from bot.config import config
from bot.gameplay import draw_prize

log = logging.getLogger(__name__)
routes = web.RouteTableDef()


def _cors(resp: web.Response) -> web.Response:
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return resp


@routes.options("/api/play")
async def play_preflight(request: web.Request) -> web.Response:
    return _cors(web.Response())


@routes.post("/api/play")
async def play(request: web.Request) -> web.Response:
    """
    Called directly by the game Mini App when a guest taps a card.
    Verifies the request really came from Telegram, claims the one-time
    game code, draws the prize server-side (budget-aware), issues the
    ticket, and — as a side effect — sends the guest a confirmation
    message in the bot chat so the code is never only on-screen.
    """
    body = await request.json()
    init_data = body.get("initData", "")
    game_code = str(body.get("code", "")).strip()

    user = verify_init_data(init_data, config.bot_token)
    if user is None:
        return _cors(web.json_response({"ok": False, "reason": "bad_auth"}, status=403))

    if not game_code:
        return _cors(web.json_response({"ok": False, "reason": "no_code"}))

    if not db.mark_game_code_played(game_code, user["id"]):
        return _cors(web.json_response({"ok": False, "reason": "code_used"}))

    prize = draw_prize()
    ticket_code, valid_from, valid_until = db.create_ticket(
        user_id=user["id"],
        username=user.get("username"),
        game_code=game_code,
        prize=prize,
    )

    bot = request.app["bot"]
    when = (
        f"доступен с {valid_from.strftime('%d.%m %H:%M')} до {valid_until.strftime('%d.%m %H:%M')}"
        if prize["requires_purchase"]
        else f"действует до {valid_until.strftime('%d.%m %H:%M')}"
    )
    try:
        await bot.send_message(
            user["id"],
            f"🎉 Ваш приз: {prize['label']}\n\nКод для бариста: `{ticket_code}`\nПриз {when}.",
            parse_mode="Markdown",
        )
    except Exception:
        log.exception("Could not DM the guest their ticket — they still have it in-app")

    return _cors(web.json_response({
        "ok": True,
        "prize": {
            "key": prize["key"],
            "label": prize["label"],
            "tier": prize["tier"],
            "requires_purchase": prize["requires_purchase"],
        },
        "ticket_code": ticket_code,
        "valid_from": valid_from.isoformat(),
        "valid_until": valid_until.isoformat(),
    }))


@routes.options("/api/admin/stats")
async def stats_preflight(request: web.Request) -> web.Response:
    return _cors(web.Response())


@routes.post("/api/admin/stats")
async def stats(request: web.Request) -> web.Response:
    body = await request.json()
    init_data = body.get("initData", "")

    user = verify_init_data(init_data, config.bot_token)
    if user is None or user.get("id") not in config.admin_ids:
        return _cors(web.json_response({"error": "forbidden"}, status=403))

    days = int(body.get("days", 7))
    payload = db.get_stats(days)
    payload["recent_tickets"] = [
        {
            "code": t["code"],
            "prize_label": t["prize_label"],
            "tier": t["tier"],
            "redeemed": bool(t["redeemed_at"]),
            "created_at": t["created_at"],
        }
        for t in db.get_recent_tickets(15)
    ]
    return _cors(web.json_response(payload))


def build_app(bot: Bot) -> web.Application:
    app = web.Application()
    app["bot"] = bot
    app.add_routes(routes)
    app.router.add_static("/admin/", path="admin-webapp", show_index=False)
    app.router.add_static("/play/", path="webapp", show_index=False)
    return app
