/* Exact arithmetic for an explicitly dated shop snapshot, not a live-price claim. */
const valid = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const unsafeIds = new Set(['__proto__', 'constructor', 'prototype']);
const idIsValid = id => typeof id === 'string' && id.trim().length > 0
  && id.length <= 200 && !unsafeIds.has(id);

function checkIds(records, label, maximum) {
  if (!Array.isArray(records) || records.length > maximum) throw new Error('Invalid ' + label + ' catalog');
  const ids = new Set();
  for (const record of records) {
    if (!record || !idIsValid(record.id)) throw new Error('Invalid ' + label + ' identifier');
    if (ids.has(record.id)) throw new Error('Duplicate ' + label + ' identifier: ' + record.id);
    ids.add(record.id);
  }
  return ids;
}

/** Minimum cents, then minimum excess Quna, then fewest transactions.
 * Positive pack prices bound the search below target + largest pack.
 * Store one predecessor per amount, not a copy of the entire purchase history.
 */
export function cheapestQuna(packs, target) {
  if (!valid(target, 100000)) throw new RangeError('Invalid Quna target');
  checkIds(packs, 'pack', 128);
  if (packs.some(p => !valid(p.quna, 100000) || p.quna === 0
      || !valid(p.usd_cents, 1000000) || p.usd_cents === 0
      || !valid(p.mileage, 1000000))) throw new Error('Invalid pack catalog');
  if (target === 0) return {costCents: 0, quna: 0, mileage: 0, packs: {}, transactions: 0};
  if (!packs.length) throw new Error('Cannot satisfy desired Quna: no packs');
  const unit = packs.map(p => p.quna).reduce(gcd);
  const maxAmount = Math.ceil((target + Math.max(...packs.map(p => p.quna)) - 1) / unit);
  const costs = new Float64Array(maxAmount + 1).fill(Infinity);
  const counts = new Uint32Array(maxAmount + 1);
  const previousPack = new Int16Array(maxAmount + 1).fill(-1);
  costs[0] = 0;
  for (let q = 0; q <= maxAmount; q++) {
    if (!Number.isFinite(costs[q])) continue;
    for (let i = 0; i < packs.length; i++) {
      const next = q + packs[i].quna / unit;
      if (next > maxAmount) continue;
      const cost = costs[q] + packs[i].usd_cents, count = counts[q] + 1;
      if (cost < costs[next] || (cost === costs[next] && count < counts[next])) {
        costs[next] = cost;
        counts[next] = count;
        previousPack[next] = i;
      }
    }
  }
  let winner = -1;
  for (let q = Math.ceil(target / unit); q <= maxAmount; q++) {
    if (!Number.isFinite(costs[q])) continue;
    // Iteration is ascending, so equal-cost winners already minimize excess.
    if (winner < 0 || costs[q] < costs[winner]) winner = q;
  }
  if (winner < 0) throw new Error('Cannot satisfy desired Quna');
  const quantities = {};
  let mileage = 0, q = winner;
  while (q > 0) {
    const p = packs[previousPack[q]];
    if (!p) throw new Error('Invalid top-up reconstruction');
    quantities[p.id] = (Object.hasOwn(quantities, p.id) ? quantities[p.id] : 0) + 1;
    mileage += p.mileage;
    q -= p.quna / unit;
  }
  return {costCents: costs[winner], quna: winner * unit, mileage,
    packs: quantities, transactions: counts[winner]};
}

