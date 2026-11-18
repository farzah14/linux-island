#!/usr/bin/env python3
"""Generate vector SVG and raster PNG previews for the Obsidian Emerald design system."""
import json
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'tokens' / 'tokens.json').read_text())
DARK = DATA['semantic']['dark']
LIGHT = DATA['semantic']['light']
PALETTE = DATA['palette']

SVG_PATH = ROOT / 'previews' / 'Linux_Island_Obsidian_Emerald_Preview.svg'
PNG_PATH = ROOT / 'previews' / 'Linux_Island_Obsidian_Emerald_Preview.png'


def load_font(size, bold=False):
    candidates = (
        ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf']
        if bold else
        ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf']
    )
    for path in candidates:
        if pathlib.Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def build_svg():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820" role="img" aria-labelledby="title desc">
<title id="title">Linux Island — Obsidian Emerald Design System Preview</title>
<desc id="desc">Vector design preview showing Obsidian Emerald dark mode, Cool Mist light mode, pill capsules, expanded telemetry/media card, and core palette swatches.</desc>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{LIGHT['surface.canvas']}"/><stop offset="1" stop-color="{PALETTE['mist']['200']}"/></linearGradient>
<linearGradient id="emeraldGlow" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="{DARK['accent.subtle']}" stop-opacity="0.85"/><stop offset="1" stop-color="{DARK['surface.island']}" stop-opacity="0"/></linearGradient>
<filter id="shadow" x="-25%" y="-40%" width="150%" height="200%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.20"/></filter>
</defs>
<rect width="1280" height="820" fill="url(#bg)"/>
<text x="70" y="76" font-family="DejaVu Sans, sans-serif" font-size="37" font-weight="700" fill="{LIGHT['text.primary']}">Linux Island</text>
<text x="70" y="111" font-family="DejaVu Sans, sans-serif" font-size="17" fill="{LIGHT['text.tertiary']}">Obsidian Emerald  /  Design System v2.0  /  Obsidian · Cool Mist · Vivid Emerald</text>

<!-- Dark Panel -->
<rect x="70" y="146" width="550" height="477" rx="24" fill="{DARK['surface.canvas']}" stroke="{DARK['border.subtle']}" filter="url(#shadow)"/>
<text x="104" y="190" font-family="DejaVu Sans, sans-serif" font-size="17" font-weight="700" fill="{DARK['text.primary']}">DARK THEME</text>
<text x="104" y="214" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{DARK['text.secondary']}">Dynamic Island — Obsidian &amp; Vivid Emerald</text>

<!-- Dark Compact Pill -->
<text x="104" y="272" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{DARK['text.secondary']}">Compact</text>
<rect x="268" y="250" width="160" height="34" rx="17" fill="{DARK['surface.island']}" stroke="{DARK['border.subtle']}"/>
<circle cx="290" cy="267" r="5" fill="{DARK['accent.primary']}"/>
<text x="305" y="271" font-family="DejaVu Sans, sans-serif" font-size="12" font-weight="600" fill="{DARK['text.primary']}">Island</text>
<rect x="364" y="257" width="52" height="20" rx="10" fill="{DARK['accent.subtle']}"/>
<text x="374" y="271" font-family="DejaVu Sans, sans-serif" font-size="11" font-weight="700" fill="{DARK['accent.primary']}">+1.2%</text>

<!-- Dark Action / Preview Pill -->
<text x="104" y="340" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{DARK['text.secondary']}">Action pill</text>
<rect x="220" y="308" width="320" height="56" rx="28" fill="{DARK['surface.island']}" stroke="{DARK['border.subtle']}"/>
<circle cx="248" cy="336" r="18" fill="{DARK['surface.raised']}"/>
<path d="M244 329 V343 L255 336 Z" fill="{DARK['accent.primary']}"/>
<text x="278" y="332" font-family="DejaVu Sans, sans-serif" font-size="12" font-weight="700" fill="{DARK['text.primary']}">Solaris Drift</text>
<text x="278" y="349" font-family="DejaVu Sans, sans-serif" font-size="11" fill="{DARK['text.secondary']}">Ambient Collective</text>
<rect x="462" y="320" width="64" height="32" rx="16" fill="{DARK['control.primary']}"/>
<text x="480" y="341" font-family="DejaVu Sans, sans-serif" font-size="12" font-weight="700" fill="{DARK['text.onAccent']}">Play</text>

