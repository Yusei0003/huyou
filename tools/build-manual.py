#!/usr/bin/env python3
"""操作マニュアル（docs/manual/*.pdf）を作り直す。

アプリの実画面をスクリーンショットで撮り直し、docs/manual/manual.html を
A4・2ページのPDFに書き出す。画面を変更したら実行すること。

    python3 tools/build-manual.py

必要なもの（開発時のみ。アプリ本体の動作には不要）
    pip install playwright pillow
    Chromium 実行ファイル（環境変数 CHROMIUM か、既定の探索パス）
"""
import os
import pathlib
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "docs/manual/img"
SRC = ROOT / "docs/manual/manual.html"
PDF = ROOT / "docs/manual/扶養親族確認調査書印刷システム_操作マニュアル.pdf"

# マニュアルの版面に合わせた切り出し位置（画像は device_scale_factor=2 の実寸）
CROPS = {
    # 元画像            切り出し後      切り出す高さ（下端で要素が途中で切れない位置）
    "s1-load.png":   ("c-load.png",   None),  # 撮影時に高さが決まるため加工なし
    "s3-result.png": ("c-result.png", 578),   # 統計タイル＋エラー欄まで
    "s4-list.png":   ("c-list.png",   674),   # 操作行＋一覧の2行目まで
    "s6-sheet.png":  ("c-sheet.png",  1400),  # 調査書の記入部分のみ
}


def chromium_path():
    if os.environ.get("CHROMIUM"):
        return os.environ["CHROMIUM"]
    for p in pathlib.Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"):
        return str(p)
    return None  # Playwright の既定を使う


def shoot(pw):
    """アプリを開き、テスト用ダミーデータで各画面を撮影する。"""
    launch = {"args": ["--no-sandbox"]}
    if chromium_path():
        launch["executable_path"] = chromium_path()
    browser = pw.chromium.launch(**launch)
    page = browser.new_page(viewport={"width": 1180, "height": 1400}, device_scale_factor=2)
    page.goto("file://" + str(ROOT / "index.html"))
    page.wait_for_timeout(600)

    # 「データの準備のしかた」はマニュアル本文に書き起こしてあるので、画面写真からは外す
    page.eval_on_selector("details.howto", "el => el.style.display = 'none'")
    page.set_input_files("#fRoster", str(ROOT / "test/fixtures/roster.xlsx"))
    page.set_input_files("#fDeps", str(ROOT / "test/fixtures/deps.xlsx"))
    page.wait_for_timeout(400)
    page.locator("#ui .card").first.screenshot(path=str(IMG / "c-load.png"))

    page.click("#btnRun")
    page.wait_for_timeout(900)
    page.locator("#secResult").screenshot(path=str(IMG / "s3-result.png"))
    page.locator("#secList").screenshot(path=str(IMG / "s4-list.png"))

    page.click("#btnPreview")
    page.wait_for_timeout(900)
    page.locator(".sheets .sheet").first.screenshot(path=str(IMG / "s6-sheet.png"))
    browser.close()


def crop():
    for src, (dst, height) in CROPS.items():
        if height is None:
            continue
        p = IMG / src
        if not p.exists():
            continue
        im = Image.open(p)
        im.crop((0, 0, im.width, min(height, im.height))).save(IMG / dst)
        print("  crop {} -> {} {}".format(src, dst, Image.open(IMG / dst).size))


def build_pdf(pw):
    launch = {"args": ["--no-sandbox"]}
    if chromium_path():
        launch["executable_path"] = chromium_path()
    browser = pw.chromium.launch(**launch)
    page = browser.new_page()
    page.goto("file://" + str(SRC))
    page.wait_for_timeout(1200)

    # 版面からはみ出していないか確認する（A4縦 297mm − 上下余白14mm×2）
    heights = page.evaluate(
        "() => [...document.querySelectorAll('.page')]"
        ".map(el => +(el.getBoundingClientRect().height / (96/25.4)).toFixed(1))"
    )
    over = [h for h in heights if h > 269]
    print("  各ページの高さ: {} mm（上限 269mm）".format(heights))

    page.pdf(path=str(PDF), format="A4", print_background=True, prefer_css_page_size=True)
    browser.close()
    if over:
        print("  警告: 版面を超えているページがあります。文章か画像の幅を詰めてください。", file=sys.stderr)
        return 1
    return 0


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        print("画面を撮影中...")
        shoot(pw)
        print("画像を切り出し中...")
        crop()
        print("PDFを作成中...")
        rc = build_pdf(pw)
    print("完了: {}".format(PDF))
    return rc


if __name__ == "__main__":
    sys.exit(main())
