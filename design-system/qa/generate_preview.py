import json, pathlib, html
root=pathlib.Path(__file__).resolve().parents[1]
data=json.loads((root/'tokens'/'tokens.json').read_text())

def vars_for(theme):
    return '\n'.join(f'--{key.replace(".", "-")}: {val};' for key,val in data['semantic'][theme].items())

preview='''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Linux Island — Warm Minimalist Design System v1.0</title>
<style>
:root { color-scheme: light; --page: #F4F0E9; --ink: #292621; --muted: #665E53; }
* { box-sizing: border-box; }
body { font-family: system-ui, Cantarell, "Noto Sans", sans-serif; background: var(--page); color: var(--ink); margin: 0; }
.shell { max-width: 1180px; margin: 0 auto; padding: 52px 30px 80px; }
.top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: start; border-bottom: 1px solid #D5C9B9; padding-bottom: 30px; }
h1 { margin: 0 0 10px; font-size: clamp(28px, 4vw, 48px); font-weight: 650; letter-spacing: -.05em; }
.lede { margin: 0; color: #5D554B; font-size: 15px; max-width: 640px; line-height: 1.65; }
.tag { display: inline-flex; border-radius: 999px; border: 1px solid #C7BCAE; padding: 7px 13px; font-size: 12px; font-weight: 650; white-space: nowrap; }
section { margin-top: 42px; }
h2 { font-size: 18px; letter-spacing: -.02em; margin: 0 0 10px; }
.subtitle { margin: 0 0 20px; color: #665E53; font-size: 13px; line-height: 1.65; }
.legend { display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0 24px; }
.legend span { border: 1px solid #C7BCAE; border-radius: 999px; padding: 6px 10px; font-size: 12px; color: #5D554B; }
.palette { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 10px; }
.swatch { background: #FBF8F1; border: 1px solid #DDD4C6; border-radius: 12px; overflow: hidden; }
.swatch-ink { height: 73px; }
.swatch-info { padding: 10px 12px 12px; font-size: 12px; }
.swatch-info small { display: block; color: #665E53; font-size: 11px; padding-top: 4px; }
.panels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.theme { border-radius: 20px; padding: 28px 20px 24px; min-height: 425px; background: var(--surface-canvas); color: var(--text-primary); border: 1px solid var(--border-subtle); }
.theme.dark { '''+vars_for('dark')+''' }
.theme.light { '''+vars_for('light')+''' }
.themehead { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 22px; }
.themehead h3 { font-size: 15px; margin: 0; letter-spacing: -.02em; }
.themehead small { font-size: 11px; color: var(--text-secondary); }
.sample-label { font-size: 10px; font-weight: 750; letter-spacing: .12em; color: var(--text-tertiary); margin: 18px 0 9px; text-transform: uppercase; }
.inline { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.capsule { background: var(--surface-island); border: 1px solid var(--border-subtle); color: var(--text-primary); box-shadow: 0 6px 18px #00000012; }
.compact { width: 124px; height: 32px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 650; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary); }
.preview { width: 248px; min-height: 56px; border-radius: 20px; display: flex; align-items: center; gap: 10px; padding: 7px 10px; }
.artwork { width: 40px; height: 40px; background: var(--surface-raised); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 18px; flex: 0 0 auto; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preview .titles { min-width: 0; flex: 1; }
.primary-text { color: var(--text-primary); font-size: 13px; font-weight: 650; }
.secondary-text { color: var(--text-secondary); font-size: 12px; }
.peek { width: min(296px, 100%); min-height: 72px; border-radius: 20px; padding: 13px; }
.peektop { font-size: 12px; font-weight: 650; display: flex; gap: 7px; align-items: center; }
.peek .sub { color: var(--text-secondary); font-size: 12px; margin-top: 6px; line-height: 1.35; }
.expanded { width: min(360px, 100%); min-height: 184px; border-radius: 24px; padding: 16px; }
.expanded .heading { display: flex; justify-content: space-between; font-size: 14px; font-weight: 650; margin-bottom: 13px; }
.expanded .heading span:last-child { color: var(--text-tertiary); }
.track { height: 4px; background: var(--progress-track); border-radius: 99px; margin: 15px 0 6px; overflow: hidden; }
.track > div { width: 34%; height: 100%; background: var(--progress-fill); border-radius: inherit; }
.times { display: flex; justify-content: space-between; color: var(--text-tertiary); font-size: 11px; }
.controls { display: flex; justify-content: center; gap: 14px; margin-top: 8px; }
.control { width: 40px; height: 40px; border: 0; background: var(--control-secondary); color: var(--icon-primary); font-size: 16px; border-radius: 100px; display: flex; justify-content: center; align-items: center; }
.control.main { background: var(--control-primary); color: var(--text-onAccent); }
.control:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.chips { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.metric { background: #FBF8F1; padding: 16px; border-radius: 12px; border: 1px solid #DDD4C6; }
.metric b { font-size: 18px; display: block; margin: 4px 0; }
.metric small { display: block; color: #665E53; font-size: 11px; }
.hint { margin-top: 34px; background: #EEE9DF; color: #5D554B; padding: 16px 18px; border-radius: 12px; line-height: 1.6; font-size: 13px; }
@media (max-width: 780px) { .panels { grid-template-columns: 1fr; } .palette { grid-template-columns: repeat(3,minmax(0,1fr)); } .shell { padding: 28px 16px 45px; } }
@media (max-width: 450px) { .palette { grid-template-columns: repeat(2,minmax(0,1fr)); } .chips { grid-template-columns: 1fr; } }
</style>
</head>
<body><main class="shell">
<header class="top"><div><h1>Linux Island<span style="color:#A97639">.</span></h1><p class="lede">Warm Minimalist design system. A refined graphite, cream and amber interface for desktop Linux—quiet, context-aware, and built around actual usage rather than animation for animation’s sake.</p></div><span class="tag">DESIGN SYSTEM / V1.0</span></header>
<section><h2>01 / Color foundations</h2><p class="subtitle">Warm graphite provides structure; cream adds breathing room. Soft amber marks active intent, with darker amber for accessible controls on light surfaces.</p><div class="palette">
'''
colors=[('Graphite 900','#191816'),('Graphite 800','#302D28'),('Cream 200','#EEE9DF'),('Stone 500','#898278'),('Amber Dark','#D8B77F'),('Amber Light','#80551F')]
for name,hexval in colors:
    preview+=f'<div class="swatch"><div class="swatch-ink" style="background:{hexval}"></div><div class="swatch-info">{html.escape(name)}<small>{hexval}</small></div></div>\n'
