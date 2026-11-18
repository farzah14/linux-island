#!/usr/bin/env python3
"""Generate static HTML style guide specimen from design-system/tokens/tokens.json."""
import html
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'tokens' / 'tokens.json').read_text())


def vars_for(theme):
    return '\n'.join(f'--{key.replace(".", "-")}: {val};' for key, val in DATA['semantic'][theme].items())


def main():
    light = DATA['semantic']['light']
    dark = DATA['semantic']['dark']
    palette = DATA['palette']

    swatches = [
        ('Obsidian 900', palette['obsidian']['900']),
        ('Obsidian 800', palette['obsidian']['800']),
        ('Mist 300', palette['mist']['300']),
        ('Slate 300', palette['obsidian']['300']),
        ('Emerald Dark', dark['accent.primary']),
        ('Emerald Light', light['accent.primary']),
    ]

    swatch_html = '\n'.join(
        f'<div class="swatch"><div class="swatch-ink" style="background:{hexval}"></div>'
        f'<div class="swatch-info">{html.escape(name)}<small>{hexval}</small></div></div>'
        for name, hexval in swatches
    )

    panels_html = ''
    for label, cls, subtitle in [
        ('Dark', 'dark', 'Obsidian / Emerald #59D66C'),
        ('Light', 'light', 'Cool Mist / Deep Emerald #147A38'),
    ]:
        panels_html += f'''<article class="theme {cls}">
  <div class="themehead"><h3>{label} theme</h3><small>{subtitle}</small></div>
  <div class="sample-label">Compact pill</div>
  <div class="compact capsule"><span class="dot"></span><span>Island</span><span class="delta">+1.2%</span></div>

  <div class="sample-label">Preview / action pill</div>
  <div class="preview capsule">
    <div class="artwork circle">♫</div>
    <div class="titles"><div class="primary-text ellipsis">Night Drive</div><div class="secondary-text ellipsis">Sample Artist · Playing</div></div>
    <button class="pill-cta" type="button">Play</button>
  </div>

  <div class="sample-label">Utility / progress ring</div>
  <div class="preview capsule">
    <div class="artwork circle">🔔</div>
    <div class="titles"><div class="primary-text ellipsis">Focus Session</div><div class="secondary-text ellipsis">25m Pomodoro</div></div>
    <div class="ring" aria-label="73 percent"><span>73%</span></div>
  </div>

  <div class="sample-label">Peek / incoming</div>
  <div class="peek capsule">
    <div class="peektop"><span class="dot"></span> Calendar · Reminder</div>
    <div class="sub">Project review starts in 15 minutes.</div>
  </div>

  <div class="sample-label">Expanded / media &amp; telemetry</div>
  <div class="expanded capsule">
    <div class="heading"><span>Now Playing</span><span>2m ago</span></div>
    <div class="preview" style="width:100%;min-height:unset;padding:0;background:transparent;border:0;box-shadow:none">
      <div class="artwork" style="width:48px;height:48px;border-radius:12px">♫</div>
      <div class="titles"><div class="primary-text ellipsis">Solaris Drift</div><div class="secondary-text ellipsis">Warm Ambient Collective</div></div>
      <div class="eq-bars" aria-hidden="true"><span style="height:40%"></span><span class="active" style="height:85%"></span><span style="height:55%"></span><span class="active" style="height:95%"></span><span style="height:35%"></span></div>
    </div>
    <div class="track"><div></div></div>
    <div class="times"><span>1:02</span><span>3:04</span></div>
    <div class="controls">
      <button class="control" aria-label="Previous">‹‹</button>
      <button class="control main" aria-label="Pause">Ⅱ</button>
      <button class="control" aria-label="Next">››</button>
    </div>
  </div>
</article>'''

    preview = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Linux Island — Obsidian Emerald Design System v2.0</title>
