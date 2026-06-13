import type { CountryRate } from '../types';

/**
 * Formula rate mirrors PurchaseDesk costing logic:
 *   base = mvrPerUsd / currencyPerUsd   (MVR per 1 unit of foreign currency)
 *   withCof = base * (1 + cof%)
 *   withMarkup = withCof * (1 + markup%)
 * GST is applied at selling stage, not to landed cost, so it's stored but not
 * folded into formulaRate here.
 */
export function computeFormulaRate(r: Pick<CountryRate,
  'currencyPerUsd' | 'mvrPerUsd' | 'cofPct' | 'markupPct'>): number {
  if (!r.currencyPerUsd) return 0;
  const base = r.mvrPerUsd / r.currencyPerUsd;
  const withCof = base * (1 + (r.cofPct || 0) / 100);
  const withMarkup = withCof * (1 + (r.markupPct || 0) / 100);
  return Math.round(withMarkup * 10000) / 10000;
}

/** Landed cost of a line = foreignCost * finalUsedRate */
export function landedCost(foreignCost: number, rate: CountryRate): number {
  const r = rate.finalUsedRate || rate.formulaRate;
  return Math.round(foreignCost * r * 100) / 100;
}