<!-- Dark Expanded Card -->
<text x="104" y="484" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{DARK['text.secondary']}">Expanded</text>
<rect x="186" y="390" width="354" height="196" rx="24" fill="{DARK['surface.island']}" stroke="{DARK['border.subtle']}"/>
<rect x="187" y="470" width="352" height="115" rx="23" fill="url(#emeraldGlow)"/>
<text x="210" y="422" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="700" fill="{DARK['text.primary']}">Now Playing</text>
<text x="482" y="422" font-family="DejaVu Sans, sans-serif" font-size="11" fill="{DARK['text.tertiary']}">2m ago</text>
<rect x="210" y="440" width="48" height="48" rx="12" fill="{DARK['surface.raised']}" stroke="{DARK['border.subtle']}"/>
<circle cx="234" cy="464" r="13" stroke="{DARK['accent.primary']}" stroke-width="2" fill="none"/>
<circle cx="234" cy="464" r="3" fill="{DARK['accent.primary']}"/>
<text x="272" y="458" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="700" fill="{DARK['text.primary']}">Night Drive</text>
<text x="272" y="477" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{DARK['text.secondary']}">Sample Artist</text>
<!-- Equalizer capsule bars -->
<rect x="478" y="458" width="5" height="22" rx="2.5" fill="{DARK['surface.raised']}"/>
<rect x="487" y="448" width="5" height="32" rx="2.5" fill="{DARK['accent.primary']}"/>
<rect x="496" y="462" width="5" height="18" rx="2.5" fill="{DARK['surface.raised']}"/>
<rect x="505" y="444" width="5" height="36" rx="2.5" fill="{DARK['accent.primary']}"/>
<rect x="514" y="464" width="5" height="16" rx="2.5" fill="{DARK['surface.raised']}"/>
<!-- Progress + controls -->
<rect x="210" y="505" width="306" height="4" rx="2" fill="{DARK['progress.track']}"/>
<rect x="210" y="505" width="128" height="4" rx="2" fill="{DARK['progress.fill']}"/>
<text x="210" y="525" font-family="DejaVu Sans, sans-serif" font-size="10" fill="{DARK['text.tertiary']}">1:12</text>
<text x="492" y="525" font-family="DejaVu Sans, sans-serif" font-size="10" fill="{DARK['text.tertiary']}">3:04</text>
<circle cx="315" cy="554" r="16" fill="{DARK['control.secondary']}"/>
<path d="M318 548 L309 554 L318 560 Z" fill="{DARK['icon.primary']}"/>
<rect x="342" y="538" width="44" height="32" rx="16" fill="{DARK['control.primary']}"/>
<path d="M359 547 V561 M368 547 V561" stroke="{DARK['icon.onAccent']}" stroke-width="3" stroke-linecap="round"/>
<circle cx="412" cy="554" r="16" fill="{DARK['control.secondary']}"/>
<path d="M408 548 L417 554 L408 560 Z" fill="{DARK['icon.primary']}"/>

