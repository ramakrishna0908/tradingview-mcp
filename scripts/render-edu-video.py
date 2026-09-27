#!/usr/bin/env python3
"""Render the Daily Setup Sweep chart-education video (MP4) from a JSON spec
on stdin. Spec: buildVideoSpec in src/social/video.js.

Mobile-first 9:16, 10–15 s, readable with the sound off:

  hook      1.6 s  big statement on the brand background
  chart     7.4 s  the illustration draws itself in — bars/lines, then
                   levels, zones, arrows and labels at their `at` times —
                   with captions under it
  takeaway  3.0 s  WHAT IT MEANS / HOW TRADERS USE IT
  end       1.6 s  "Save this • Follow for daily chart education"

The footer "Educational only. Not financial advice." is on every frame.
Frames are drawn with Pillow and piped as raw RGB into ffmpeg (FFMPEG env,
`ffmpeg` on PATH, or imageio-ffmpeg's bundled binary): H.264, yuv420p, a
silent AAC track (X prefers an audio stream), faststart. Prints one JSON
line with the output path, duration and frame count.
"""
import json, math, os, shutil, subprocess, sys
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
COLOR = {'green': GREEN, 'red': RED, 'blue': BLUE, 'amber': AMBER}

_FONT_CACHE = {}


def font(size, bold=False):
    key = (size, bold)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    f = None
    for path in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:
            f = ImageFont.truetype(path, size, index=1 if (bold and path.endswith('.ttc')) else 0)
            break
        except Exception:
            continue
    if f is None:
        f = ImageFont.load_default()
    _FONT_CACHE[key] = f
    return f


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    t = max(0.0, min(1.0, t))
    return 0.5 - 0.5 * math.cos(math.pi * t)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def wrap_text(d, text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if d.textlength(trial, font=f) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines


def draw_centered(d, y, text, f, fill, W, maxw=None, gap=10):
    lines = wrap_text(d, text, f, maxw or W)
    for ln in lines:
        tw = d.textlength(ln, font=f)
        d.text(((W - tw) / 2, y), ln, font=f, fill=fill)
        y += f.size + gap
    return y


def pill(d, x, y, text, f, col, bg=BG, pad=12, anchor='left'):
    tw = d.textlength(text, font=f)
    h = f.size + 14
    if anchor == 'center':
        x = x - (tw + 2 * pad) / 2
    elif anchor == 'right':
        x = x - (tw + 2 * pad)
    d.rounded_rectangle((x, y, x + tw + 2 * pad, y + h), radius=h / 2, fill=bg, outline=col, width=2)
    d.text((x + pad, y + 6), text, font=f, fill=col)
    return (x, y, x + tw + 2 * pad, y + h)


def dashed_h(d, x1, y, x2, col, dash=14, gap=10, width=3):
    xx = x1
    while xx < x2:
        d.line((xx, y, min(xx + dash, x2), y), fill=col, width=width)
        xx += dash + gap


def dashed_seg(d, a, b, col, dash=12, gap=8, width=3, progress=1.0):
    (ax, ay), (bx, by) = a, b
    L = math.hypot(bx - ax, by - ay) * clamp(progress, 0, 1)
    if L <= 0: return
    full = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / full, (by - ay) / full
    t = 0
    while t < L:
        t2 = min(t + dash, L)
        d.line((ax + ux * t, ay + uy * t, ax + ux * t2, ay + uy * t2), fill=col, width=width)
        t = t2 + gap


def polyline_progress(pts, p):
    """First `p` (0..1) of a polyline, with the last point interpolated."""
    if p <= 0 or len(pts) < 2: return pts[:1]
    if p >= 1: return pts
    total = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
    target = total * p
    out = [pts[0]]
    acc = 0
    for i in range(len(pts) - 1):
        seg = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        if acc + seg >= target:
            f = (target - acc) / seg if seg else 1
            out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f))
            return out
        acc += seg
        out.append(pts[i + 1])
    return out


