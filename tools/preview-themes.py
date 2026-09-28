#!/usr/bin/env python3
"""画面デザイン案（docs/mock/themes/）の見本を撮る。

テスト用ダミーデータを読み込ませ、抽出まで済んだ状態の画面を案ごとに撮影する。
見比べて選ぶためのもので、アプリ本体の動作には関係しない。

    python3 tools/preview-themes.py
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
THEMES = ROOT / "docs/mock/themes"
OUT = THEMES / "preview"

# (見出し, 重ねるCSS。None は現在の画面)
VARIANTS = [
    ("0_現行", None),
    ("1_藍", "theme-ai.css"),
    ("2_霞", "theme-kasumi.css"),
    ("3_常磐", "theme-tokiwa.css"),
    ("4_宵", "theme-yoi.css"),
    ("5_陽", "theme-hi.css"),
]


def chromium_path():
    if os.environ.get("CHROMIUM"):
        return os.environ["CHROMIUM"]
    for p in pathlib.Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"):
        return str(p)
    return None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    launch = {"args": ["--no-sandbox"]}
    if chromium_path():
        launch["executable_path"] = chromium_path()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(**launch)
        for name, css in VARIANTS:
            page = browser.new_page(viewport={"width": 1180, "height": 1500},
                                    device_scale_factor=2)
            page.goto("file://" + str(ROOT / "index.html"))
            page.wait_for_timeout(500)
            if css:
                page.add_style_tag(path=str(THEMES / css))
                page.wait_for_timeout(200)
            page.set_input_files("#fRoster", str(ROOT / "test/fixtures/roster.xlsx"))
            page.set_input_files("#fDeps", str(ROOT / "test/fixtures/deps.xlsx"))
            page.wait_for_timeout(300)
            page.click("#btnRun")
            page.wait_for_timeout(900)
            page.locator("#ui").screenshot(path=str(OUT / (name + ".png")))
            print("  " + name)
            page.close()
        browser.close()
    print("完了: {}".format(OUT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
