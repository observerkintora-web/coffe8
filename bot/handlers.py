import json
import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from bot import db
from bot.config import config
from bot.gameplay import draw_prize

router = Router()
log = logging.getLogger(__name__)

REDEEM_FAIL_REASONS = {
    "not_found": "❌ Код не найден.",
    "already_redeemed": "❌ Этот приз уже был использован.",
    "not_yet_valid": "⏳ Приз ещё не активен (действует с более поздней даты).",
    "expired": "⌛ Срок действия приза истёк.",
    "amount_required": "❗ Этот приз выдаётся только при покупке — укажите сумму чека: /redeem КОД СУММА",
}


def _is_staff(user_id: int) -> bool:
    return user_id in config.admin_ids


def play_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="🎰 Крутить рулетку", web_app=WebAppInfo(url=config.webapp_url))]]
    )


@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    await message.answer(
        f"Привет! Это {config.shop_name} ☕\n\n"
        "Игра доступна по одноразовому коду, который выдаёт бариста после оплаты "
        "заказа (обычно через QR на чеке или на кассе). Отсканируйте его — и "
        "мини-апп откроется сразу с активной игрой.",
        reply_markup=play_keyboard(),
    )


# --------------------------------------------------------------- staff: issue

@router.message(Command("newqr"))
async def cmd_newqr(message: Message, command: CommandObject) -> None:
    if not _is_staff(message.from_user.id):
        return
    args = (command.args or "").strip().replace(",", ".")
    try:
        amount = float(args)
        if amount <= 0:
            raise ValueError
    except ValueError:
        await message.answer("Использование: /newqr СУММА_ЧЕКА\nНапример: /newqr 150")
        return

    code = db.create_game_code(created_by=message.from_user.id, amount=amount)
    me = await message.bot.me()
    link = f"https://t.me/{me.username}?startapp={code}"

    await message.answer(
        f"🎟 Код на игру создан для чека {amount:.0f} грн:\n"
        f"`{code}`\n\n"
        f"Ссылка (сделайте из неё QR и отдайте гостю):\n{link}\n\n"
        "Код одноразовый — сработает только один раз.",
        parse_mode="Markdown",
    )


# ------------------------------------------------------------------- gameplay

@router.message(F.web_app_data)
async def on_web_app_data(message: Message) -> None:
    user_id = message.from_user.id
    try:
        payload = json.loads(message.web_app_data.data)
        game_code = str(payload.get("code", "")).strip()
    except json.JSONDecodeError:
        game_code = ""

    if not game_code:
        await message.answer(
            "Для игры нужен персональный код от бариста — он выдаётся после "
            "оплаты заказа. Попросите код на кассе."
        )
        return

    claimed = db.mark_game_code_played(game_code, user_id)
    if not claimed:
        await message.answer(
            "❌ Этот код уже использован или не существует. Каждый код на игру одноразовый — "
            "попросите новый у бариста при следующей покупке."
        )
        return

    prize = draw_prize()
    ticket_code, valid_from, valid_until = db.create_ticket(
        user_id=user_id,
        username=message.from_user.username,
        game_code=game_code,
        prize=prize,
    )

    when = (
        f"доступен с {valid_from.strftime('%d.%m %H:%M')} до {valid_until.strftime('%d.%m %H:%M')}"
        if prize["requires_purchase"]
        else f"действует до {valid_until.strftime('%d.%m %H:%M')}"
    )
    purchase_note = (
        "\n\nПриз применяется к следующему заказу — просто покажите код на кассе."
        if prize["requires_purchase"]
        else ""
    )

    await message.answer(
        f"🎉 Ваш приз: {prize['label']}\n\n"
        f"Код для бариста: `{ticket_code}`\n"
        f"Приз {when}.{purchase_note}",
        parse_mode="Markdown",
    )


# --------------------------------------------------------------- staff: redeem

@router.message(Command("redeem"))
async def cmd_redeem(message: Message, command: CommandObject) -> None:
    if not _is_staff(message.from_user.id):
        return
    parts = (command.args or "").split()
    if not parts:
        await message.answer("Использование: /redeem КОД [СУММА_ЧЕКА]")
        return

    code = parts[0]
    amount = None
    if len(parts) > 1:
        try:
            amount = float(parts[1].replace(",", "."))
        except ValueError:
            await message.answer("Сумма чека должна быть числом. Пример: /redeem A3K7XZ 180")
            return

    ok, reason = db.redeem_ticket(code, amount)
    if ok:
        await message.answer(f"✅ Приз {code.upper()} активирован.")
    else:
        await message.answer(REDEEM_FAIL_REASONS.get(reason, "❌ Не удалось активировать приз."))


@router.message(Command("check"))
async def cmd_check(message: Message, command: CommandObject) -> None:
    if not _is_staff(message.from_user.id):
        return
    code = (command.args or "").strip()
    if not code:
        await message.answer("Использование: /check КОД")
        return
    ticket = db.get_ticket(code)
    if ticket is None:
        await message.answer("❌ Код не найден.")
        return
    status = "использован" if ticket["redeemed_at"] else "не использован"
    await message.answer(
        f"Приз: {ticket['prize_label']}\n"
        f"Статус: {status}\n"
        f"Действует: {ticket['valid_from'][:16]} — {ticket['valid_until'][:16]}"
    )


@router.message(Command("stats"))
async def cmd_stats(message: Message, command: CommandObject) -> None:
    if not _is_staff(message.from_user.id):
        return
    try:
        days = int((command.args or "7").strip())
    except ValueError:
        days = 7

    s = db.get_stats(days)
    tiers = s["tickets_by_tier"]
    tier_lines = "\n".join(
        f"  {t}: {tiers.get(t, 0)}" for t in ("common", "rare", "epic", "legendary")
    )
    margin = (
        f"{s['redeemed_revenue_uah'] / s['redeemed_cost_uah']:.1f}× к затратам"
        if s["redeemed_cost_uah"]
        else "—"
    )
    await message.answer(
        f"📊 Статистика за {days} дн.\n\n"
        f"Игр выдано: {s['games_issued']}\n"
        f"Игр сыграно: {s['games_played']}\n"
        f"Уникальных игроков: {s['unique_players']}\n\n"
        f"Призы по редкости:\n{tier_lines}\n\n"
        f"Использовано призов: {s['redeemed_count']}\n"
        f"Выручка с использованных призов: {s['redeemed_revenue_uah']:.0f} грн\n"
        f"Себестоимость использованных: {s['redeemed_cost_uah']:.0f} грн\n"
        f"Себестоимость невостребованных (в обороте): {s['pending_cost_uah']:.0f} грн\n"
        f"Окупаемость: {margin}"
    )
