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
import re
import shutil
import subprocess
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "docs/manual/img"
SRC = ROOT / "docs/manual/manual.html"
PDF = ROOT / "docs/manual/扶養親族確認調査書印刷システム_操作マニュアル.pdf"
FONTS = ROOT / "docs/manual/fonts"

# マニュアルに埋め込む日本語フォント。manual.html が @font-face で読む。
# 原typeface は Noto Sans CJK JP（SIL Open Font License 1.1）。
FONT_SUBSETS = {
    "manual-jp-regular.woff2": ("NotoSansCJK-Regular.ttc", 400),
    "manual-jp-bold.woff2":    ("NotoSansCJK-Bold.ttc", 700),
}

# マニュアルの版面に合わせた加工指定
#   crop : 切り出す高さ（下端で要素が途中で切れない位置）。None なら切り出さない
#   mm   : manual.html 上での表示幅。この幅と DPI からピクセル数を決める
#
# 画面写真を撮ったままの解像度で貼るとPDFが無駄に重くなる（調査書は1200dpi相当だった）。
# 印刷して読む用途では200dpiで十分なので、貼る寸法に合わせて縮小する。
DPI = 150

# A4縦（297mm）から上下余白14mm×2を引くと269mm。少しの文言変更であふれないよう
# 4mm の余裕を見て警告する。
LIMIT_MM = 265
IMAGES = {
    "c-load.png":   {"src": "s1-load.png",   "crop": None, "mm": 150},
    "c-result.png": {"src": "s3-result.png", "crop": 578,  "mm": 146},  # 統計タイル＋エラー欄まで
    "c-list.png":   {"src": "s4-list.png",   "crop": 674,  "mm": 130},  # 操作行＋一覧の2行目まで
    "c-sheet.png":  {"src": "s6-sheet.png",  "crop": 1400, "mm": 34},   # 調査書の記入部分のみ
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
    page.locator("#ui .card").first.screenshot(path=str(IMG / "s1-load.png"))

    page.click("#btnRun")
    page.wait_for_timeout(900)
    page.locator("#secResult").screenshot(path=str(IMG / "s3-result.png"))
    page.locator("#secList").screenshot(path=str(IMG / "s4-list.png"))

    page.click("#btnPreview")
    page.wait_for_timeout(900)
    page.locator(".sheets .sheet").first.screenshot(path=str(IMG / "s6-sheet.png"))
    browser.close()


def shrink():
    """切り出しと、表示寸法に合わせた縮小・減色を行う。"""
    for dst, spec in IMAGES.items():
        src = IMG / spec["src"]
        if not src.exists():
            continue
        im = Image.open(src).convert("RGB")
        if spec["crop"]:
            im = im.crop((0, 0, im.width, min(spec["crop"], im.height)))
        width = round(spec["mm"] / 25.4 * DPI)
        if width < im.width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        # 画面写真は色数が少ないので、減色するとPDFの圧縮が効く（文字のにじみは出ない）
        im = im.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE)
        im.save(IMG / dst, optimize=True)
        print("  {} -> {} {}".format(src.name, dst, im.size))


def used_chars():
    """manual.html の本文に出てくる文字を集める（タグと空白を除く）。"""
    html = SRC.read_text(encoding="utf-8")
    body = html[html.index("<body>"):]
    text = re.sub(r"<[^>]+>", "", body)
    return set(text) - set(" \n\r\t")


def subset_fonts():
    """本文で使う文字だけのフォントを作り直す。

    Chromium は日本語を Type 3（1文字ずつ図形として描く形式）で埋め込むため、
    システムのフォントをそのまま使うとPDFが1MB近くになる。
    使う文字だけのサブセットを @font-face で読ませると、その分だけの埋め込みで済む。

    作り直せない環境（fonttools が無い、原フォントが見つからない）では、
    リポジトリに入っているサブセットをそのまま使う。その場合でも、
    本文の文字がすべて入っているかは確認する。
    """
    chars = used_chars()
    src_dir = pathlib.Path("/usr/share/fonts/opentype/noto")
    can_build = shutil.which("pyftsubset") and all(
        (src_dir / src).exists() for src, _ in FONT_SUBSETS.values()
    )

    if can_build:
        FONTS.mkdir(parents=True, exist_ok=True)
        txt = FONTS / "_chars.txt"
        txt.write_text("".join(sorted(chars)), encoding="utf-8")
        for out, (src, _weight) in FONT_SUBSETS.items():
            subprocess.run([
                "pyftsubset", str(src_dir / src), "--font-number=0",
                "--text-file=" + str(txt), "--flavor=woff2",
                "--layout-features=", "--desubroutinize",
                "--output-file=" + str(FONTS / out),
            ], check=True)
            print("  {} ({} 文字, {:.0f} KB)".format(out, len(chars),
                                                    (FONTS / out).stat().st_size / 1024))
        txt.unlink()
    else:
        print("  フォントを作り直せないので、リポジトリのサブセットを使います")

    # サブセットに無い文字があると、その字だけ別のフォントで表示されてしまう。
    # ただし原フォント（Noto Sans CJK）が元々持っていない絵文字などは仕方がないので数えない。
    missing = check_coverage(chars, src_dir if can_build else None)
    if missing:
        print("  警告: サブセットに入らなかった文字があります: {}".format("".join(sorted(missing))),
              file=sys.stderr)
        print("        その文字だけ別のフォントで表示されます。"
              "fonttools と Noto Sans CJK を入れて実行し直してください。", file=sys.stderr)
    return bool(missing)