def triangle(d, cx, ty, up, col, size=1.0):
    s = 16 * size
    if up:
        d.polygon([(cx, ty), (cx - s, ty + s * 1.6), (cx + s, ty + s * 1.6)], fill=col)
    else:
        d.polygon([(cx, ty), (cx - s, ty - s * 1.6), (cx + s, ty - s * 1.6)], fill=col)


# ─── chart animation ─────────────────────────────────────────────────────────

class Chart:
    """Draws one illustration spec progressively. `p` is the chart-phase
    fraction (0..1): data draws in over the first DRAW_END, then every
    level / zone / marker / label appears at its own `at`."""
    DRAW_END = 0.55

    def __init__(self, art, box):
        self.art = art
        self.kind = art.get('type')
        self.box = box
        x1, y1, x2, y2 = box
        pad = 28
        self.vols = art.get('vols')
        vol_h = 0.2 * (y2 - y1) if self.vols else 0
        self.px1, self.py1, self.px2 = x1 + pad, y1 + pad, x2 - pad
        self.py2 = y2 - pad - vol_h
        self.vol_box = (self.py2 + 14, y2 - pad) if self.vols else None
        if self.kind == 'divergence':
            gap = 28
            h = (self.py2 - self.py1 - gap)
            self.price_box = (self.py1, self.py1 + h * 0.58)
            self.osc_box = (self.py1 + h * 0.58 + gap, self.py2)
        if self.kind in ('osc', 'diagram'):
            self.lo, self.hi = 0.0, 100.0
        else:
            vals = []
            for b in art.get('bars', []): vals += [b[1], b[2]]
            for pt in art.get('points', []): vals.append(pt[1])
            for pt in art.get('price', []): vals.append(pt[1])
            for lv in art.get('levels', []): vals.append(lv['y'])
            for z in art.get('zones', []): vals += [z['y1'], z['y2']]
            tr = art.get('trend')
            if tr: vals += [tr['from'][1], tr['to'][1]]
            for pt in art.get('ma', []): vals.append(pt[1])
            band = art.get('band')
            if band:
                for pt in band['upper'] + band['lower']: vals.append(pt[1])
            for lb in art.get('labels', []):
                if lb.get('panel') != 'osc': vals.append(lb['y'])
            lo, hi = (min(vals), max(vals)) if vals else (0.0, 100.0)
            m = (hi - lo) * 0.14 or 5
            self.lo, self.hi = lo - m, hi + m

    def X(self, v):
        return self.px1 + (self.px2 - self.px1) * v / 100.0

    def Y(self, v, panel=None):
        if self.kind == 'divergence':
            top, bot = self.osc_box if panel == 'osc' else self.price_box
            if panel == 'osc':
                lo, hi = 0.0, 100.0
            else:
                lo, hi = self.lo, self.hi
            return bot - (bot - top) * (v - lo) / (hi - lo)
        return self.py2 - (self.py2 - self.py1) * (v - self.lo) / (self.hi - self.lo)

    def draw(self, d, p):
        art = self.art
        d.rounded_rectangle(self.box, radius=28, fill=PANEL2, outline=GRID, width=2)
        # faint grid (a diagram has no value axis)
        for i in range(1, 4 if self.kind != 'diagram' else 1):
            y = self.py1 + (self.py2 - self.py1) * i / 4
            d.line((self.px1, y, self.px2, y), fill=(26, 34, 52), width=1)
        prog = ease_in_out(p / self.DRAW_END)
        # zones first (under everything)
        for z in art.get('zones', []):
            a = clamp((p - z.get('at', 0.6)) / 0.3, 0, 1)
            if a <= 0: continue
            col = COLOR.get(z.get('color'), BLUE)
            fill = mix(PANEL2, col, 0.22 * a)
            d.rectangle((self.px1, self.Y(max(z['y1'], z['y2'])), self.px2, self.Y(min(z['y1'], z['y2']))), fill=fill)
        if self.kind == 'candles':
            self._candles(d, p, prog)
        elif self.kind == 'osc':
            self._osc(d, p, prog)
        elif self.kind == 'line':
            self._line(d, p, prog)
        elif self.kind == 'divergence':
            self._divergence(d, p, prog)
        elif self.kind == 'diagram':
            self._diagram(d, p)
        for lv in art.get('levels', []):
            self._level(d, p, lv)
        for lb in art.get('labels', []):
            self._label(d, p, lb)

    def _level(self, d, p, lv):
        a = clamp((p - lv.get('at', 0.2)) / 0.35, 0, 1)
        if a <= 0: return
        col = COLOR.get(lv.get('color'), BLUE)
        y = self.Y(lv['y'])
        dashed_h(d, self.px1, y, self.px1 + (self.px2 - self.px1) * ease_out(a), col)
        if a >= 0.85 and lv.get('label'):
            f = font(26, True)
            bars = self.art.get('bars') or []
            def crowded(seg):
                return any(b[2] - 4 <= lv['y'] <= b[1] + 4 for b in seg)
            right_busy = crowded(bars[-3:]) if bars else False
            left_busy = crowded(bars[:3]) if bars else False
            if right_busy and not left_busy:
                pill(d, self.px1 + 6, y - 20, lv['label'], f, col)
            else:
                pill(d, self.px2 - 6, y - 20, lv['label'], f, col, anchor='right')

    def _label(self, d, p, lb):
        a = clamp((p - lb.get('at', 0.7)) / 0.25, 0, 1)
        if a <= 0: return
        col = COLOR.get(lb.get('color'), AMBER)
        if 'i' in lb and self.kind == 'candles':
            n = len(self.art['bars']); slot = (self.px2 - self.px1) / n
            x = self.px1 + slot * (lb['i'] + 0.5)
        else:
            x = self.X(lb.get('x', 50))
        y = self.Y(lb['y'], lb.get('panel'))
        f = font(26, True)
        rise = (1 - ease_out(a)) * 18
        col_a = mix(PANEL2, col, a)
        half = (d.textlength(lb['text'], font=f) + 24) / 2 + 4
        pill(d, clamp(x, self.px1 + half, self.px2 - half), clamp(y - 22 + rise, self.py1 - 10, self.py2 - 30), lb['text'], f, col_a, anchor='center')

    def _marker_bar(self, d, p, m, bars, slot):
        a = clamp((p - m.get('at', 0.6)) / 0.25, 0, 1)
        if a <= 0: return
        i = m['i']; o, h, l, c = bars[i]
        cx = self.px1 + slot * (i + 0.5)
        s = 0.4 + 0.6 * ease_out(a)
        if m.get('dir') == 'up':
            triangle(d, cx, self.Y(l) + 10, True, GREEN, s)
        else:
            triangle(d, cx, self.Y(h) - 10, False, RED, s)

    def _candles(self, d, p, prog):
        bars = self.art['bars']
        n = len(bars)
        slot = (self.px2 - self.px1) / n
        bw = max(8, slot * 0.58)
        hl = set(self.art.get('highlight', []))
        shown = prog * n
        pulse = 0.5 + 0.5 * math.sin(p * 18)
        for i, (o, h, l, c) in enumerate(bars):
            if i >= shown: break
            f = clamp(shown - i, 0, 1)  # the newest bar grows in
            cx = self.px1 + slot * (i + 0.5)
            col = GREEN if c >= o else RED
            dim = bool(hl) and i not in hl and p > self.DRAW_END
            if dim: col = mix(col, PANEL2, 0.55)
            cc = o + (c - o) * f
            hh = o + (h - o) * f if h > o else h
            ll = o + (l - o) * f if l < o else l
            d.line((cx, self.Y(hh), cx, self.Y(ll)), fill=col, width=3)
            top, bot = self.Y(max(o, cc)), self.Y(min(o, cc))
            if bot - top < 3: bot = top + 3
            d.rectangle((cx - bw / 2, top, cx + bw / 2, bot), fill=col)
            if i in hl and p > self.DRAW_END:
                glow = mix(AMBER, PANEL2, 0.35 * pulse)
                d.rounded_rectangle((cx - bw / 2 - 8, self.Y(h) - 8, cx + bw / 2 + 8, self.Y(l) + 8), radius=8, outline=glow, width=3)
        for m in self.art.get('markers', []):
            self._marker_bar(d, p, m, bars, slot)
        if self.vols:
            vy1, vy2 = self.vol_box
            vmax = max(self.vols) or 1
            for i, v in enumerate(self.vols):
                if i >= shown: break
                f = clamp(shown - i, 0, 1)
                cx = self.px1 + slot * (i + 0.5)
                o, h, l, c = bars[i] if i < n else bars[-1]
                col = GREEN if c >= o else RED
                if hl and i not in hl and p > self.DRAW_END: col = mix(col, PANEL2, 0.55)
                d.rectangle((cx - bw / 2, vy2 - (vy2 - vy1) * v / vmax * f, cx + bw / 2, vy2), fill=col)
            d.text((self.px1, vy1 - 26), 'volume', font=font(20), fill=MUTED)

    def _osc(self, d, p, prog):
        art = self.art
        shade = art.get('shade')
        if shade:
            d.rectangle((self.px1, self.Y(100), self.px2, self.Y(shade['top'])), fill=(40, 26, 30))
            d.rectangle((self.px1, self.Y(shade['bottom']), self.px2, self.Y(0)), fill=(22, 36, 34))
        for b in art.get('bands', []):
            dashed_h(d, self.px1, self.Y(b['y']), self.px2, MUTED if b['y'] == art.get('zero') else GRID, dash=8, gap=8, width=2)
            d.text((self.px1 + 8, self.Y(b['y']) - 28), str(b.get('label', '')), font=font(20), fill=MUTED)
        pts = [(self.X(x), self.Y(y)) for x, y in art['points']]
        part = polyline_progress(pts, prog)
        zero = art.get('zero')
        last_y_val = art['points'][-1][1]
        col = BLUE if zero is None else (GREEN if last_y_val >= zero else RED)
        if art.get('fill') and zero is not None and len(part) >= 2:
            poly = part + [(part[-1][0], self.Y(zero)), (part[0][0], self.Y(zero))]
            d.polygon(poly, fill=mix(PANEL2, col, 0.3))
        if len(part) >= 2:
            d.line(part, fill=col, width=6, joint='curve')
        x, y = part[-1]
        d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=col)

    def _line(self, d, p, prog):
        art = self.art
        band = art.get('band')
        if band:
            up = [(self.X(x), self.Y(y)) for x, y in band['upper']]
            lo = [(self.X(x), self.Y(y)) for x, y in band['lower']]
            d.polygon(up + lo[::-1], fill=(24, 34, 52))
            d.line(up, fill=BLUE, width=3, joint='curve')
            d.line(lo, fill=BLUE, width=3, joint='curve')
        ma = art.get('ma')
        if ma:
            a = clamp((p - art.get('maAt', 0.0)) / 0.4, 0, 1)
            mpts = polyline_progress([(self.X(x), self.Y(y)) for x, y in ma], ease_out(a))
            if len(mpts) >= 2:
                d.line(mpts, fill=COLOR.get(art.get('maColor'), BLUE), width=5, joint='curve')
        pts = [(self.X(x), self.Y(y)) for x, y in art['points']]
        part = polyline_progress(pts, prog)
        rising = art['points'][-1][1] >= art['points'][0][1]
        if len(part) >= 2:
            d.line(part, fill=GREEN if rising else RED, width=6, joint='curve')
        x, y = part[-1]
        d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=GREEN if rising else RED)
        tr = art.get('trend')
        if tr:
            a = clamp((p - tr.get('at', 0.6)) / 0.4, 0, 1)
            if a > 0:
                col = COLOR.get(tr.get('color'), BLUE)
                A, B = (self.X(tr['from'][0]), self.Y(tr['from'][1])), (self.X(tr['to'][0]), self.Y(tr['to'][1]))
                if tr.get('broken'):
                    dashed_seg(d, A, B, col, progress=ease_out(a))
                else:
                    e = ease_out(a)
                    d.line((A, (A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e)), fill=col, width=4)
        for m in art.get('pointMarkers', []):
            a = clamp((p - m.get('at', 0.7)) / 0.25, 0, 1)
            if a <= 0: continue
            s = 0.4 + 0.6 * ease_out(a)
            if m.get('dir') == 'up':
                triangle(d, self.X(m['x']), self.Y(m['y']) + 12, True, GREEN, s)
            else:
                triangle(d, self.X(m['x']), self.Y(m['y']) - 12, False, RED, s)

    def _node_box(self, nd):
        w, h = nd.get('w', 34), nd.get('h', 14)
        return (self.X(nd['x'] - w / 2), self.Y(nd['y'] + h / 2), self.X(nd['x'] + w / 2), self.Y(nd['y'] - h / 2))

    def _anchor(self, box, towards):
        # Where an edge leaves/enters a box: the midpoint of the side facing the other box.
        x1, y1, x2, y2 = box
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        dx, dy = towards[0] - cx, towards[1] - cy
        if abs(dy) * (x2 - x1) >= abs(dx) * (y2 - y1):
            return (cx, y2 + 6) if dy > 0 else (cx, y1 - 6)
        return (x2 + 6, cy) if dx > 0 else (x1 - 6, cy)

    def _diagram(self, d, p):
        """Boxes, arrows and labelled bands, each fading in at its own `at`
        (fractions of the chart phase), for network / technology explainers."""
        art = self.art
        nodes = {nd['id']: nd for nd in art.get('nodes', [])}
        for gr in art.get('groups', []):
            a = clamp((p - gr.get('at', 0.0)) / 0.3, 0, 1)
            if a <= 0: continue
            col = COLOR.get(gr.get('color'), BLUE)
            box = (self.X(gr['x1']), self.Y(gr['y2']), self.X(gr['x2']), self.Y(gr['y1']))
            d.rounded_rectangle(box, radius=22, fill=mix(PANEL2, col, 0.10 * a), outline=mix(PANEL2, col, 0.55 * a), width=2)
            if gr.get('label'):
                d.text((box[0] + 18, box[1] + 10), gr['label'], font=font(22, True), fill=mix(PANEL2, col, a))
        for ed in art.get('edges', []):
            a = clamp((p - ed.get('at', 0.3)) / 0.25, 0, 1)
            if a <= 0: continue
            A, B = nodes.get(ed['from']), nodes.get(ed['to'])
            if not A or not B: continue
            ba, bb = self._node_box(A), self._node_box(B)
            ca, cb = ((ba[0] + ba[2]) / 2, (ba[1] + ba[3]) / 2), ((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2)
            P, Q = self._anchor(ba, cb), self._anchor(bb, ca)
            col = COLOR.get(ed.get('color'), MUTED) if ed.get('color') else MUTED
            e_ = ease_out(a)
            R = (P[0] + (Q[0] - P[0]) * e_, P[1] + (Q[1] - P[1]) * e_)
            if ed.get('dashed'):
                dashed_seg(d, P, Q, col, progress=e_, width=4)
            else:
                d.line((P, R), fill=col, width=4)
            if a >= 0.95:
                ang = math.atan2(Q[1] - P[1], Q[0] - P[0])
                s = 16
                d.polygon([Q, (Q[0] - s * math.cos(ang - 0.45), Q[1] - s * math.sin(ang - 0.45)), (Q[0] - s * math.cos(ang + 0.45), Q[1] - s * math.sin(ang + 0.45))], fill=col)
                if ed.get('label'):
                    pill(d, (P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2 - 20, ed['label'], font(22, True), col, bg=PANEL2, anchor='center')
        for nd in nodes.values():
            a = clamp((p - nd.get('at', 0.1)) / 0.25, 0, 1)
            if a <= 0: continue
            col = COLOR.get(nd.get('color'), BLUE)
            x1, y1, x2, y2 = self._node_box(nd)
            rise = (1 - ease_out(a)) * 14
            y1, y2 = y1 + rise, y2 + rise
            d.rounded_rectangle((x1, y1, x2, y2), radius=18, fill=mix(PANEL2, mix(PANEL, col, 0.16), a), outline=mix(PANEL2, col, a), width=3)
            f_l, f_s = font(30, True), font(22)
            lines = wrap_text(d, nd.get('label', ''), f_l, x2 - x1 - 20)[:2]
            sub = nd.get('sub')
            th = len(lines) * 36 + (28 if sub else 0)
            yy = (y1 + y2) / 2 - th / 2
            for ln in lines:
                d.text(((x1 + x2) / 2 - d.textlength(ln, font=f_l) / 2, yy), ln, font=f_l, fill=mix(PANEL2, TEXT, a)); yy += 36
            if sub:
                sl = wrap_text(d, sub, f_s, x2 - x1 - 16)[0]
                d.text(((x1 + x2) / 2 - d.textlength(sl, font=f_s) / 2, yy), sl, font=f_s, fill=mix(PANEL2, MUTED, a))

    def _divergence(self, d, p, prog):
        art = self.art
        ptop, pbot = self.price_box
        otop, obot = self.osc_box
        d.line((self.px1, (pbot + otop) / 2, self.px2, (pbot + otop) / 2), fill=GRID, width=2)
        d.text((self.px1 + 8, ptop - 2), 'PRICE', font=font(20, True), fill=MUTED)
        d.text((self.px1 + 8, otop - 2), 'RSI', font=font(20, True), fill=MUTED)
        dashed_h(d, self.px1, self.Y(50, 'osc'), self.px2, GRID, dash=8, gap=8, width=2)
        ppts = polyline_progress([(self.X(x), self.Y(y)) for x, y in art['price']], prog)
        opts = polyline_progress([(self.X(x), self.Y(y, 'osc')) for x, y in art['osc']], prog)
        if len(ppts) >= 2: d.line(ppts, fill=GREEN, width=6, joint='curve')
        if len(opts) >= 2: d.line(opts, fill=BLUE, width=5, joint='curve')
        for key, panel in (('priceGuide', None), ('oscGuide', 'osc')):
            g = art.get(key)
            if not g: continue
            a = clamp((p - g.get('at', 0.6)) / 0.35, 0, 1)
            if a <= 0: continue
            col = COLOR.get(g.get('color'), RED)
            A = (self.X(g['from'][0]), self.Y(g['from'][1], panel))
            B = (self.X(g['to'][0]), self.Y(g['to'][1], panel))
            dashed_seg(d, A, B, col, progress=ease_out(a), width=4)


# ─── frame composition ───────────────────────────────────────────────────────

def render(spec):
    W, H = int(spec.get('width', 1080)), int(spec.get('height', 1920))
    fps = int(spec.get('fps', 30))
    T = spec.get('timing', {})
    t_hook, t_chart, t_take, t_end = float(T.get('hook', 1.6)), float(T.get('chart', 7.4)), float(T.get('takeaway', 3.0)), float(T.get('end', 1.6))
    total = t_hook + t_chart + t_take + t_end
    nframes = int(round(total * fps))
    M = 72
    chart_box = (M, 470, W - M, 1330)
    chart = Chart(spec['art'], chart_box)
    captions = spec.get('captions', []) or ['']
    f_brand = font(26, True)
    f_series = font(24, True)
    f_title = font(56, True)
    f_hook = font(84, True)
    f_cap = font(46, True)
    f_lab = font(26, True)
    f_body = font(40)
    f_cta1 = font(92, True)
    f_cta2 = font(48, True)
    f_foot = font(28)
    brand = spec.get('brand') or 'Daily Setup Sweep'

    def footer(d):
        ft = spec.get('footer', 'Educational only. Not financial advice.')
        tw = d.textlength(ft, font=f_foot)
        d.text(((W - tw) / 2, H - 96), ft, font=f_foot, fill=TEXT)
        if spec.get('tagline'):
            f2 = font(22)
            tw2 = d.textlength(spec['tagline'], font=f2)
            d.text(((W - tw2) / 2, H - 58), spec['tagline'], font=f2, fill=MUTED)

    def header(d, alpha=1.0):
        col = mix(BG, TEXT, alpha); mcol = mix(BG, MUTED, alpha); acol = mix(BG, AMBER, alpha)
        pill(d, M, 120, brand.upper(), f_brand, acol, bg=mix(BG, PANEL, alpha))
        d.text((M, 196), spec.get('series', 'CHART EDUCATION'), font=f_series, fill=mcol)
        d.text((M, 236), spec.get('topicSeries', ''), font=f_series, fill=mix(BG, BLUE, alpha))
        y = 280
        for ln in wrap_text(d, spec.get('title', ''), f_title, W - 2 * M)[:2]:
            d.text((M, y), ln, font=f_title, fill=col); y += 64

    def caption(d, text, alpha, y=1380):
        col = mix(BG, TEXT, alpha)
        lines = wrap_text(d, text, f_cap, W - 2 * M - 56)[:3]
        # a soft plate so the caption reads over anything
        h = len(lines) * (f_cap.size + 12) + 36
        d.rounded_rectangle((M, y - 18, W - M, y - 18 + h), radius=22, fill=mix(BG, PANEL, alpha))
        yy = y
        for ln in lines:
            d.text((M + 28, yy), ln, font=f_cap, fill=col); yy += f_cap.size + 12

    def takeaway(d, a):
        rise = (1 - ease_out(a)) * 60
        col = mix(BG, TEXT, a); mcol = mix(BG, MUTED, a)
        y = 1372 + rise
        d.rounded_rectangle((M, y - 20, W - M, y + 400), radius=24, fill=mix(BG, PANEL, a), outline=mix(BG, GRID, a))
        labels = spec.get('labels') or {}
        d.text((M + 28, y), labels.get('means', 'WHAT IT MEANS'), font=f_lab, fill=mix(BG, GREEN, a))
        yy = y + 40
        for ln in wrap_text(d, spec.get('means', ''), f_body, W - 2 * M - 56)[:3]:
            d.text((M + 28, yy), ln, font=f_body, fill=col); yy += 48
        yy += 22
        d.text((M + 28, yy), labels.get('use', 'HOW TRADERS USE IT'), font=f_lab, fill=mix(BG, BLUE, a))
        yy += 40
        for ln in wrap_text(d, spec.get('use', ''), f_body, W - 2 * M - 56)[:3]:
            d.text((M + 28, yy), ln, font=f_body, fill=col); yy += 48
        del mcol

    def end_card(d, a):
        col = mix(BG, TEXT, a)
        cta = spec.get('cta', 'Save this • Follow for daily chart education')
        first, _, rest = cta.partition('•')
        y = 700 + (1 - ease_out(a)) * 40
        draw_centered(d, y, first.strip(), f_cta1, mix(BG, AMBER, a), W, W - 2 * M)
        draw_centered(d, y + 130, '•', f_cta2, mix(BG, MUTED, a), W)
        draw_centered(d, y + 210, rest.strip(), f_cta2, col, W, W - 2 * M, gap=14)
        pill(d, W / 2, y + 420, brand.upper(), f_brand, mix(BG, AMBER, a), bg=mix(BG, PANEL, a), anchor='center')
        end_line = spec.get('endLine') or 'Every weekday · one concept · one chart'
        d.text(((W - d.textlength(end_line, font=font(30))) / 2, y + 500), end_line, font=font(30), fill=mix(BG, MUTED, a))

    def frame(i):
        t = i / fps
        img = Image.new('RGB', (W, H), BG)
        d = ImageDraw.Draw(img)
        if t < t_hook:
            a = ease_out(t / 0.35)
            out = 1.0 if t < t_hook - 0.25 else ease_out((t_hook - t) / 0.25)
            al = a * out
            pill(d, W / 2, 620, brand.upper(), f_brand, mix(BG, AMBER, al), bg=mix(BG, PANEL, al), anchor='center')
            y = 760 + (1 - a) * 30
            draw_centered(d, y, spec.get('hook', ''), f_hook, mix(BG, TEXT, al), W, W - 2 * M, gap=16)
            d.text(((W - d.textlength(spec.get('series', ''), font=f_series)) / 2, 1200), spec.get('series', ''), font=f_series, fill=mix(BG, MUTED, al))
        elif t < t_hook + t_chart:
            tc = t - t_hook
            p = tc / t_chart
            header(d, ease_out(tc / 0.3))
            chart.draw(d, p)
            # captions: split the chart phase evenly, cross-fading 0.3 s
            n = len(captions)
            seg = t_chart / n
            k = min(n - 1, int(tc / seg))
            local = tc - k * seg
            a_in = ease_out(local / 0.3)
            a_out = 1.0 if (k == n - 1 or local < seg - 0.3) else ease_out((seg - local) / 0.3)
            caption(d, captions[k], a_in * a_out)
        elif t < t_hook + t_chart + t_take:
            tt = t - t_hook - t_chart
            header(d)
            chart.draw(d, 1.0)
            takeaway(d, ease_out(tt / 0.45))
        else:
            te = t - t_hook - t_chart - t_take
            a = ease_out(te / 0.35)
            # the chart lingers underneath, dimmed
            header(d, 1 - 0.8 * a)
            chart.draw(d, 1.0)
            ov = Image.new('RGB', (W, H), BG)
            img = Image.blend(img, ov, 0.88 * a)
            d = ImageDraw.Draw(img)
            end_card(d, a)
        footer(d)
        return img

    return W, H, fps, nframes, total, frame


def ffmpeg_exe():
    if os.environ.get('FFMPEG'):
        return os.environ['FFMPEG']
    p = shutil.which('ffmpeg')
    if p: return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def main():
    spec = json.load(sys.stdin)
    out = spec['out']
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    W, H, fps, nframes, total, frame = render(spec)
    if spec.get('previewFrame') is not None:
        # a single PNG for eyeballing a moment of the video
        frame(int(spec['previewFrame'])).save(out)
        print(json.dumps({'out': out, 'frame': spec['previewFrame']})); return
    exe = ffmpeg_exe()
    if not exe:
        print('no ffmpeg binary: set FFMPEG, install ffmpeg, or `pip install imageio-ffmpeg`', file=sys.stderr); sys.exit(2)
    cmd = [exe, '-y', '-loglevel', 'error',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
           '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
           '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
           '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '64k', out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for i in range(nframes):
            proc.stdin.write(frame(i).tobytes())
    finally:
        proc.stdin.close()
    err = proc.stderr.read().decode('utf8', 'replace')
    if proc.wait() != 0:
        print(err.strip() or 'ffmpeg failed', file=sys.stderr); sys.exit(1)
    print(json.dumps({'out': out, 'seconds': round(total, 2), 'frames': nframes, 'fps': fps, 'width': W, 'height': H}))


if __name__ == '__main__':
    main()