preview+='''</div></section>
<section><h2>02 / Island states</h2><p class="subtitle">The same component anatomy across both themes. Illustration only: not a working GNOME extension or a compositor simulation.</p>
<div class="panels">
'''
for label,cls in [('Dark','dark'),('Light','light')]:
    preview+=f'''<article class="theme {cls}"><div class="themehead"><h3>{label} theme</h3><small>{'Graphite / Amber 300' if cls=='dark' else 'Cream / Amber 800'}</small></div>
<div class="sample-label">Compact</div><div class="compact capsule"><span class="dot"></span> Island</div>
<div class="sample-label">Preview / hover</div><div class="preview capsule"><div class="artwork">♫</div><div class="titles"><div class="primary-text ellipsis">Night Drive</div><div class="secondary-text ellipsis">Sample Artist · Playing</div></div></div>
<div class="sample-label">Peek / incoming</div><div class="peek capsule"><div class="peektop"><span class="dot"></span> Calendar · Reminder</div><div class="sub">Project review starts in 15 minutes.</div></div>
<div class="sample-label">Expanded / click</div><div class="expanded capsule"><div class="heading"><span>Now Playing</span><span>···</span></div><div class="preview" style="width:100%;min-height:unset;padding:0"><div class="artwork" style="width:48px;height:48px">♫</div><div class="titles"><div class="primary-text ellipsis">Night Drive</div><div class="secondary-text ellipsis">Sample Artist</div></div></div><div class="track"><div></div></div><div class="times"><span>1:02</span><span>3:04</span></div><div class="controls"><button class="control" aria-label="Previous">‹‹</button><button class="control main" aria-label="Pause">Ⅱ</button><button class="control" aria-label="Next">››</button></div></div>
</article>'''
preview+='''</div></section><section><h2>03 / Component rules</h2><p class="subtitle">A small vocabulary that scales to new features without changing the design language.</p><div class="chips"><div class="metric"><small>CAPSULE</small><b>124 × 32</b><small>Default / compact</small></div><div class="metric"><small>EXPANDED PANEL</small><b>360 × 184+</b><small>Maximum height 320</small></div><div class="metric"><small>MOTION</small><b>220 ms</b><small>Standard ease-out, no bounce</small></div></div></section>
<div class="hint"><strong>Implementation note.</strong> These examples are static design specimens. Colors and dimensions are generated from the Warm Minimalist design token baseline; GNOME Shell integration, responsive behavior, focus management, notifications, and animation must be validated independently on Ubuntu GNOME Wayland. The canonical specification is <code>DESIGN_SYSTEM.md</code>.</div>
</main></body></html>'''
(root/'STYLE_GUIDE_PREVIEW.html').write_text(preview)
print(root/'STYLE_GUIDE_PREVIEW.html')
