"""
Generates a QR code that opens the coffee-roulette Mini App directly.

Usage:
    python qr/generate_qr.py <bot_username> <app_short_name> [output.png]

Example:
    python qr/generate_qr.py MyCoffeeBot roulette table_qr.png

The bot_username and app_short_name come from BotFather:
  - bot_username: without the @, e.g. MyCoffeeBot
  - app_short_name: the short name you gave the Mini App in
    /newapp (BotFather), e.g. "roulette"

The resulting link looks like:
    https://t.me/MyCoffeeBot/roulette?startapp=table
Scanning it opens Telegram and launches the Mini App directly —
no extra tap on a "start" button needed.
"""

import sys

import qrcode


def build_link(bot_username: str, app_short_name: str, start_param: str = "qr") -> str:
    return f"https://t.me/{bot_username}/{app_short_name}?startapp={start_param}"


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(1)

    bot_username = sys.argv[1]
    app_short_name = sys.argv[2]
    output = sys.argv[3] if len(sys.argv) > 3 else "coffee_roulette_qr.png"

    link = build_link(bot_username, app_short_name)
    img = qrcode.make(link)
    img.save(output)

    print(f"Ссылка: {link}")
    print(f"QR-код сохранён в: {output}")


if __name__ == "__main__":
    main()