<!-- Light Panel -->
<rect x="660" y="146" width="550" height="477" rx="24" fill="{LIGHT['surface.island']}" stroke="{LIGHT['border.subtle']}" filter="url(#shadow)"/>
<text x="694" y="190" font-family="DejaVu Sans, sans-serif" font-size="17" font-weight="700" fill="{LIGHT['text.primary']}">LIGHT THEME</text>
<text x="694" y="214" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{LIGHT['text.secondary']}">Cool Mist surface — deep emerald accessible controls</text>
<text x="694" y="272" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{LIGHT['text.secondary']}">Compact</text>
<rect x="846" y="250" width="160" height="34" rx="17" fill="{LIGHT['surface.raised']}" stroke="{LIGHT['border.subtle']}"/>
<circle cx="870" cy="267" r="5" fill="{LIGHT['accent.primary']}"/>
<text x="886" y="271" font-family="DejaVu Sans, sans-serif" font-size="12" font-weight="600" fill="{LIGHT['text.primary']}">Linux Island</text>
<rect x="780" y="310" width="360" height="216" rx="24" fill="{LIGHT['surface.raised']}" stroke="{LIGHT['border.subtle']}"/>
<text x="804" y="345" font-family="DejaVu Sans, sans-serif" font-size="16" font-weight="700" fill="{LIGHT['text.primary']}">Appearance</text>
<text x="804" y="370" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{LIGHT['text.secondary']}">Island theme</text>
<rect x="804" y="382" width="312" height="41" rx="12" fill="{LIGHT['surface.island']}" stroke="{LIGHT['border.subtle']}"/>
<text x="819" y="408" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{LIGHT['text.primary']}">Obsidian Emerald</text>
<path d="M1090 399 L1096 405 L1102 399" stroke="{LIGHT['accent.primary']}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="804" y="453" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{LIGHT['text.secondary']}">Show preview on hover</text>
<rect x="1067" y="436" width="49" height="25" rx="12.5" fill="{LIGHT['control.primary']}"/>
<circle cx="1102" cy="448.5" r="9.5" fill="{LIGHT['text.onAccent']}"/>
<rect x="804" y="475" width="124" height="34" rx="17" fill="{LIGHT['control.primary']}"/>
<text x="846" y="497" font-family="DejaVu Sans, sans-serif" font-size="12" font-weight="700" fill="{LIGHT['text.onAccent']}">Apply</text>
<rect x="939" y="475" width="124" height="34" rx="17" fill="{LIGHT['surface.island']}" stroke="{LIGHT['border.subtle']}"/>
<text x="983" y="497" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{LIGHT['text.primary']}">Reset</text>
<text x="695" y="552" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{LIGHT['text.tertiary']}">Shared design tokens for GJS and Qt/QML.</text>

