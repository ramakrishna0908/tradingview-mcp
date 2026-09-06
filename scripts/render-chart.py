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

    # ── plot area ───────────────────────────────────────────────────────────
    L, T, R, B = 36, 100, W - 236, H - 112
    d.rounded_rectangle((L, T, R, B), radius=10, fill=PANEL, outline=GRID)

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

    # date axis
    step = max(1, n // 6)
    for i in range(0, n, step):
        d.text((x(i) - 22, B + 8), candles[i]['t'][5:], font=f_axis, fill=MUTED)

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
