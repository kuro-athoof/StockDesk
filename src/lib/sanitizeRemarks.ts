/**
 * sanitizeRemarks — strip financial phrases from audit log remarks
 * for users without view_costs permission.
 *
 * Original record in Firestore is never touched. This is display-only.
 * Patterns removed: ", cost X/unit", ", value X MVR", "MVR X" amounts.
 *
 * Example:
 *   in:  "Receiving RCV-001: +262 Muh, 10 pcs, cost 9.60/Muh, value 2515.20 MVR"
 *   out: "Receiving RCV-001: +262 Muh, 10 pcs"
 */
export function sanitizeRemarks(remarks: string | null | undefined, showCosts: boolean): string {
  if (!remarks) return '—';
  if (showCosts) return remarks;
  return remarks
    // ", cost 9.60/Muh" or ", cost 9.60 Muh"
    .replace(/,?\s*cost\s+[\d.,]+\s*\/?\s*\w+/gi, '')
    // ", value 2515.20 MVR"
    .replace(/,?\s*value\s+[\d.,]+\s*MVR/gi, '')
    // standalone "MVR 2515.20" amounts
    .replace(/\bMVR\s+[\d.,]+\b/gi, '')
    // clean up trailing comma/space artifacts
    .replace(/,\s*$/, '')
    .trim();
}
