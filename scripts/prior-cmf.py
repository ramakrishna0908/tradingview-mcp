#!/usr/bin/env python3
"""Extract per-symbol CMF history from the most recent prior daily reports.

The daily report is a single-day snapshot with no memory of the day before, so
the CMF *trend* (which the methodology treats as the leading tell) was invisible.
This parses the previous N reports and emits a compact table the report prompt
embeds, so the model can render a CMF-delta column without re-reading HTML.

Usage:  prior-cmf.py <reports_dir> <today_iso> [n_back]
Prints one line per symbol:  SYM  <oldest> ... <newest>
Prints nothing if no prior report is parseable (first run, or a wiped dir).
"""
import glob
import html
import os
import re
import sys


def _norm(s):
    return re.sub(r"\s+", "", s)


def parse_report(path):
    """Return {sym: cmf_float} for one report, or {} if it can't be parsed."""
    try:
        s = open(path, encoding="utf-8").read()
        head = re.search(r"<thead.*?</thead>", s, re.S)
        body = re.search(r"<tbody.*?</tbody>", s, re.S)
        if not head or not body:
            return {}
        hdr = [
            _norm(html.unescape(re.sub(r"<[^>]+>", "", c)))
            for c in re.findall(r"<th.*?</th>", head.group(0), re.S)
        ]
        if "CMF" not in hdr or "Sym" not in hdr:
            return {}
        out = {}
        for row in re.findall(r"<tr.*?</tr>", body.group(0), re.S):
            cells = [
                html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                for c in re.findall(r"<t[dh].*?</t[dh]>", row, re.S)
            ]
            if len(cells) < len(hdr):
                continue
            d = dict(zip(hdr, cells))
            # The Sym cell may carry badges ("A" = Anness list, U+25C9 standing
            # watch, U+2691 catalyst flag). Keep only the leading ticker token.
            sym = ""
            for tok in d.get("Sym", "").split():
                if re.fullmatch(r"[A-Z][A-Z0-9.\-]*", tok):
                    sym = tok
                    break
            # U+2212 minus is what the report renders for negatives.
            raw = d.get("CMF", "").replace("−", "-").replace("+", "").strip()
            try:
                out[sym] = float(raw)
            except ValueError:
                continue
        return out
    except Exception:
        return {}


def main():
    if len(sys.argv) < 3:
        return 0
    reports_dir, today = sys.argv[1], sys.argv[2]
    n_back = int(sys.argv[3]) if len(sys.argv) > 3 else 2

    files = sorted(glob.glob(os.path.join(reports_dir, "daily-*.html")))
    # Exclude today's own report so a re-run doesn't diff against itself.
    files = [f for f in files if today not in os.path.basename(f)]

    days = []
    for f in reversed(files):
        parsed = parse_report(f)
        if parsed:
            days.append((os.path.basename(f)[6:16], parsed))
        if len(days) == n_back:
            break
    days.reverse()
    if not days:
        return 0

    syms = sorted({s for _, d in days for s in d})
    print("  ".join(["SYM".ljust(6)] + [d[0] for d in days]))
    for s in syms:
        vals = []
        for _, d in days:
            vals.append(f"{d[s]:+.2f}" if s in d else "  n/a")
        print("  ".join([s.ljust(6)] + [v.rjust(10) for v in vals]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
