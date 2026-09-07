/**
 * Price formatting shared by the post generator, the chart and the table.
 *
 * The stock sweep is all >= $1, where two decimals is right and always was.
 * The crypto sweep spans several orders of magnitude in one report (BTC in
 * the tens of thousands, XLM and DOGE in cents), so a fixed toFixed(2) would
 * round every sub-dollar level to the same number and collapse a post's
 * support, resistance and invalidation lines into one another. The decimal
 * count is therefore chosen from the magnitude of the value.
 *
 * Defaults are byte-identical to the previous behaviour for any value >= $1:
 * two decimals, no thousands grouping. Grouping is opt-in per config
 * (`priceGrouping`) so the stock posts keep the exact formatting they have.
 */

/**
 * Decimals to show for a price.
 *
 * At or above $1 this is a flat 2, which is every equity and leaves the stock
 * posts byte-identical. Below $1 it keeps a constant ~5 significant digits, so
 * a coin at $0.19412 prints all five digits rather than collapsing to $0.19,
 * and one at $0.0000123456 still shows real precision instead of $0.00.
 */
export function priceDecimals(v, { compact = false } = {}) {
  const a = Math.abs(Number(v));
  if (!Number.isFinite(a) || a === 0) return 2;
  // Compact display (the sweep format): whole dollars once a price is in the
  // thousands — "$2,579" reads better on a phone than "$2,578.88", and the
  // compliance check accepts any value that the report level rounds to at the
  // precision shown, so nothing is lost on integrity.
  if (compact && a >= 1000) return 0;
  if (a >= 1) return 2;
  return Math.min(12, Math.max(4, 4 - Math.floor(Math.log10(a))));
}

/** Round to the precision that magnitude deserves (used for candle data). */
export function roundPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return n;
  return Number(n.toFixed(priceDecimals(n)));
}

/**
 * "$82.84" · "$0.1945" · "$79,610.00" (grouped only when asked).
 * Returns "—" for a missing value so table cells stay aligned.
 */
export function fmtPrice(v, { prefix = '$', grouping = false, compact = false } = {}) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  const d = priceDecimals(n, { compact });
  const body = grouping
    ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    : n.toFixed(d);
  return prefix + body;
}
