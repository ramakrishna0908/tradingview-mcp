/**
 * Entry, invalidation, targets and reward-to-risk.
 *
 * The rule that shapes this module: a target is a place the market has already
 * shown it reacts to. Targets are taken from structure — swing levels, the
 * opening range, the previous day's extremes — and only when structure runs
 * out is an ATR projection used, labelled as exactly that.
 *
 * Working backwards from a desired reward-to-risk would always produce a
 * flattering number and never produce a real level, so nothing here consults
 * the ratio while choosing the levels. The ratio is computed last and is
 * allowed to disqualify the setup.
 */

/** Buffer beyond a structural level, so a wick through it is not a stop-out. */
const INVALIDATION_ATR = 0.25;
const MIN_RR = 2;

const round = (v) => (v == null ? null : Number(v.toFixed(2)));

/**
 * Build a plan, or explain why there isn't one.
 *
 * `levels.support` / `levels.resistance` arrive nearest-first from the
 * structure layer. `trigger` is the price the confirmation rule hangs on; the
 * entry zone forms around it rather than at the current print, because the
 * trade does not exist until the trigger does.
 */
export function buildTradePlan({
  direction, price, trigger = null, levels, atr,
  minRR = MIN_RR, horizon = 'intraday',
}) {
  if (price == null || atr == null || !atr) {
    return { actionable: false, reason: 'Price or ATR unavailable — no risk model can be built.' };
  }
  const long = direction === 'bullish';
  const entryAnchor = trigger ?? price;

  // Entry zone: a band around the anchor scaled to the instrument's own range,
  // wider for swing entries which are filled over hours rather than seconds.
  const band = atr * (horizon === 'swing' ? 0.30 : 0.12);
  const entry = long
    ? { low: round(entryAnchor), high: round(entryAnchor + band) }
    : { low: round(entryAnchor - band), high: round(entryAnchor) };

  // Levels are sorted around the CURRENT price, but the trade is entered at the
  // trigger, which often sits on the other side of some of them. Choosing the
  // stop from "first support below price" therefore placed it the wrong side of
  // the entry whenever the trigger had moved past that level — a short stopped
  // out by a fall, which is the direction it profits from. Both stop and target
  // are selected relative to the entry itself, from the combined level set.
  const riskFrom = long ? entry.high : entry.low;
  const stopAnchor = long ? entry.low : entry.high;
  const allLevels = [...(levels.support ?? []), ...(levels.resistance ?? [])];

  const behind = allLevels
    .filter((l) => (long ? l.price < stopAnchor : l.price > stopAnchor))
    .sort((a, b) => (long ? b.price - a.price : a.price - b.price));

  const structural = behind[0]?.price ?? null;
  const invalidation = structural != null
    ? round(long ? structural - atr * INVALIDATION_ATR : structural + atr * INVALIDATION_ATR)
    : round(long ? stopAnchor - atr : stopAnchor + atr);
  const invalidationBasis = structural != null
    ? `${behind[0].kind} at ${round(structural)} ${long ? 'less' : 'plus'} a ${INVALIDATION_ATR} ATR buffer`
    : 'no structural level behind the entry — one ATR used instead';
  const risk = Math.abs(riskFrom - invalidation);
  if (!(risk > 0)) {
    return { actionable: false, reason: 'Invalidation sits inside the entry zone — no definable risk.' };
  }

  // Targets from structure ahead of the entry, nearest first, for the same
  // reason: what counts as "ahead" is measured from the entry, not from where
  // the stock happens to be trading now.
  const structuralTargets = allLevels
    .filter((l) => (long ? l.price > riskFrom : l.price < riskFrom))
    .sort((a, b) => (long ? a.price - b.price : b.price - a.price))
    .map((l) => ({ price: round(l.price), basis: l.kind }))
    .slice(0, 3);

  const targets = [...structuralTargets];
  // Only if structure offers nothing ahead, and clearly marked.
  if (!targets.length) {
    targets.push({
      price: round(long ? riskFrom + atr * 1.5 : riskFrom - atr * 1.5),
      basis: '1.5 ATR projection — no structural level ahead',
      projected: true,
    });
  }

  const reward = Math.abs(targets[0].price - riskFrom);
  const rr = risk > 0 ? reward / risk : null;

  // Validate at the resolution a human actually trades at. On a low-priced
  // name with a small range, the entry, its band and the first level can all
  // round to the same cent — arithmetic that is fine in floating point but
  // describes a trade with no distance in it. Reject rather than print an
  // entry and a target that read as the same number.
  const indistinguishable = targets[0].price === riskFrom
    || round(reward) === 0
    || invalidation === riskFrom;

  // A projected target is context, never a qualification. Letting one satisfy
  // the reward-to-risk test would manufacture exactly the flattering ratio this
  // module exists to prevent: stretch the projection far enough and every setup
  // clears the bar while pointing at a level nothing has ever traded against.
  const projectedOnly = Boolean(targets[0].projected);

  return {
    actionable: rr != null && rr >= minRR && !projectedOnly && !indistinguishable,
    projectedOnly,
    indistinguishable,
    direction,
    horizon,
    trigger: trigger != null ? round(trigger) : null,
    entry,
    invalidation,
    invalidationBasis,
    targets,
    risk: round(risk),
    reward: round(reward),
    rr: rr == null ? null : Number(rr.toFixed(2)),
    minRR,
    reason: indistinguishable
      ? 'Entry, invalidation and target are not separable at this price — the levels round to the same tick, so there is no trade to describe.'
      : projectedOnly
      ? 'No structural level ahead of the entry, so no target the market has actually reacted to. Reward-to-risk cannot be assessed against a projection.'
      : rr != null && rr < minRR
        ? `Reward-to-risk is ${rr.toFixed(2)}:1 against a ${minRR}:1 minimum — the first real level ahead is too close to the invalidation to pay for the risk.`
        : null,
  };
}

/**
 * Does the first target sit inside what the options market expects the stock to
 * move by expiry? A target beyond the expected move is not impossible, but on a
 * 0DTE contract it is a low-probability ask and the report should say so
 * instead of printing a flattering ratio.
 */
export function targetVsExpectedMove(plan, expectedMove, price) {
  if (!plan?.targets?.length || expectedMove?.absolute == null || price == null) {
    return { withinExpectedMove: null, note: 'Expected move unavailable.' };
  }
  const needed = Math.abs(plan.targets[0].price - price);
  const within = needed <= expectedMove.absolute;
  return {
    withinExpectedMove: within,
    requiredMove: round(needed),
    expectedMove: round(expectedMove.absolute),
    note: within
      ? `Target 1 needs ${round(needed)} against an expected move of ${round(expectedMove.absolute)} — inside what the chain is pricing.`
      : `Target 1 needs ${round(needed)} but the chain prices a move of only ${round(expectedMove.absolute)} by expiry — an outsized ask for this contract.`,
  };
}
