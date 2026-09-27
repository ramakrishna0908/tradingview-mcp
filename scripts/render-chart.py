#!/usr/bin/env python3
"""Render an annotated daily candlestick chart (PNG) from a JSON spec on stdin.

Used by src/social/chart.js. Draws only what the spec contains: real candles,
the report's own levels (support / resistance / price / basis), one annotation
at the last bar, the data timestamp and the configured disclosure. No targets,
no projections — nothing forward-looking is ever drawn.

Spec (JSON on stdin):
{
  "out": "path.png", "width": 1200, "height": 675,
  "symbol": "MCD", "title": "$MCD Bearish exhaustion watch", "badge": "WATCH",
  "direction": "bearish",
  "candles": [{"t": "2026-07-01", "o": 1, "h": 2, "l": 0.5, "c": 1.5}, ...],
  "levels": [{"label": "Resistance $265.80", "value": 265.8, "color": "#ff6b6b", "style": "solid"}, ...],
  "annotation": {"text": "Bearish exhaustion watch", "color": "#ff6b6b"},
  "marks": [{"t": "2026-07-03", "at": "high|low|close", "label": "Jul 3 wick", "color": "#7dd3fc"}, ...],
  "stats": "RSI 35 · CMF -0.23", "footer": "Data: ...", "disclosure": "...", "source": "Chart: ..."
}
"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

BG = (14, 17, 22)
PANEL = (20, 25, 34)
GRID = (38, 43, 51)
TEXT = (200, 205, 212)
MUTED = (139, 143, 152)
UP = (61, 220, 132)
DOWN = (255, 107, 107)
ACCENT = (125, 211, 252)

def body_w_vol(slot):
    return max(3, slot * 0.6)

def fmt_vol(v):
    if v >= 1e9: return f"{v/1e9:.2f}B"
    if v >= 1e6: return f"{v/1e6:.1f}M"
    if v >= 1e3: return f"{v/1e3:.0f}K"
    return f"{v:.0f}"

def hexc(h, default=TEXT):
    if not h: return default
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def font(size, bold=False):
    for path in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(path, size, index=1 if (bold and path.endswith('.ttc')) else 0)
        except Exception:
            continue
    return ImageFont.load_default()

def main():
    spec = json.load(sys.stdin)
    W, H = int(spec.get('width', 1200)), int(spec.get('height', 675))
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    f_title, f_badge, f_lbl, f_small, f_axis = font(30, True), font(18, True), font(17, True), font(15), font(14)

    candles = spec['candles']
    levels = spec.get('levels', [])
    n = len(candles)

    # ── header ──────────────────────────────────────────────────────────────
    d.text((36, 26), spec['title'], font=f_title, fill=(232, 234, 237))
    stats = spec.get('stats', '')
    if stats:
        d.text((36, 66), stats, font=f_small, fill=MUTED)
    badge = spec.get('badge', '')
    if badge:
        bw = d.textlength(badge, font=f_badge) + 28
        bx1, by1 = W - 36 - bw, 30
        colour = UP if spec.get('direction') == 'bullish' else DOWN if spec.get('direction') == 'bearish' else ACCENT
        d.rounded_rectangle((bx1, by1, W - 36, by1 + 36), radius=8, outline=colour, width=2)
        d.text((bx1 + 14, by1 + 8), badge, font=f_badge, fill=colour)

    # ── plot area: price pane on top, volume pane below ─────────────────────
    L, T, R, BOT = 36, 100, W - 236, H - 112
    has_vol = any(c.get('v') for c in candles)
    VT = BOT - 96 if has_vol else BOT      # volume pane top
    B = VT - 26 if has_vol else BOT        # price pane bottom (gap holds the volume caption)
    d.rounded_rectangle((L, T, R, B), radius=10, fill=PANEL, outline=GRID)
    if has_vol:
        d.rounded_rectangle((L, VT, R, BOT), radius=10, fill=PANEL, outline=GRID)

    lo = min(min(c['l'] for c in candles), *[lv['value'] for lv in levels]) if n else 0
    hi = max(max(c['h'] for c in candles), *[lv['value'] for lv in levels]) if n else 1
    pad = (hi - lo) * 0.08 or 1
    lo, hi = lo - pad, hi + pad
    def y(v): return B - (v - lo) / (hi - lo) * (B - T)
    slot = (R - L - 20) / max(n, 1)
    def x(i): return L + 10 + slot * (i + 0.5)

    # grid (axis tick labels are drawn after the level labels so they can yield to them)
    ticks = []
    for k in range(6):
        v = lo + (hi - lo) * k / 5
        yy = y(v)
        d.line((L + 1, yy, R - 1, yy), fill=GRID, width=1)
        ticks.append((yy, f"{v:,.2f}"))

    # Bollinger band shading (report values) — context, not a signal
    band = spec.get('band')
    if band and band.get('upper') is not None and band.get('lower') is not None:
        shade = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shade)
        sd.rectangle((L + 1, y(band['upper']), R - 1, y(band['lower'])), fill=(125, 211, 252, 18))
        img.paste(Image.alpha_composite(img.convert('RGBA'), shade).convert('RGB'))
        d = ImageDraw.Draw(img)

    # date axis
    step = max(1, n // 6)
    for i in range(0, n, step):
        d.text((x(i) - 22, BOT + 8), candles[i]['t'][5:], font=f_axis, fill=MUTED)

    # volume pane: bars coloured by candle direction, dashed 20-bar average
    if has_vol:
        vols = [c.get('v') or 0 for c in candles]
        vmax = max(vols) or 1
        def vy(v): return BOT - 6 - (v / vmax) * (BOT - VT - 14)
        for i, c in enumerate(candles):
            col = UP if c['c'] >= c['o'] else DOWN
            cx = x(i)
            d.rectangle((cx - body_w_vol(slot) / 2, vy(vols[i]), cx + body_w_vol(slot) / 2, BOT - 6), fill=col)
        avg = spec.get('volumeAvg')
        if avg:
            yy = vy(avg)
            xx = L + 1
            while xx < R - 1:
                d.line((xx, yy, min(xx + 10, R - 1), yy), fill=ACCENT, width=2)
                xx += 16
            d.text((R + 12, yy - 8), f"20d avg vol {fmt_vol(avg)}", font=f_axis, fill=ACCENT)
        d.text((L + 2, VT - 20), f"Volume · last bar {fmt_vol(vols[-1])}" + (f" · {spec['volumeRatio']:.1f}× the 20-day average" if spec.get('volumeRatio') else ''), font=f_axis, fill=MUTED)

    # candles
    body_w = max(3, slot * 0.6)
    for i, c in enumerate(candles):
        col = UP if c['c'] >= c['o'] else DOWN
        cx = x(i)
        d.line((cx, y(c['h']), cx, y(c['l'])), fill=col, width=2)
        top, bot = y(max(c['o'], c['c'])), y(min(c['o'], c['c']))
        if bot - top < 1.5: bot = top + 1.5
        d.rectangle((cx - body_w / 2, top, cx + body_w / 2, bot), fill=col)

    # levels — lines across the plot, labels in the right margin, pushed apart
    # so they never overlap each other, with a short leader to the line.
    placed = []
    for lv in sorted(levels, key=lambda lv: y(lv['value'])):
        yy = y(lv['value'])
        ly = max(T + 14, min(B - 14, yy))
        for py in placed:
            if abs(ly - py) < 30:
                ly = py + 30
        placed.append(ly)
        lv['_y'] = yy
        lv['_ly'] = ly
    for lv in levels:
        col = hexc(lv.get('color'))
        yy = lv['_y']
        style = lv.get('style', 'solid')
        if style == 'solid':
            d.line((L + 1, yy, R - 1, yy), fill=col, width=2)
        else:
            dash, gap = (14, 8) if style == 'dashed' else (3, 6)
            xx = L + 1
            while xx < R - 1:
                d.line((xx, yy, min(xx + dash, R - 1), yy), fill=col, width=2)
                xx += dash + gap
        ly = lv['_ly']
        d.line((R, yy, R + 10, ly), fill=col, width=2)  # leader
        lab = lv['label']
        tw = d.textlength(lab, font=f_lbl)
        lx1 = R + 12
        d.rounded_rectangle((lx1, ly - 13, lx1 + tw + 16, ly + 13), radius=6, fill=BG, outline=col)
        d.text((lx1 + 8, ly - 9), lab, font=f_lbl, fill=col)
    for yy, txt in ticks:
        if all(abs(yy - lv['_ly']) > 20 for lv in levels):
            d.text((R + 12, yy - 8), txt, font=f_axis, fill=MUTED)

    # marks — dated touches of a level (wicks, closes, rejections) as rings on
    # the named candle with its date label; only real bars from `candles`
    idx = {c['t']: i for i, c in enumerate(candles)}
    for mk in spec.get('marks', []):
        i = idx.get(mk.get('t'))
        if i is None:
            continue
        c = candles[i]
        at = mk.get('at', 'close')
        v = c['h'] if at == 'high' else c['l'] if at == 'low' else c['c']
        col = hexc(mk.get('color'), ACCENT)
        cx, cy = x(i), y(v)
        d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), outline=col, width=3)
        lab = mk.get('label') or c['t'][5:]
        tw = d.textlength(lab, font=f_axis)
        # label clears the candle: below the wick for lows, above it otherwise
        ly = y(c['l']) + 14 if at == 'low' else y(c['h']) - 26
        ly = max(T + 4, min(B - 22, ly))
        lx = max(L + 4, min(R - tw - 10, cx - tw / 2))
        d.rounded_rectangle((lx - 5, ly - 2, lx + tw + 5, ly + 18), radius=4, fill=PANEL)
        d.text((lx, ly), lab, font=f_axis, fill=col)

    # annotation at the last bar — arrow inside the plot, label to the left
    ann = spec.get('annotation')
    if ann and n:
        last = candles[-1]
        col = hexc(ann.get('color'), ACCENT)
        cx = x(n - 1)
        bearish = spec.get('direction') == 'bearish'
        if bearish:   # arrow pointing down onto the last high, from above
            tip_y = y(last['h']) - 8
            tail_y = max(T + 40, tip_y - 70)
            d.line((cx, tail_y, cx, tip_y), fill=col, width=3)
            d.polygon([(cx, tip_y), (cx - 7, tip_y - 12), (cx + 7, tip_y - 12)], fill=col)
            ty = tail_y - 30
        else:         # arrow pointing up onto the last low, from below
            tip_y = y(last['l']) + 8
            tail_y = min(B - 40, tip_y + 70)
            d.line((cx, tail_y, cx, tip_y), fill=col, width=3)
            d.polygon([(cx, tip_y), (cx - 7, tip_y + 12), (cx + 7, tip_y + 12)], fill=col)
            ty = tail_y + 6
        text = ann['text']
        tw = d.textlength(text, font=f_lbl)
        tx2 = cx - 6
        tx1 = max(L + 8, tx2 - tw - 16)
        ty = max(T + 6, min(B - 32, ty))
        d.rounded_rectangle((tx1, ty, tx1 + tw + 16, ty + 26), radius=6, fill=col)
        d.text((tx1 + 8, ty + 4), text, font=f_lbl, fill=BG)

    # footer
    d.text((36, H - 78), spec.get('footer', ''), font=f_small, fill=MUTED)
    d.text((36, H - 56), spec.get('source', ''), font=f_small, fill=MUTED)
    if spec.get('disclosure'):
        d.text((36, H - 32), spec['disclosure'], font=f_small, fill=TEXT)

    img.save(spec['out'], 'PNG', optimize=True)
    print(spec['out'])

if __name__ == '__main__':
    main()
