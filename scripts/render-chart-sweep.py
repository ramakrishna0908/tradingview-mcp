#!/usr/bin/env python3
"""Render the Daily Setup Sweep chart card (PNG) from a JSON spec on stdin.

Used by src/social/chart.js when charts.style = "sweep". Mobile-first: a
near-square canvas, large type, high contrast, and only the figures the post
itself states — the report's two levels and current price, RSI, CMF, RVOL,
the setup verdict, the data timestamp and the disclaimer. The 20-day MA is
drawn from the same Yahoo closes as the candles and labelled as such.
Nothing forward-looking is drawn: no targets, no projections, no taglines.

Spec (JSON on stdin) — see buildSweepChartSpec in src/social/chart.js.
"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

BG = (10, 14, 24)
PANEL = (16, 22, 36)
PANEL2 = (22, 30, 46)
GRID = (34, 42, 60)
TEXT = (232, 236, 242)
MUTED = (140, 150, 168)
GREEN = (34, 197, 94)
RED = (239, 68, 68)
BLUE = (56, 189, 248)
AMBER = (251, 191, 36)


def hexc(h, default=TEXT):
    if not h:
        return default
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def font(size, bold=False):
    for path in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(path, size, index=1 if (bold and path.endswith('.ttc')) else 0)
        except Exception:
            continue
    return ImageFont.load_default()


def fmt_vol(v):
    if v >= 1e9: return f"{v / 1e9:.2f}B"
    if v >= 1e6: return f"{v / 1e6:.1f}M"
    if v >= 1e3: return f"{v / 1e3:.0f}K"
    return f"{v:.0f}"


def dashed(d, x1, y, x2, col, dash=12, gap=8, width=2):
    xx = x1
    while xx < x2:
        d.line((xx, y, min(xx + dash, x2), y), fill=col, width=width)
        xx += dash + gap


def tick_fmt(v):
    a = abs(v)
    if a >= 1000: return f"{v:,.0f}"
    if a >= 1: return f"{v:,.2f}"
    if a >= 0.1: return f"{v:.4f}"
    if a >= 0.001: return f"{v:.5f}"
    return f"{v:.7f}"


def fit_font(d, text, maxw, size, bold=True, floor=20):
    """Largest font (down to floor) at which text fits maxw."""
    while size > floor and d.textlength(text, font=font(size, bold)) > maxw:
        size -= 2
    return font(size, bold)


def render_scorecard(spec):
    """The Friday scorecard card, compact: five counts, Lesson of the Week,
    Watching Next Week, what resolved, the accountability line, disclaimer.
    The canvas height follows the content, so there is no dead space."""
    W = int(spec.get('width', 1200))
    H_MAX = 2000
    img = Image.new('RGB', (W, H_MAX), BG)
    d = ImageDraw.Draw(img)
    M, GAP = 44, 16
    COL = {'green': GREEN, 'red': RED, 'blue': BLUE, 'amber': AMBER, 'muted': MUTED}

    # header
    d.text((M, 32), spec.get('title', 'Weekly Setup Scorecard'), font=font(46, True), fill=TEXT)
    d.text((M, 90), spec.get('range', ''), font=font(22), fill=MUTED)
    if spec.get('brand'):
        f_b = font(20, True)
        bw = d.textlength(spec['brand'], font=f_b)
        d.text((W - M - bw, 38), spec['brand'], font=f_b, fill=TEXT)
        if spec.get('tagline'):
            f_t = font(15)
            tw = d.textlength(spec['tagline'], font=f_t)
            d.text((W - M - tw, 66), spec['tagline'], font=f_t, fill=MUTED)

    # five count tiles
    tiles = spec.get('tiles', [])
    TT, TH = 136, 124
    n = max(len(tiles), 1)
    tw_each = (W - 2 * M - GAP * (n - 1)) / n
    for i, t in enumerate(tiles):
        x1 = M + i * (tw_each + GAP)
        col = COL.get(t.get('color'), BLUE)
        d.rounded_rectangle((x1, TT, x1 + tw_each, TT + TH), radius=14, fill=PANEL, outline=GRID)
        d.rectangle((x1, TT + 14, x1 + 5, TT + TH - 14), fill=col)
        d.text((x1 + 22, TT + 14), t.get('label', ''), font=font(17), fill=MUTED)
        val = str(t.get('value', ''))
        d.text((x1 + 22, TT + 38), val, font=fit_font(d, val, tw_each - 40, 54), fill=col)
        if t.get('sub'):
            d.text((x1 + 22, TT + TH - 28), t['sub'], font=fit_font(d, t['sub'], tw_each - 40, 15, bold=False, floor=11), fill=MUTED)
    y = TT + TH + GAP

    # Lesson of the Week (left) · Watching Next Week (right)
    LW = (W - 2 * M - GAP) * 0.58
    RX = M + LW + GAP
    RW = W - M - RX
    f_lesson = font(25)
    lesson_lines = wrap_text(d, spec.get('lesson', ''), f_lesson, LW - 56)
    lesson_h = 58 + len(lesson_lines) * 34 + 18
    f_chip = font(21, True)
    chips, cx, cy = [], 0, 0
    for sym in spec.get('watching', []):
        label = f"${sym}"
        cw = d.textlength(label, font=f_chip) + 30
        if cx and cx + cw > RW - 48:
            cx, cy = 0, cy + 46
        chips.append((cx, cy, cw, label))
        cx += cw + 10
    watch_h = 58 + ((cy + 46) if chips else 34) + 14
    ph = max(lesson_h, watch_h, 150)

    d.rounded_rectangle((M, y, M + LW, y + ph), radius=14, fill=PANEL2, outline=GRID)
    d.rectangle((M, y + 14, M + 5, y + ph - 14), fill=AMBER)
    d.text((M + 28, y + 18), 'LESSON OF THE WEEK', font=font(17, True), fill=AMBER)
    for k, line in enumerate(lesson_lines):
        d.text((M + 28, y + 54 + k * 34), line, font=f_lesson, fill=TEXT)

    d.rounded_rectangle((RX, y, RX + RW, y + ph), radius=14, fill=PANEL2, outline=GRID)
    d.rectangle((RX, y + 14, RX + 5, y + ph - 14), fill=BLUE)
    d.text((RX + 28, y + 18), 'WATCHING NEXT WEEK', font=font(17, True), fill=BLUE)
    for (ox, oy, cw, label) in chips:
        bx, by = RX + 28 + ox, y + 56 + oy
        d.rounded_rectangle((bx, by, bx + cw, by + 36), radius=18, fill=PANEL, outline=BLUE)
        d.text((bx + 15, by + 6), label, font=f_chip, fill=TEXT)
    if not chips:
        d.text((RX + 28, y + 58), 'No open setups carry over.', font=font(19), fill=MUTED)
    y += ph + GAP

    # what resolved this week (only when something did)
    resolved = spec.get('resolved', [])
    if resolved:
        d.text((M, y), 'Resolved this week', font=font(18, True), fill=TEXT)
        rx, ry = M, y + 32
        f_r = font(18, True)
        for r in resolved:
            col = COL.get(r.get('color'), BLUE)
            label = f"${r.get('symbol', '')}  {r.get('outcome', '')}"
            cw = d.textlength(label, font=f_r) + 44
            if rx > M and rx + cw > W - M:
                rx, ry = M, ry + 44
            d.rounded_rectangle((rx, ry, rx + cw, ry + 36), radius=8, fill=PANEL, outline=GRID)
            d.ellipse((rx + 12, ry + 11, rx + 26, ry + 25), fill=col)
            d.text((rx + 34, ry + 7), label, font=f_r, fill=TEXT)
            rx += cw + 10
        y = ry + 36 + GAP

    # accountability strip
    if spec.get('accountability'):
        AH = 58
        d.rounded_rectangle((M, y, W - M, y + AH), radius=14, fill=PANEL, outline=GRID)
        f_a = font(24, True)
        aw = d.textlength(spec['accountability'], font=f_a)
        d.text(((W - aw) / 2, y + 15), spec['accountability'], font=f_a, fill=TEXT)
        y += AH + 20

    # footer: disclaimer, then data/method line
    if spec.get('disclosure'):
        d.text((M, y), spec['disclosure'], font=font(17), fill=TEXT)
        y += 28
    if spec.get('footer'):
        f_f = font(15)
        for line in wrap_text(d, spec['footer'], f_f, W - 2 * M):
            d.text((M, y), line, font=f_f, fill=MUTED)
            y += 22
    y += 22
    img.crop((0, 0, W, min(int(y), H_MAX))).save(spec['out'], 'PNG', optimize=True)
    print(spec['out'])


# ─── explainer card ─────────────────────────────────────────────────────────

COLOR = {'green': GREEN, 'red': RED, 'blue': BLUE, 'amber': AMBER}


def draw_art(img, d, art, box):
    """Draw one illustration spec into box=(x1,y1,x2,y2). Coordinates in the
    spec are 0-100 with y up; nothing here is market data."""
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=12, fill=PANEL2, outline=GRID)
    pad = 14
    vols = art.get('vols')
    vol_h = 0.22 * (y2 - y1) if vols else 0
    px1, py1, px2, py2 = x1 + pad, y1 + pad, x2 - pad, y2 - pad - vol_h
    kind = art.get('type')
    # Fit the vertical range to the data (plus a margin) so a spec that only
    # spans 30-70 still fills the panel; oscillators keep their fixed scale.
    if kind == 'osc':
        lo_v, hi_v = 0.0, 100.0
    else:
        vals = []
        for b in art.get('bars', []): vals += [b[1], b[2]]
        for pt in art.get('points', []): vals.append(pt[1])
        for lv in art.get('levels', []): vals.append(lv['y'])
        tr = art.get('trend')
        if tr: vals += [tr['from'][1], tr['to'][1]]
        for pt in art.get('ma', []): vals.append(pt[1])
        band = art.get('band')
        if band:
            for pt in band['upper'] + band['lower']: vals.append(pt[1])
        lo_v, hi_v = (min(vals), max(vals)) if vals else (0.0, 100.0)
        m = (hi_v - lo_v) * 0.12 or 5
        lo_v, hi_v = lo_v - m, hi_v + m
    def X(v): return px1 + (px2 - px1) * v / 100.0
    def Y(v): return py2 - (py2 - py1) * (v - lo_v) / (hi_v - lo_v)

    def level_line(y, label, col):
        dashed(d, px1, Y(y), px2, col, dash=8, gap=6)
        if label:
            f = font(13, True)
            tw = d.textlength(label, font=f)
            # Put the label on the side whose last/first bars leave the level
            # clear, so it never sits on top of a highlighted candle.
            bars = art.get('bars') or []
            def crowded(seg):
                return any(b[2] - 4 <= y <= b[1] + 4 for b in seg)
            right_busy = crowded(bars[-3:]) if bars else False
            left_busy = crowded(bars[:3]) if bars else False
            if right_busy and not left_busy:
                lx1 = px1 + 2
            else:
                lx1 = px2 - tw - 14
            d.rounded_rectangle((lx1, Y(y) - 10, lx1 + tw + 12, Y(y) + 10), radius=5, fill=BG, outline=col)
            d.text((lx1 + 6, Y(y) - 8), label, font=f, fill=col)

    if kind == 'candles':
        bars = art['bars']
        n = len(bars)
        slot = (px2 - px1) / n
        bw = max(4, slot * 0.55)
        hl = set(art.get('highlight', []))
        for lv in art.get('levels', []):
            level_line(lv['y'], lv.get('label'), COLOR.get(lv.get('color'), BLUE))
        for i, (o, h, l, c) in enumerate(bars):
            cx = px1 + slot * (i + 0.5)
            col = GREEN if c >= o else RED
            if hl and i not in hl:
                col = tuple(int(v * 0.45 + 20) for v in col)
            d.line((cx, Y(h), cx, Y(l)), fill=col, width=2)
            top, bot = Y(max(o, c)), Y(min(o, c))
            if bot - top < 2: bot = top + 2
            d.rectangle((cx - bw / 2, top, cx + bw / 2, bot), fill=col)
            if i in hl:
                d.rounded_rectangle((cx - bw / 2 - 5, Y(h) - 6, cx + bw / 2 + 5, Y(l) + 6), radius=6, outline=AMBER, width=2)
        for m in art.get('markers', []):
            i = m['i']; o, h, l, c = bars[i]
            cx = px1 + slot * (i + 0.5)
            if m.get('dir') == 'up':
                ty = Y(l) + 8
                d.polygon([(cx, ty), (cx - 8, ty + 14), (cx + 8, ty + 14)], fill=GREEN)
            else:
                ty = Y(h) - 8
                d.polygon([(cx, ty), (cx - 8, ty - 14), (cx + 8, ty - 14)], fill=RED)
        if vols:
            vmax = max(vols) or 1
            vy1, vy2 = py2 + 8, y2 - pad
            for i, v in enumerate(vols):
                cx = px1 + slot * (i + 0.5)
                o, h, l, c = bars[i] if i < n else bars[-1]
                col = GREEN if c >= o else RED
                if hl and i not in hl: col = tuple(int(v2 * 0.45 + 20) for v2 in col)
                d.rectangle((cx - bw / 2, vy2 - (vy2 - vy1) * v / vmax, cx + bw / 2, vy2), fill=col)
            d.text((px1, vy1 - 2), 'volume', font=font(11), fill=MUTED)

    elif kind == 'osc':
        shade = art.get('shade')
        if shade:
            d.rectangle((px1, Y(100), px2, Y(shade['top'])), fill=(40, 26, 30))
            d.rectangle((px1, Y(shade['bottom']), px2, Y(0)), fill=(22, 36, 34))
        for b in art.get('bands', []):
            dashed(d, px1, Y(b['y']), px2, GRID if b['y'] not in (art.get('zero'),) else MUTED, dash=6, gap=6, width=1)
            d.text((px1 + 4, Y(b['y']) - 14), str(b.get('label', '')), font=font(11), fill=MUTED)
        pts = [(X(x), Y(y)) for x, y in art['points']]
        last_y = art['points'][-1][1]
        zero = art.get('zero')
        col = BLUE if zero is None else (GREEN if last_y >= zero else RED)
        if art.get('fill') and zero is not None:
            poly = [(X(x), Y(y)) for x, y in art['points']] + [(X(art['points'][-1][0]), Y(zero)), (X(art['points'][0][0]), Y(zero))]
            d.polygon(poly, fill=tuple(int(v * 0.35 + 12) for v in col))
        d.line(pts, fill=col, width=4, joint='curve')
        d.ellipse((pts[-1][0] - 5, pts[-1][1] - 5, pts[-1][0] + 5, pts[-1][1] + 5), fill=col)

    elif kind == 'line':
        band = art.get('band')
        if band:
            up = [(X(x), Y(y)) for x, y in band['upper']]
            lo = [(X(x), Y(y)) for x, y in band['lower']]
            d.polygon(up + lo[::-1], fill=(24, 34, 52))
            d.line(up, fill=BLUE, width=2, joint='curve')
            d.line(lo, fill=BLUE, width=2, joint='curve')
        ma = art.get('ma')
        if ma:
            d.line([(X(x), Y(y)) for x, y in ma], fill=COLOR.get(art.get('maColor'), BLUE), width=3, joint='curve')
        for lv in art.get('levels', []):
            level_line(lv['y'], lv.get('label'), COLOR.get(lv.get('color'), BLUE))
        pts = [(X(x), Y(y)) for x, y in art['points']]
        rising = art['points'][-1][1] >= art['points'][0][1]
        d.line(pts, fill=GREEN if rising else RED, width=4, joint='curve')
        tr = art.get('trend')
        if tr:
            col = COLOR.get(tr.get('color'), BLUE)
            a, b = (X(tr['from'][0]), Y(tr['from'][1])), (X(tr['to'][0]), Y(tr['to'][1]))
            if tr.get('broken'):
                dashed_line(d, a, b, col)
            else:
                d.line((a, b), fill=col, width=3)
        for m in art.get('markers', []):
            pass


def dashed_line(d, a, b, col, dash=10, gap=7, width=3):
    (ax, ay), (bx, by) = a, b
    L = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5
    if L == 0: return
    ux, uy = (bx - ax) / L, (by - ay) / L
    t = 0
    while t < L:
        t2 = min(t + dash, L)
        d.line((ax + ux * t, ay + uy * t, ax + ux * t2, ay + uy * t2), fill=col, width=width)
        t = t2 + gap


def render_explainer(spec):
    """Mobile-first explainer: series chip, title, one-line definition, three
    labelled examples (illustration + text + takeaway pill), question, footer."""
    W, H = int(spec.get('width', 1080)), int(spec.get('height', 1350))
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    M = 44
    PILL = {'bullish': GREEN, 'bearish': RED, 'neutral': BLUE}
    # header
    chip = spec.get('series', '')
    if chip:
        f = font(15, True)
        cw = d.textlength(chip, font=f) + 24
        d.rounded_rectangle((M, 40, M + cw, 68), radius=8, outline=BLUE, width=2)
        d.text((M + 12, 46), chip, font=f, fill=BLUE)
    if spec.get('brand'):
        fb = font(18, True)
        bw = d.textlength(spec['brand'], font=fb)
        d.text((W - M - bw, 42), spec['brand'], font=fb, fill=TEXT)
    d.text((M, 84), spec.get('title', ''), font=font(54, True), fill=TEXT)
    # definition, wrapped
    fdef = font(22)
    words = spec.get('definition', '').split()
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=fdef) > W - 2 * M: lines.append(cur); cur = w
        else: cur = t
    if cur: lines.append(cur)
    y = 154
    for ln in lines[:2]:
        d.text((M, y), ln, font=fdef, fill=MUTED); y += 30
    # examples
    top = y + 22
    bottom_reserved = 170
    n = max(1, len(spec.get('examples', [])))
    gap = 18
    eh = (H - bottom_reserved - top - gap * (n - 1)) / n
    art_w = 400
    for i, ex in enumerate(spec.get('examples', [])):
        ey1 = top + i * (eh + gap)
        ey2 = ey1 + eh
        d.rounded_rectangle((M, ey1, W - M, ey2), radius=16, fill=PANEL, outline=GRID)
        draw_art(img, d, ex.get('art', {'type': 'line', 'points': [[0, 50], [100, 50]]}), (M + 14, ey1 + 14, M + 14 + art_w, ey2 - 14))
        tx = M + 14 + art_w + 24
        col = PILL.get(ex.get('takeaway'), BLUE)
        d.text((tx, ey1 + 22), ex.get('label', ''), font=font(28, True), fill=TEXT)
        # example text, wrapped to the remaining width
        ft = font(19)
        maxw = W - M - 20 - tx
        wl, cur = [], ''
        for w in ex.get('text', '').split():
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=ft) > maxw: wl.append(cur); cur = w
            else: cur = t
        if cur: wl.append(cur)
        yy = ey1 + 64
        for ln in wl[:3]:
            d.text((tx, yy), ln, font=ft, fill=MUTED); yy += 26
        # takeaway pill + note
        word = ex.get('takeawayWord', '')
        fp = font(17, True)
        pw = d.textlength(word, font=fp) + 26
        py = ey2 - 78
        d.rounded_rectangle((tx, py, tx + pw, py + 32), radius=16, fill=col)
        d.text((tx + 13, py + 7), word, font=fp, fill=BG)
        fn = font(17)
        nl, cur = [], ''
        for w in ex.get('note', '').split():
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=fn) > maxw: nl.append(cur); cur = w
            else: cur = t
        if cur: nl.append(cur)
        yy = py + 40
        for ln in nl[:2]:
            d.text((tx, yy), ln, font=fn, fill=TEXT); yy += 22
    # question + footer
    fq = font(22, True)
    q = spec.get('question', '')
    if q:
        d.rounded_rectangle((M, H - 150, W - M, H - 96), radius=12, fill=PANEL2, outline=GRID)
        d.text((M + 20, H - 136), q, font=fq, fill=BLUE)
    d.text((M, H - 64), spec.get('footer', 'Educational only. Not financial advice.'), font=font(18), fill=TEXT)
    if spec.get('tagline'):
        d.text((M, H - 38), spec['tagline'], font=font(14), fill=MUTED)
    img.save(spec['out'], 'PNG', optimize=True)
    print(spec['out'])


# ─── premarket card ─────────────────────────────────────────────────────────

def wrap_text(d, text, f, maxw):
    lines, cur = [], ''
    for w in str(text).split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) > maxw:
            lines.append(cur); cur = w
        else:
            cur = t
    if cur: lines.append(cur)
    return lines


def render_premarket(spec):
    """Premarket market-direction card: bias pill + confidence, hook, four
    macro tiles, top drivers, SPY levels, sectors, the flip event, disclaimer."""
    W, H = int(spec.get('width', 1200)), int(spec.get('height', 1000))
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    M = 40
    bias_col = COLOR.get(spec.get('biasColor'), AMBER)
    # header
    chip = spec.get('title', 'PREMARKET MARKET DIRECTION')
    f = font(15, True)
    cw = d.textlength(chip, font=f) + 24
    d.rounded_rectangle((M, 36, M + cw, 64), radius=8, outline=BLUE, width=2)
    d.text((M + 12, 42), chip, font=f, fill=BLUE)
    d.text((M + cw + 16, 40), spec.get('session', ''), font=font(20), fill=MUTED)
    if spec.get('brand'):
        fb = font(18, True)
        bw = d.textlength(spec['brand'], font=fb)
        d.text((W - M - bw, 38), spec['brand'], font=fb, fill=TEXT)
        if spec.get('tagline'):
            tw = d.textlength(spec['tagline'], font=font(14))
            d.text((W - M - tw, 64), spec['tagline'], font=font(14), fill=MUTED)
    # bias pill + confidence
    fpill = font(54, True)
    label = spec.get('bias', 'NEUTRAL')
    pw = d.textlength(label, font=fpill) + 56
    d.rounded_rectangle((M, 92, M + pw, 172), radius=40, outline=bias_col, width=4)
    d.text((M + 28, 102), label, font=fpill, fill=bias_col)
    cx = M + pw + 32
    conf = int(spec.get('confidence', 0) or 0)
    d.text((cx, 98), spec.get('confidenceLabel', 'Confidence'), font=font(18), fill=MUTED)
    d.text((cx, 120), spec.get('confidenceText') or f"{conf}/100", font=font(40, True), fill=TEXT)
    bx1, bx2, by = cx + 190, W - M, 132
    d.rounded_rectangle((bx1, by, bx2, by + 22), radius=11, fill=GRID)
    d.rounded_rectangle((bx1, by, bx1 + (bx2 - bx1) * conf / 100, by + 22), radius=11, fill=bias_col)
    d.text((bx1, by + 30), spec.get('confidenceNote', 'how much the inputs agree — not a probability'), font=font(14), fill=MUTED)
    # hook
    y = 190
    for ln in wrap_text(d, spec.get('hook', ''), font(22), W - 2 * M)[:2]:
        d.text((M, y), ln, font=font(22), fill=TEXT); y += 30
    if spec.get('holiday'):
        d.text((M, y), f"U.S. markets closed today ({spec['holiday']}) — read for the next session", font=font(16), fill=AMBER); y += 24
    # tiles
    tiles = spec.get('tiles', [])
    TT = y + 14; TB = TT + 118; gap = 16
    tw_each = (W - 2 * M - gap * (len(tiles) - 1)) / max(len(tiles), 1)
    for i, t in enumerate(tiles):
        x1 = M + i * (tw_each + gap)
        col = COLOR.get(t.get('color'), BLUE)
        d.rounded_rectangle((x1, TT, x1 + tw_each, TB), radius=14, fill=PANEL, outline=GRID)
        d.rectangle((x1, TT + 14, x1 + 5, TB - 14), fill=col)
        d.text((x1 + 24, TT + 16), t.get('label', ''), font=font(15), fill=MUTED)
        d.text((x1 + 24, TT + 40), str(t.get('value', '')), font=font(36, True), fill=TEXT)
        d.text((x1 + 24, TT + 86), str(t.get('sub', '')), font=font(16, True), fill=col)
    # drivers
    DT = TB + 18; DB = DT + 150
    d.rounded_rectangle((M, DT, W - M, DB), radius=14, fill=PANEL, outline=GRID)
    d.text((M + 24, DT + 14), spec.get('driversLabel', 'TOP DRIVERS'), font=font(14, True), fill=MUTED)
    yy = DT + 42
    for drv in spec.get('drivers', [])[:3]:
        col = COLOR.get(drv.get('color'), BLUE)
        ax, ay = M + 32, yy + 12
        if drv.get('direction') == 'supportive':
            d.polygon([(ax - 8, ay + 6), (ax + 8, ay + 6), (ax, ay - 6)], fill=col)
        elif drv.get('direction') == 'headwind':
            d.polygon([(ax - 8, ay - 6), (ax + 8, ay - 6), (ax, ay + 6)], fill=col)
        else:
            d.ellipse((ax - 6, ay - 6, ax + 6, ay + 6), fill=col)
        line = wrap_text(d, drv.get('text', ''), font(20), W - 2 * M - 80)[0] if drv.get('text') else ''
        d.text((M + 56, yy), line, font=font(20), fill=TEXT); yy += 34
    # levels + sectors
    LT = DB + 18; LB = LT + 128
    half = (W - 2 * M - 16) / 2
    d.rounded_rectangle((M, LT, M + half, LB), radius=14, fill=PANEL, outline=GRID)
    lv = spec.get('levels') or {}
    d.text((M + 24, LT + 14), f"{lv.get('label', 'SPY')} LEVELS", font=font(14, True), fill=MUTED)
    d.text((M + 24, LT + 42), 'Above', font=font(15), fill=MUTED)
    d.text((M + 90, LT + 38), lv.get('above', '—'), font=font(22, True), fill=GREEN)
    d.text((M + 24, LT + 84), 'Below', font=font(15), fill=MUTED)
    d.text((M + 90, LT + 80), lv.get('below', '—'), font=font(22, True), fill=RED)
    sx = M + half + 16
    d.rounded_rectangle((sx, LT, W - M, LB), radius=14, fill=PANEL, outline=GRID)
    sec = spec.get('sectors') or {}
    d.text((sx + 24, LT + 14), spec.get('sectorsLabel', 'SECTORS'), font=font(14, True), fill=MUTED)
    d.text((sx + 24, LT + 42), 'Strongest', font=font(15), fill=MUTED)
    d.text((sx + 24, LT + 62), ', '.join(sec.get('strong', [])) or '—', font=font(19, True), fill=GREEN)
    d.text((sx + 24, LT + 90), 'Weakest', font=font(15), fill=MUTED)
    d.text((sx + 24, LT + 110), ', '.join(sec.get('weak', [])) or '—', font=font(19, True), fill=RED)
    # flip event
    ET = LB + 18; EB = H - 100
    d.rounded_rectangle((M, ET, W - M, EB), radius=14, fill=PANEL2, outline=GRID)
    ev = spec.get('event')
    d.text((M + 24, ET + 14), 'WHAT COULD FLIP THE READ', font=font(14, True), fill=MUTED)
    if ev:
        head = f"{ev.get('when', '')} · {ev.get('title', '')}" if ev.get('today', True) else f"Nothing high-impact today — next: {ev.get('title', '')} ({ev.get('when', '')})"
        d.text((M + 24, ET + 40), wrap_text(d, head, font(22, True), W - 2 * M - 48)[0], font=font(22, True), fill=AMBER)
        yy = ET + 74
        for ln in wrap_text(d, ev.get('text', ''), font(18), W - 2 * M - 48)[:2]:
            d.text((M + 24, yy), ln, font=font(18), fill=TEXT); yy += 26
    else:
        d.text((M + 24, ET + 44), 'No high-impact release on the calendar — headlines and the open itself set the tone.', font=font(18), fill=TEXT)
    # footer
    if spec.get('disclosure'):
        d.text((M, H - 86), spec['disclosure'], font=font(16), fill=TEXT)
    d.text((M, H - 58), spec.get('footer', ''), font=font(15), fill=MUTED)
    d.text((M, H - 36), spec.get('source', ''), font=font(15), fill=MUTED)
    img.save(spec['out'], 'PNG', optimize=True)
    print(spec['out'])


# ─── intro / "start here" card ───────────────────────────────────────────────


def render_intro(spec):
    """The pinned introduction card: brand, hook, what the account teaches,
    the no-hype promise, the follow line, and the standing disclaimer.

    Two-pass layout: measure every block first, then spread the leftover
    height evenly across the gaps so the card fills its canvas at any
    bullet count instead of stranding a hole in the middle."""
    W, H = int(spec.get('width', 1080)), int(spec.get('height', 1350))
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    M = 60
    TOP, FOOT = 150, 104          # content band: below the header, above the rule

    def wrap(text, f, maxw):
        out, cur = [], ''
        for w in text.split():
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=f) > maxw and cur:
                out.append(cur)
                cur = w
            else:
                cur = t
        if cur:
            out.append(cur)
        return out

    f_hook, f_head, f_bul = font(46, True), font(26, True), font(27)
    f_prom, f_cta = font(31, True), font(25)
    hook_rows = wrap(spec.get('hook', ''), f_hook, W - 2 * M)
    bullets = [(b, wrap(b, f_bul, W - 2 * M - 46)) for b in spec.get('bullets', [])]
    promise = spec.get('promise', [])
    cta_rows = wrap(spec.get('cta', ''), f_cta, W - 2 * M)

    RULE_H, BUL_PAD, BUL_LINE = 5, 26, 36
    bul_h = [BUL_PAD + BUL_LINE * len(rows) for _, rows in bullets]
    content = (58 * len(hook_rows) + RULE_H + 52 + sum(bul_h)
               + 40 * len(promise) + 34 * len(cta_rows))
    # gaps, in order: hook→rule, rule→heading, between bullets, bullets→promise, promise→cta
    n_gaps = 4 + max(0, len(bullets) - 1)
    slack = max(0, (H - FOOT - 34 - TOP) - content)   # 34 = breathing room above the footer rule
    base_gaps = [18, 44] + [14] * max(0, len(bullets) - 1) + [30, 16]
    extra = slack - sum(base_gaps)
    if extra > 0:
        # the breathing room goes where it reads best: around the bullet list
        share = extra / (len(base_gaps) + 1)
        gaps = [g + share for g in base_gaps]
        gaps[-2] += share
    else:
        gaps = base_gaps

    # header: chip left, brand right
    chip = spec.get('chip', 'START HERE')
    fc = font(16, True)
    cw = d.textlength(chip, font=fc) + 26
    d.rounded_rectangle((M, 52, M + cw, 84), radius=9, outline=BLUE, width=2)
    d.text((M + 13, 59), chip, font=fc, fill=BLUE)
    if spec.get('brand'):
        fb = font(20, True)
        bw = d.textlength(spec['brand'], font=fb)
        d.text((W - M - bw, 54), spec['brand'], font=fb, fill=TEXT)
        sub = spec.get('handle') or spec.get('tagline')
        if sub:
            fs = font(15)
            sw = d.textlength(sub, font=fs)
            d.text((W - M - sw, 80), sub, font=fs, fill=MUTED)

    y, gi = TOP, 0
    for ln in hook_rows:
        d.text((M, y), ln, font=f_hook, fill=TEXT)
        y += 58
    y += gaps[gi]; gi += 1
    d.rectangle((M, y, M + 96, y + RULE_H), fill=BLUE)
    y += RULE_H + gaps[gi]; gi += 1

    d.text((M, y), spec.get('heading', 'This account breaks down:'), font=f_head, fill=TEXT)
    y += 52
    for i, (_, rows) in enumerate(bullets):
        h = bul_h[i]
        d.rounded_rectangle((M, y, W - M, y + h), radius=13, fill=PANEL, outline=GRID)
        d.ellipse((M + 20, y + h / 2 - 7, M + 34, y + h / 2 + 7), fill=BLUE)
        ty = y + 13
        for ln in rows:
            d.text((M + 54, ty), ln, font=f_bul, fill=TEXT)
            ty += BUL_LINE
        y += h
        if i < len(bullets) - 1:
            y += gaps[gi]; gi += 1
    y += gaps[gi]; gi += 1

    for ln in promise:
        d.text((M, y), ln, font=f_prom, fill=TEXT)
        y += 40
    y += gaps[gi]; gi += 1
    for ln in cta_rows:
        d.text((M, y), ln, font=f_cta, fill=BLUE)
        y += 34

    # footer disclaimer + archive tag
    d.line((M, H - FOOT, W - M, H - FOOT), fill=GRID, width=2)
    d.text((M, H - 78), spec.get('footer', ''), font=font(20), fill=MUTED)
    if spec.get('archiveTag'):
        ft = font(19, True)
        tw = d.textlength(spec['archiveTag'], font=ft)
        d.text((W - M - tw, H - 78), spec['archiveTag'], font=ft, fill=BLUE)
    img.save(spec['out'], 'PNG', optimize=True)
    print(spec['out'])


def main():
    spec = json.load(sys.stdin)
    if spec.get('style') == 'scorecard':
        return render_scorecard(spec)
    if spec.get('style') == 'explainer':
        return render_explainer(spec)
    if spec.get('style') == 'premarket':
        return render_premarket(spec)
    if spec.get('style') == 'intro':
        return render_intro(spec)
    W, H = int(spec.get('width', 1200)), int(spec.get('height', 1000))
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    M = 40
    direction = spec.get('direction')
    confirmed = bool(spec.get('confirmed'))
    verdict_col = GREEN if (confirmed and direction != 'bearish') else RED if (confirmed and direction == 'bearish') else BLUE
    if spec.get('verdictColor') == 'red': verdict_col = RED
    elif spec.get('verdictColor') == 'green': verdict_col = GREEN
    elif spec.get('verdictColor') == 'blue': verdict_col = BLUE

    f_tick = font(56, True); f_name = font(21); f_brand = font(18, True); f_tag = font(14)
    f_chip = font(14, True); f_badge = font(34, True); f_sub = font(16)
    f_lbl = font(19, True); f_role = font(13); f_axis = font(14); f_ann = font(16, True)
    f_tlab = font(15); f_tval = font(34, True); f_tsub = font(14)
    f_bot = font(18, True); f_bsub = font(15); f_foot = font(15); f_disc = font(16)

    # ── header ──────────────────────────────────────────────────────────────
    cx, cy, r = M + 36, 64, 34
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=PANEL2, outline=verdict_col, width=3)
    mono = spec['symbol'][:2]
    mw = d.textlength(mono, font=font(26, True))
    d.text((cx - mw / 2, cy - 16), mono, font=font(26, True), fill=TEXT)
    d.text((M + 90, 24), f"${spec['symbol']}", font=f_tick, fill=TEXT)
    if spec.get('name'):
        d.text((M + 94, 88), spec['name'], font=f_name, fill=MUTED)
    if spec.get('brand'):
        bw = d.textlength(spec['brand'], font=f_brand)
        d.text((W - M - bw, 36), spec['brand'], font=f_brand, fill=TEXT)
        if spec.get('tagline'):
            tw = d.textlength(spec['tagline'], font=f_tag)
            d.text((W - M - tw, 62), spec['tagline'], font=f_tag, fill=MUTED)

    # ── verdict badge ───────────────────────────────────────────────────────
    by1, by2 = 122, 204
    d.rounded_rectangle((M, by1, W - M, by2), radius=14, fill=PANEL, outline=verdict_col, width=2)
    chip = spec.get('chip') or ''
    if chip:
        cw = d.textlength(chip, font=f_chip) + 20
        d.rounded_rectangle((M + 18, by1 + 12, M + 18 + cw, by1 + 34), radius=6, outline=verdict_col, width=1)
        d.text((M + 28, by1 + 16), chip, font=f_chip, fill=verdict_col)
    # check / eye mark
    mx, my = M + 46, by1 + 58
    d.ellipse((mx - 16, my - 16, mx + 16, my + 16), fill=verdict_col)
    # mark 'dot' keeps the ✓ off a badge that is confirmed-coloured but not a confirmation
    if confirmed and spec.get('mark') != 'dot':
        d.line((mx - 8, my, mx - 2, my + 6), fill=BG, width=4)
        d.line((mx - 2, my + 6, mx + 9, my - 6), fill=BG, width=4)
    else:
        d.ellipse((mx - 5, my - 5, mx + 5, my + 5), fill=BG)
    d.text((M + 78, by1 + 38), spec.get('badge', ''), font=f_badge, fill=verdict_col)
    if spec.get('subtitle'):
        bxw = d.textlength(spec['badge'], font=f_badge)
        d.text((M + 78 + bxw + 24, by1 + 50), spec['subtitle'], font=f_sub, fill=MUTED)

    # ── price pane ──────────────────────────────────────────────────────────
    candles = spec['candles']
    levels = spec.get('levels', [])
    n = len(candles)
    L, R = M, W - 250
    T, B = 226, 560
    d.rounded_rectangle((L, T, R, B), radius=12, fill=PANEL, outline=GRID)

    ma = spec.get('ma') or []
    series_vals = [c['l'] for c in candles] + [c['h'] for c in candles] + [lv['value'] for lv in levels] + [v for v in ma if v is not None]
    lo, hi = (min(series_vals), max(series_vals)) if series_vals else (0, 1)
    pad = (hi - lo) * 0.08 or 1
    lo, hi = lo - pad, hi + pad

    def y(v): return B - (v - lo) / (hi - lo) * (B - T)
    slot = (R - L - 24) / max(n, 1)
    def x(i): return L + 12 + slot * (i + 0.5)

    ticks = []
    for k in range(6):
        v = lo + (hi - lo) * k / 5
        yy = y(v)
        d.line((L + 1, yy, R - 1, yy), fill=GRID, width=1)
        ticks.append((yy, tick_fmt(v)))

    # date axis
    step = max(1, n // 6)
    for i in range(0, n, step):
        d.text((x(i) - 22, B + 8), candles[i]['t'][5:], font=f_axis, fill=MUTED)

    # 20-day MA (context from the same closes)
    pts = [(x(i), y(v)) for i, v in enumerate(ma) if v is not None]
    if len(pts) > 1:
        d.line(pts, fill=BLUE, width=3, joint='curve')
        lab = spec.get('maLabel') or '20-day MA'
        px, py = pts[max(0, len(pts) // 3)]
        tw = d.textlength(lab, font=f_role)
        d.rounded_rectangle((px - tw / 2 - 8, py + 10, px + tw / 2 + 8, py + 30), radius=6, fill=BG, outline=BLUE)
        d.text((px - tw / 2, py + 13), lab, font=f_role, fill=BLUE)

    # candles
    body_w = max(3, slot * 0.62)
    for i, c in enumerate(candles):
        col = GREEN if c['c'] >= c['o'] else RED
        cx = x(i)
        d.line((cx, y(c['h']), cx, y(c['l'])), fill=col, width=2)
        top, bot = y(max(c['o'], c['c'])), y(min(c['o'], c['c']))
        if bot - top < 1.5: bot = top + 1.5
        d.rectangle((cx - body_w / 2, top, cx + body_w / 2, bot), fill=col)

    # levels: dashed line across, two-line label in the right margin
    placed = []
    for lv in sorted(levels, key=lambda lv: y(lv['value'])):
        yy = y(lv['value'])
        ly = max(T + 24, min(B - 24, yy))
        for py in placed:
            if abs(ly - py) < 50:
                ly = py + 50
        placed.append(ly)
        lv['_y'], lv['_ly'] = yy, ly
    for lv in levels:
        col = hexc(lv.get('color'))
        dashed(d, L + 1, lv['_y'], R - 1, col)
        ly = lv['_ly']
        d.line((R, lv['_y'], R + 10, ly), fill=col, width=2)
        lab, role = lv['label'], lv.get('role', '')
        tw = max(d.textlength(lab, font=f_lbl), d.textlength(role, font=f_role))
        lx1 = R + 12
        d.rounded_rectangle((lx1, ly - 23, lx1 + tw + 18, ly + 23), radius=8, fill=PANEL2, outline=col, width=2)
        d.text((lx1 + 9, ly - 20), lab, font=f_lbl, fill=col)
        d.text((lx1 + 9, ly + 4), role, font=f_role, fill=MUTED)
    for yy, txt in ticks:
        if all(abs(yy - lv['_ly']) > 34 for lv in levels):
            d.text((R + 12, yy - 8), txt, font=f_axis, fill=MUTED)

    # annotation at the last bar
    ann = spec.get('annotation')
    if ann and n:
        last = candles[-1]
        col = hexc(ann.get('color'), BLUE)
        cx = x(n - 1)
        if direction == 'bearish':
            tip, tail = y(last['h']) - 8, max(T + 40, y(last['h']) - 78)
            d.line((cx, tail, cx, tip), fill=col, width=3)
            d.polygon([(cx, tip), (cx - 7, tip - 12), (cx + 7, tip - 12)], fill=col)
            ty = tail - 30
        else:
            tip, tail = y(last['l']) + 8, min(B - 40, y(last['l']) + 78)
            d.line((cx, tail, cx, tip), fill=col, width=3)
            d.polygon([(cx, tip), (cx - 7, tip + 12), (cx + 7, tip + 12)], fill=col)
            ty = tail + 6
        text = ann['text']
        tw = d.textlength(text, font=f_ann)
        tx1 = max(L + 8, cx - 6 - tw - 16)
        ty = max(T + 6, min(B - 32, ty))
        d.rounded_rectangle((tx1, ty, tx1 + tw + 16, ty + 26), radius=6, fill=col)
        d.text((tx1 + 8, ty + 4), text, font=f_ann, fill=BG)

    # ── volume pane ─────────────────────────────────────────────────────────
    VT, VB = 592, 664
    vols = [c.get('v') or 0 for c in candles]
    if any(vols):
        d.rounded_rectangle((L, VT, R, VB), radius=10, fill=PANEL, outline=GRID)
        vmax = max(vols) or 1
        def vy(v): return VB - 6 - (v / vmax) * (VB - VT - 12)
        for i, c in enumerate(candles):
            col = GREEN if c['c'] >= c['o'] else RED
            cx = x(i)
            d.rectangle((cx - body_w / 2, vy(vols[i]), cx + body_w / 2, VB - 6), fill=col)
        avg = spec.get('volumeAvg')
        if avg:
            dashed(d, L + 1, vy(avg), R - 1, BLUE, dash=8, gap=6)
        ratio = spec.get('volumeRatio')
        d.text((R + 12, VT + 12), 'Volume', font=f_lbl, fill=TEXT)
        d.text((R + 12, VT + 38), f"{ratio:.1f}× 20-day avg" if ratio is not None else 'no data', font=f_axis, fill=MUTED)
        d.text((R + 12, VT + 56), f"last bar {fmt_vol(vols[-1])}", font=f_axis, fill=MUTED)

    # ── stat tiles ──────────────────────────────────────────────────────────
    tiles = spec.get('tiles', [])
    TT, TB = 690, 800
    gap = 16
    tw_each = (W - 2 * M - gap * (len(tiles) - 1)) / max(len(tiles), 1)
    for i, t in enumerate(tiles):
        tx1 = M + i * (tw_each + gap)
        d.rounded_rectangle((tx1, TT, tx1 + tw_each, TB), radius=12, fill=PANEL, outline=GRID)
        d.text((tx1 + 18, TT + 14), t.get('label', ''), font=f_tlab, fill=MUTED)
        d.text((tx1 + 18, TT + 38), str(t.get('value', '')), font=f_tval, fill=TEXT)
        if t.get('sub'):
            # warn = a caution the post also states (e.g. RVOL under 1.0x)
            d.text((tx1 + 18, TT + 82), t['sub'], font=f_tsub, fill=AMBER if t.get('warn') else MUTED)

    # ── bull / bear / question strip ────────────────────────────────────────
    bottom = spec.get('bottom', [])
    ST, SB = 820, 890
    if bottom:
        d.rounded_rectangle((M, ST, W - M, SB), radius=12, fill=PANEL, outline=GRID)
        cw_each = (W - 2 * M) / len(bottom)
        for i, b in enumerate(bottom):
            bx = M + i * cw_each
            if i:
                d.line((bx, ST + 12, bx, SB - 12), fill=GRID, width=1)
            ix, iy = bx + 30, (ST + SB) / 2
            icon = b.get('icon')
            if icon == 'up':
                d.polygon([(ix, iy - 12), (ix - 13, iy + 10), (ix + 13, iy + 10)], fill=GREEN)
            elif icon == 'down':
                d.polygon([(ix, iy + 12), (ix - 13, iy - 10), (ix + 13, iy - 10)], fill=RED)
            elif icon == 'check':      # a level cleared
                d.ellipse((ix - 15, iy - 15, ix + 15, iy + 15), fill=GREEN)
                d.line((ix - 8, iy, ix - 2, iy + 6), fill=BG, width=4)
                d.line((ix - 2, iy + 6, ix + 9, iy - 6), fill=BG, width=4)
            elif icon == 'x':          # a level lost
                d.ellipse((ix - 15, iy - 15, ix + 15, iy + 15), fill=RED)
                d.line((ix - 7, iy - 7, ix + 7, iy + 7), fill=BG, width=4)
                d.line((ix - 7, iy + 7, ix + 7, iy - 7), fill=BG, width=4)
            else:
                d.ellipse((ix - 15, iy - 15, ix + 15, iy + 15), fill=BLUE)
                qw = d.textlength('?', font=font(20, True))
                d.text((ix - qw / 2, iy - 13), '?', font=font(20, True), fill=BG)
            col = GREEN if icon in ('up', 'check') else RED if icon in ('down', 'x') else BLUE
            d.text((bx + 58, ST + 14), b.get('text', ''), font=f_bot, fill=col)
            d.text((bx + 58, ST + 40), b.get('sub', ''), font=f_bsub, fill=MUTED)

    # ── footer ──────────────────────────────────────────────────────────────
    if spec.get('disclosure'):
        d.text((M, H - 86), spec['disclosure'], font=f_disc, fill=TEXT)
    d.text((M, H - 58), spec.get('footer', ''), font=f_foot, fill=MUTED)
    d.text((M, H - 36), spec.get('source', ''), font=f_foot, fill=MUTED)

    img.save(spec['out'], 'PNG', optimize=True)
    print(spec['out'])


if __name__ == '__main__':
    main()