export function wardrobeQuote(catalog, opts = {}) {
  if (!catalog || !Array.isArray(catalog.products) || !Array.isArray(catalog.packs)) throw new Error('Shop data missing');
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw new Error('Invalid inputs');
  const ids = checkIds(catalog.products, 'product', 10000);
  const selection = name => {
    const values = opts[name] ?? [];
    if (!Array.isArray(values) || values.length > 10000 || values.some(id => !idIsValid(id))) {
      throw new Error('Invalid selection input: ' + name);
    }
    for (const id of values) if (!ids.has(id)) throw new Error('Unknown item ' + id);
    return new Set(values);
  };
  const wanted = selection('wanted'), owned = selection('owned');
  const wallet = opts.walletQuna ?? 0, changes = opts.dyeChanges ?? 0;
  const perDye = opts.dyeQunaEach ?? null, budget = opts.budgetCents ?? null;
  if (!valid(wallet, 100000) || !valid(changes, 50)
      || !(perDye === null || valid(perDye, 10000))
      || !(budget === null || valid(budget, 10000000))) throw new RangeError('Invalid inputs');
  const remaining = catalog.products.filter(p => wanted.has(p.id) && !owned.has(p.id));
  let cashDirect = 0, qunaNeed = 0, knownMileage = 0, costIncomplete = false, mileageIncomplete = false;
  const unknown = [];
  for (const p of remaining) {
    if (p.category === 'Earned in-game') {
      costIncomplete = true;
      unknown.push(p.name + ': Kina cost / offer not verified');
      continue;
    }
    const cash = p.usd_cents ?? null, quna = p.quna ?? null;
    if (cash === null && quna === null) {
      costIncomplete = true;
      unknown.push(p.name + ': price unknown');
    } else {
      if (cash !== null) {
        if (!valid(cash, 1000000)) throw new Error('Invalid price');
        cashDirect += cash;
      }
      if (quna !== null) {
        if (!valid(quna, 100000)) throw new Error('Invalid Quna');
        qunaNeed += quna;
      }
    }
    if (p.mileage == null) {
      mileageIncomplete = true;
      unknown.push(p.name + ': Mileage not verified');
    } else if (valid(p.mileage, 1000000)) knownMileage += p.mileage;
    else throw new Error('Invalid Mileage');
  }
  if (changes) {
    if (perDye === null) { costIncomplete = true; unknown.push('Dye costs not entered'); }
    else qunaNeed += changes * perDye;
  }
  const topup = cheapestQuna(catalog.packs, Math.max(0, qunaNeed - wallet));
  const subtotalCents = cashDirect + topup.costCents;
  return {wanted: [...wanted], owned: [...owned], remaining: remaining.map(p => p.id),
    cashDirect, qunaNeed, topup, subtotalCents, knownMileage: knownMileage + topup.mileage,
    mileageIncomplete, costIncomplete, unknown, balanceQuna: wallet + topup.quna - qunaNeed,
    budgetStatus: budget === null ? 'not-set' : costIncomplete ? 'incomplete' : subtotalCents <= budget ? 'within' : 'over'};
}

/** Parse cents from decimal text, avoiding binary floating-point rejection. */
export function parseNumericInput(text, scale = 1, blank = null) {
  if (typeof text !== 'string' || ![1, 100].includes(scale)) return NaN;
  text = text.trim();
  if (text === '') return blank;
  const pattern = scale === 100 ? /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/ : /^\d+$/;
  if (!pattern.test(text)) return NaN;
  const [whole, fraction = ''] = text.split('.');
  const n = Number(whole || '0') * scale + (scale === 100 ? Number(fraction.padEnd(2, '0')) : 0);
  return Number.isSafeInteger(n) && n >= 0 ? n : NaN;
}

/** Validate the entire imported plan before changing any controls or selection. */
export function validateWardrobePlan(plan, catalog) {
  if (!plan || plan.schema !== 1 || plan.snapshot !== catalog?.as_of || plan.region !== catalog?.region) {
    throw new Error('Plan snapshot or region does not match this catalog');
  }
  if (!Array.isArray(plan.wanted) || !Array.isArray(plan.owned)
      || !plan.parameters || typeof plan.parameters !== 'object' || Array.isArray(plan.parameters)) {
    throw new Error('Invalid plan inputs');
  }
  const parameters = {
    walletQuna: plan.parameters.walletQuna ?? 0,
    dyeChanges: plan.parameters.dyeChanges ?? 0,
    dyeQunaEach: plan.parameters.dyeQunaEach ?? null,
    budgetCents: plan.parameters.budgetCents ?? null
  };
  wardrobeQuote(catalog, {...parameters, wanted: plan.wanted, owned: plan.owned});
  return {wanted: [...new Set(plan.wanted)], owned: [...new Set(plan.owned)], parameters};
}