<style>
:root {{ color-scheme: light; --page: {light['surface.canvas']}; --ink: {light['text.primary']}; --muted: {light['text.tertiary']}; --card: {light['surface.island']}; --line: {light['border.subtle']}; }}
* {{ box-sizing: border-box; }}
body {{ font-family: system-ui, Cantarell, "Noto Sans", sans-serif; background: var(--page); color: var(--ink); margin: 0; }}
.shell {{ max-width: 1180px; margin: 0 auto; padding: 52px 30px 80px; }}
.top {{ display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: start; border-bottom: 1px solid var(--line); padding-bottom: 30px; }}
h1 {{ margin: 0 0 10px; font-size: clamp(28px, 4vw, 48px); font-weight: 700; letter-spacing: -.04em; }}
.lede {{ margin: 0; color: {light['text.secondary']}; font-size: 15px; max-width: 640px; line-height: 1.65; }}
.tag {{ display: inline-flex; border-radius: 999px; border: 1px solid var(--line); background: var(--card); padding: 7px 13px; font-size: 12px; font-weight: 650; white-space: nowrap; }}
section {{ margin-top: 42px; }}
h2 {{ font-size: 18px; letter-spacing: -.02em; margin: 0 0 10px; }}
.subtitle {{ margin: 0 0 20px; color: var(--muted); font-size: 13px; line-height: 1.65; }}
.palette {{ display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 10px; }}
.swatch {{ background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }}
.swatch-ink {{ height: 73px; }}
.swatch-info {{ padding: 10px 12px 12px; font-size: 12px; font-weight: 600; }}
.swatch-info small {{ display: block; color: var(--muted); font-size: 11px; padding-top: 4px; font-weight: 500; }}
.panels {{ display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px; }}
.theme {{ border-radius: 24px; padding: 28px 20px 24px; background: var(--surface-canvas); color: var(--text-primary); border: 1px solid var(--border-subtle); }}
.theme.dark {{ {vars_for('dark')} }}
.theme.light {{ {vars_for('light')} }}
.themehead {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; }}
.themehead h3 {{ font-size: 15px; margin: 0; letter-spacing: -.02em; }}
.themehead small {{ font-size: 11px; color: var(--text-secondary); }}
.sample-label {{ font-size: 10px; font-weight: 700; letter-spacing: .12em; color: var(--text-tertiary); margin: 16px 0 8px; text-transform: uppercase; }}
.capsule {{ background: var(--surface-island); border: 1px solid var(--border-subtle); color: var(--text-primary); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28); }}
.compact {{ min-width: 148px; width: fit-content; height: 34px; padding: 0 14px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 650; }}
.dot {{ width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary); }}
.delta {{ font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: var(--accent-subtle); color: var(--accent-primary); }}
.preview {{ width: min(312px, 100%); min-height: 56px; border-radius: 999px; display: flex; align-items: center; gap: 10px; padding: 8px 10px; }}
.artwork {{ width: 38px; height: 38px; background: var(--surface-raised); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 16px; flex: 0 0 auto; }}
.artwork.circle {{ border-radius: 999px; }}
.ellipsis {{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.preview .titles {{ min-width: 0; flex: 1; }}
.primary-text {{ color: var(--text-primary); font-size: 13px; font-weight: 650; }}
.secondary-text {{ color: var(--text-secondary); font-size: 11px; }}
.pill-cta {{ border: 0; border-radius: 999px; padding: 7px 14px; background: var(--control-primary); color: var(--text-onAccent); font-size: 12px; font-weight: 700; cursor: pointer; }}
.ring {{ width: 36px; height: 36px; border-radius: 999px; background: conic-gradient(var(--progress-fill) 73%, var(--progress-track) 0); display: grid; place-items: center; flex: 0 0 auto; }}
.ring span {{ width: 28px; height: 28px; border-radius: 999px; background: var(--surface-island); display: grid; place-items: center; font-size: 10px; font-weight: 700; color: var(--text-primary); }}
.peek {{ width: min(296px, 100%); min-height: 72px; border-radius: 24px; padding: 13px 15px; }}
.peektop {{ font-size: 12px; font-weight: 650; display: flex; gap: 7px; align-items: center; }}
.peek .sub {{ color: var(--text-secondary); font-size: 12px; margin-top: 6px; line-height: 1.35; }}
.expanded {{ width: min(360px, 100%); min-height: 184px; border-radius: 24px; padding: 16px; }}
.expanded .heading {{ display: flex; justify-content: space-between; font-size: 13px; font-weight: 650; margin-bottom: 12px; }}
.expanded .heading span:last-child {{ color: var(--text-tertiary); font-size: 11px; }}
.eq-bars {{ display: flex; align-items: flex-end; gap: 3px; height: 26px; }}
.eq-bars span {{ width: 4px; border-radius: 999px; background: var(--surface-raised); }}
.eq-bars span.active {{ background: var(--accent-primary); }}
.track {{ height: 4px; background: var(--progress-track); border-radius: 99px; margin: 15px 0 6px; overflow: hidden; }}
.track > div {{ width: 34%; height: 100%; background: var(--progress-fill); border-radius: inherit; }}
.times {{ display: flex; justify-content: space-between; color: var(--text-tertiary); font-size: 11px; }}
.controls {{ display: flex; justify-content: center; gap: 14px; margin-top: 8px; }}
.control {{ width: 36px; height: 36px; border: 0; background: var(--control-secondary); color: var(--icon-primary); font-size: 14px; border-radius: 999px; display: flex; justify-content: center; align-items: center; }}
.control.main {{ width: 48px; background: var(--control-primary); color: var(--text-onAccent); font-weight: 700; }}
.control:focus-visible {{ outline: 2px solid var(--border-focus); outline-offset: 2px; }}
.chips {{ display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }}
.metric {{ background: var(--card); padding: 16px; border-radius: 14px; border: 1px solid var(--line); }}
.metric b {{ font-size: 18px; display: block; margin: 4px 0; }}
.metric small {{ display: block; color: var(--muted); font-size: 11px; }}
.hint {{ margin-top: 34px; background: {light['surface.raised']}; color: {light['text.secondary']}; padding: 16px 18px; border-radius: 14px; line-height: 1.6; font-size: 13px; border: 1px solid var(--line); }}
@media (max-width: 780px) {{ .panels {{ grid-template-columns: 1fr; }} .palette {{ grid-template-columns: repeat(3,minmax(0,1fr)); }} .shell {{ padding: 28px 16px 45px; }} }}
@media (max-width: 450px) {{ .palette {{ grid-template-columns: repeat(2,minmax(0,1fr)); }} .chips {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body><main class="shell">
<header class="top"><div><h1>Linux Island<span style="color:{light['accent.primary']}">.</span></h1><p class="lede">Obsidian Emerald design system (v2.0.0). High-contrast obsidian capsules, circular dark-elevated badges, cool mist light surfaces, and vivid emerald accents built for dynamic desktop telemetry and media controls.</p></div><span class="tag">DESIGN SYSTEM / V2.0</span></header>
<section><h2>01 / Color foundations</h2><p class="subtitle">Obsidian surfaces anchor high-contrast legibility; Cool Mist mirrors the light system frame. Vivid emerald marks primary intent and active telemetry, stepping to deep emerald on light surfaces for WCAG AA compliance.</p><div class="palette">
{swatch_html}
</div></section>
<section><h2>02 / Island states &amp; widget patterns</h2><p class="subtitle">The same semantic component anatomy across both dark and light themes. Static visual specimen generated from <code>tokens/tokens.json</code>.</p>
<div class="panels">
{panels_html}
</div></section>
<section><h2>03 / Component rules</h2><p class="subtitle">Consistent capsule, pill, and panel metrics shared by GNOME GJS and Qt6 QML.</p><div class="chips"><div class="metric"><small>CAPSULE</small><b>124 × 32</b><small>999px pill corners</small></div><div class="metric"><small>EXPANDED PANEL</small><b>360 × 184+</b><small>24px panel corners, max height 320</small></div><div class="metric"><small>MOTION</small><b>220 ms</b><small>Standard ease-out, no bounce</small></div></div></section>
<div class="hint"><strong>Implementation note.</strong> Colors and dimensions are generated from the Obsidian Emerald token baseline (<code>tokens/tokens.json</code>). GNOME Shell integration, responsive behavior, focus management, notifications, and animation must be validated independently on Ubuntu GNOME Wayland.</div>
</main></body></html>'''

    out = ROOT / 'STYLE_GUIDE_PREVIEW.html'
    out.write_text(preview, encoding='utf-8')
    print(out)


if __name__ == '__main__':
    main()