def check_coverage(chars, src_dir=None):
    """サブセットが本文の日本語をすべて含んでいるか調べる。

    原フォントにも無い文字（絵文字など）は、どうやっても埋め込めないので除く。
    """
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return set()
    sub = FONTS / "manual-jp-regular.woff2"
    if not sub.exists():
        return set()
    have = {chr(c) for c in TTFont(str(sub)).getBestCmap()}
    if src_dir:
        src = src_dir / FONT_SUBSETS["manual-jp-regular.woff2"][0]
        origin = {chr(c) for c in TTFont(str(src), fontNumber=0).getBestCmap()}
        chars = {c for c in chars if c in origin}
    # ASCII は等幅フォント等に回ることがあるため、日本語・記号だけを見る。
    # 絵文字（🖨 など）は日本語フォントが元々持たないので、対象から外す。
    def target(c):
        o = ord(c)
        return 0x2000 < o < 0x1F000 or o > 0x1FAFF

    return {c for c in chars if target(c) and c not in have}


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
    over = [h for h in heights if h > LIMIT_MM]
    print("  各ページの高さ: {} mm（上限 {}mm）".format(heights, LIMIT_MM))

    page.pdf(path=str(PDF), format="A4", print_background=True, prefer_css_page_size=True)
    browser.close()
    if over:
        print("  警告: 版面を超えているページがあります。文章か画像の幅を詰めてください。", file=sys.stderr)
        return 1
    return 0


def compress():
    """Ghostscript があれば、PDFを圧縮し直す（画像は再圧縮しない可逆設定）。

    Chromium は日本語を Type 3 フォント（1文字ずつ図形として描く形式）で埋め込むため、
    2ページでも1MB近くになる。gs にかけるとフォント部分がまとまって1割ほど小さくなる。
    画像は再エンコードすると粗くなるので、可逆（Flate）のまま通す。
    """
    if not shutil.which("gs"):
        print("  Ghostscript が無いので圧縮は省略（PDFはこのままでも使えます）")
        return
    tmp = PDF.with_suffix(".gs.pdf")
    before = PDF.stat().st_size
    cmd = [
        "gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite",
        "-dPDFSETTINGS=/printer",
        "-dDownsampleColorImages=false", "-dAutoFilterColorImages=false",
        "-dColorImageFilter=/FlateEncode",
        "-dDownsampleGrayImages=false", "-dAutoFilterGrayImages=false",
        "-dGrayImageFilter=/FlateEncode",
        "-dDetectDuplicateImages=true",
        "-sOutputFile=" + str(tmp), str(PDF),
    ]
    if subprocess.run(cmd).returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        print("  圧縮に失敗したので、圧縮前のPDFをそのまま使います", file=sys.stderr)
        return
    after = tmp.stat().st_size
    if after < before:
        tmp.replace(PDF)
        print("  圧縮: {:.0f} KB → {:.0f} KB".format(before / 1024, after / 1024))
    else:
        tmp.unlink()
        print("  圧縮しても小さくならなかったので、そのまま使います")


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        print("画面を撮影中...")
        shoot(pw)
        print("画像を切り出し・縮小中...")
        shrink()
        print("フォントを用意中...")
        subset_fonts()
        print("PDFを作成中...")
        rc = build_pdf(pw)
    print("PDFを圧縮中...")
    compress()
    print("完了: {}".format(PDF))
    return rc


if __name__ == "__main__":
    sys.exit(main())