<!-- Palette Swatches -->
<text x="70" y="671" font-family="DejaVu Sans, sans-serif" font-size="18" font-weight="700" fill="{LIGHT['text.primary']}">Foundation palette</text>
<rect x="70" y="696" width="200" height="56" rx="12" fill="{PALETTE['obsidian']['900']}" stroke="{LIGHT['border.subtle']}"/><text x="70" y="775" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700" fill="{LIGHT['text.primary']}">Obsidian</text><text x="195" y="775" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{LIGHT['text.tertiary']}">{PALETTE['obsidian']['900']}</text>
<rect x="298" y="696" width="200" height="56" rx="12" fill="{PALETTE['obsidian']['800']}" stroke="{LIGHT['border.subtle']}"/><text x="298" y="775" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700" fill="{LIGHT['text.primary']}">Raised</text><text x="423" y="775" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{LIGHT['text.tertiary']}">{PALETTE['obsidian']['800']}</text>
<rect x="526" y="696" width="200" height="56" rx="12" fill="{PALETTE['obsidian']['300']}" stroke="{LIGHT['border.subtle']}"/><text x="526" y="775" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700" fill="{LIGHT['text.primary']}">Slate</text><text x="651" y="775" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{LIGHT['text.tertiary']}">{PALETTE['obsidian']['300']}</text>
<rect x="754" y="696" width="200" height="56" rx="12" fill="{PALETTE['mist']['300']}" stroke="{LIGHT['border.subtle']}"/><text x="754" y="775" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700" fill="{LIGHT['text.primary']}">Cool Mist</text><text x="879" y="775" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{LIGHT['text.tertiary']}">{PALETTE['mist']['300']}</text>
<rect x="982" y="696" width="200" height="56" rx="12" fill="{DARK['accent.primary']}" stroke="{LIGHT['border.subtle']}"/><text x="982" y="775" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700" fill="{LIGHT['text.primary']}">Emerald</text><text x="1107" y="775" font-family="DejaVu Sans, sans-serif" font-size="12" fill="{LIGHT['text.tertiary']}">{DARK['accent.primary']}</text>
</svg>'''
    SVG_PATH.write_text(svg, encoding='utf-8')


def build_png():
    s = 2  # 2x supersampling for clean anti-aliased edges
    W, H = 1280 * s, 820 * s
    img = Image.new('RGB', (W, H), LIGHT['surface.canvas'])
    d = ImageDraw.Draw(img)

    f_h1 = load_font(36 * s, bold=True)
    f_h2 = load_font(17 * s, bold=True)
    f_sub = load_font(15 * s, bold=False)
    f_body = load_font(13 * s, bold=False)
    f_bold = load_font(13 * s, bold=True)
    f_sm = load_font(11 * s, bold=False)
    f_sm_b = load_font(11 * s, bold=True)

    def rrect(box, r, fill=None, outline=None, width=1):
        x0, y0, x1, y1 = [v * s for v in box]
        d.rounded_rectangle([x0, y0, x1, y1], radius=r * s, fill=fill, outline=outline, width=max(1, width * s) if outline else 0)

    def text(xy, s_txt, font, fill):
        d.text((xy[0] * s, xy[1] * s), s_txt, font=font, fill=fill)

    # Header
    text((70, 40), 'Linux Island', f_h1, LIGHT['text.primary'])
    text((70, 88), 'Obsidian Emerald  /  Design System v2.0  /  Obsidian · Cool Mist · Vivid Emerald', f_sub, LIGHT['text.tertiary'])

    # Dark Card
    rrect((70, 146, 620, 623), 24, fill=DARK['surface.canvas'], outline=DARK['border.subtle'], width=1)
    text((104, 174), 'DARK THEME', f_h2, DARK['text.primary'])
    text((104, 200), 'Dynamic Island — Obsidian & Vivid Emerald', f_body, DARK['text.secondary'])

    # Dark Compact Pill
    text((104, 258), 'Compact', f_body, DARK['text.secondary'])
    rrect((268, 250, 428, 284), 17, fill=DARK['surface.island'], outline=DARK['border.subtle'], width=1)
    d.ellipse([284 * s, 262 * s, 294 * s, 272 * s], fill=DARK['accent.primary'])
    text((304, 259), 'Island', f_bold, DARK['text.primary'])
    rrect((364, 257, 416, 277), 10, fill=DARK['accent.subtle'])
    text((372, 260), '+1.2%', f_sm_b, DARK['accent.primary'])

    # Dark Action Pill
    text((104, 326), 'Action pill', f_body, DARK['text.secondary'])
    rrect((220, 308, 540, 364), 28, fill=DARK['surface.island'], outline=DARK['border.subtle'], width=1)
    d.ellipse([232 * s, 318 * s, 268 * s, 354 * s], fill=DARK['surface.raised'])
    d.polygon([(246 * s, 329 * s), (246 * s, 343 * s), (257 * s, 336 * s)], fill=DARK['accent.primary'])
    text((278, 319), 'Solaris Drift', f_bold, DARK['text.primary'])
    text((278, 338), 'Ambient Collective', f_sm, DARK['text.secondary'])
    rrect((462, 320, 526, 352), 16, fill=DARK['control.primary'])
    text((480, 328), 'Play', f_bold, DARK['text.onAccent'])

    # Dark Expanded Card
    text((104, 476), 'Expanded', f_body, DARK['text.secondary'])
    rrect((186, 390, 540, 586), 24, fill=DARK['surface.island'], outline=DARK['border.subtle'], width=1)
    text((210, 408), 'Now Playing', f_bold, DARK['text.primary'])
    text((476, 410), '2m ago', f_sm, DARK['text.tertiary'])
    rrect((210, 440, 258, 488), 12, fill=DARK['surface.raised'], outline=DARK['border.subtle'], width=1)
    d.ellipse([221 * s, 451 * s, 247 * s, 477 * s], outline=DARK['accent.primary'], width=2 * s)
    text((272, 446), 'Night Drive', f_bold, DARK['text.primary'])
    text((272, 466), 'Sample Artist', f_sm, DARK['text.secondary'])
    for idx, (bx, by0, active) in enumerate([(478, 458, False), (487, 448, True), (496, 462, False), (505, 444, True), (514, 464, False)]):
        rrect((bx, by0, bx + 5, 480), 3, fill=DARK['accent.primary'] if active else DARK['surface.raised'])
    rrect((210, 505, 516, 509), 2, fill=DARK['progress.track'])
    rrect((210, 505, 338, 509), 2, fill=DARK['progress.fill'])
    text((210, 515), '1:12', f_sm, DARK['text.tertiary'])
    text((488, 515), '3:04', f_sm, DARK['text.tertiary'])
    d.ellipse([299 * s, 538 * s, 331 * s, 570 * s], fill=DARK['control.secondary'])
    d.polygon([(318 * s, 548 * s), (309 * s, 554 * s), (318 * s, 560 * s)], fill=DARK['icon.primary'])
    rrect((342, 538, 386, 570), 16, fill=DARK['control.primary'])
    d.rectangle([358 * s, 547 * s, 361 * s, 561 * s], fill=DARK['icon.onAccent'])
    d.rectangle([367 * s, 547 * s, 370 * s, 561 * s], fill=DARK['icon.onAccent'])
    d.ellipse([396 * s, 538 * s, 428 * s, 570 * s], fill=DARK['control.secondary'])
    d.polygon([(408 * s, 548 * s), (417 * s, 554 * s), (408 * s, 560 * s)], fill=DARK['icon.primary'])

    # Light Card
    rrect((660, 146, 1210, 623), 24, fill=LIGHT['surface.island'], outline=LIGHT['border.subtle'], width=1)
    text((694, 174), 'LIGHT THEME', f_h2, LIGHT['text.primary'])
    text((694, 200), 'Cool Mist surface — deep emerald accessible controls', f_body, LIGHT['text.secondary'])
    text((694, 258), 'Compact', f_body, LIGHT['text.secondary'])
    rrect((846, 250, 1006, 284), 17, fill=LIGHT['surface.raised'], outline=LIGHT['border.subtle'], width=1)
    d.ellipse([864 * s, 262 * s, 874 * s, 272 * s], fill=LIGHT['accent.primary'])
    text((884, 259), 'Linux Island', f_bold, LIGHT['text.primary'])

    rrect((780, 310, 1140, 526), 24, fill=LIGHT['surface.raised'], outline=LIGHT['border.subtle'], width=1)
    text((804, 330), 'Appearance', f_h2, LIGHT['text.primary'])
    text((804, 358), 'Island theme', f_body, LIGHT['text.secondary'])
    rrect((804, 382, 1116, 423), 12, fill=LIGHT['surface.island'], outline=LIGHT['border.subtle'], width=1)
    text((819, 394), 'Obsidian Emerald', f_body, LIGHT['text.primary'])
    text((804, 440), 'Show preview on hover', f_body, LIGHT['text.secondary'])
    rrect((1067, 436, 1116, 461), 12, fill=LIGHT['control.primary'])
    d.ellipse([1092 * s, 439 * s, 1111 * s, 458 * s], fill=LIGHT['text.onAccent'])
    rrect((804, 475, 928, 509), 17, fill=LIGHT['control.primary'])
    text((846, 484), 'Apply', f_bold, LIGHT['text.onAccent'])
    rrect((939, 475, 1063, 509), 17, fill=LIGHT['surface.island'], outline=LIGHT['border.subtle'], width=1)
    text((982, 484), 'Reset', f_body, LIGHT['text.primary'])
    text((695, 544), 'Shared design tokens for GJS and Qt/QML.', f_sm, LIGHT['text.tertiary'])

    # Foundation Palette Swatches
    text((70, 654), 'Foundation palette', f_h2, LIGHT['text.primary'])
    swatches = [
        ('Obsidian', PALETTE['obsidian']['900']),
        ('Raised', PALETTE['obsidian']['800']),
        ('Slate', PALETTE['obsidian']['300']),
        ('Cool Mist', PALETTE['mist']['300']),
        ('Emerald', DARK['accent.primary']),
    ]
    for i, (label, hx) in enumerate(swatches):
        x0 = 70 + i * 228
        rrect((x0, 696, x0 + 200, 752), 12, fill=hx, outline=LIGHT['border.subtle'], width=1)
        text((x0, 764), label, f_bold, LIGHT['text.primary'])
        text((x0 + 130, 765), hx, f_sm, LIGHT['text.tertiary'])

    out = img.resize((1280, 820), Image.Resampling.LANCZOS)
    PNG_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.save(PNG_PATH, format='PNG', optimize=True)


def main():
    SVG_PATH.parent.mkdir(parents=True, exist_ok=True)
    build_svg()
    build_png()
    print(f'Generated {SVG_PATH} and {PNG_PATH}')


if __name__ == '__main__':
    main()
