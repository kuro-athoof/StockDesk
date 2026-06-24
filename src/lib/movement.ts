import {
  doc, runTransaction, collection, serverTimestamp,
} from 'firebase/firestore';
import { db, COL } from './firebase';
import type { AppUser, Balance, MovementAction, Variant } from '../types';

export function balanceId(variantId: string, ownerShopId: string): string {
  return `${variantId}__${ownerShopId}`;
}

export class NegativeStockError extends Error {
  available: number;
  requested: number;
  constructor(available: number, requested: number) {
    super(`Insufficient stock: ${available} available, ${requested} requested`);
    this.name = 'NegativeStockError';
    this.available = available;
    this.requested = requested;
  }
}

export class PermissionError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PermissionError'; }
}

interface MovementInput {
  variant: Variant;
  ownerShopId: string;
  qtyChanged: number;          // signed: + adds, - removes
  unit: string;
  action: MovementAction;
  user: AppUser;
  remarks?: string;
  refId?: string;
  locationId?: string;
  // when the new balance would go negative, only allowed if canOverride is true
  canOverride: boolean;
  // roll delta for fabrics (informational)
  rollDelta?: number;
}

/**
 * The single chokepoint for every stock change. Runs atomically:
 *  1. reads current balance
 *  2. enforces negative-stock rule (block unless canOverride)
 *  3. writes new balance
 *  4. writes immutable audit log (+ a NEGATIVE_OVERRIDE record when overridden)
 *
 * Returns the new quantity.
 */
export async function applyMovement(input: MovementInput): Promise<number> {
  const {
    variant, ownerShopId, qtyChanged, unit, action, user,
    remarks, refId, locationId, canOverride, rollDelta,
  } = input;

  const bId = balanceId(variant.id, ownerShopId);
  if (!db) throw new Error('Firebase not configured — applyMovement requires live mode');
  const fdb = db;
  const balRef = doc(fdb, COL.balances, bId);
  const auditRef = doc(collection(fdb, COL.audit));

  return runTransaction(fdb, async (tx) => {
    const balSnap = await tx.get(balRef);
    const before: number = balSnap.exists() ? (balSnap.data() as Balance).quantity : 0;
    const beforeRolls: number = balSnap.exists() ? ((balSnap.data() as Balance).rollCount ?? 0) : 0;
    const after = before + qtyChanged;

    let overrideBy: string | undefined;
    if (after < 0) {
      if (!canOverride) {
        throw new NegativeStockError(before, Math.abs(qtyChanged));
      }
      // manager override — record who authorized it
      overrideBy = user.uid;
    }

    const newRolls = Math.max(0, beforeRolls + (rollDelta ?? 0));

    const balanceData: Balance = {
      id: bId,
      variantId: variant.id,
      productId: variant.productId,
      ownerShopId,
      quantity: after,
      unit,
      rollCount: variant.productType === 'general' ? undefined : newRolls,
      locationId: locationId ?? (balSnap.exists() ? (balSnap.data() as Balance).locationId : undefined),
      updatedAt: Date.now(),
    };
    // strip undefined for Firestore (write the sanitized record, not the original)
    const balanceRecord = balanceData as unknown as Record<string, unknown>;
    Object.keys(balanceRecord).forEach(
      (k) => balanceRecord[k] === undefined && delete balanceRecord[k]
    );

    tx.set(balRef, balanceRecord);

    tx.set(auditRef, {
      timestamp: Date.now(),
      serverTime: serverTimestamp(),
      userId: user.uid,
      userName: user.name,
      action,
      productId: variant.productId,
      variantId: variant.id,
      ownerShopId,
      qtyBefore: before,
      qtyChanged,
      qtyAfter: after,
      ...(remarks ? { remarks } : {}),
      ...(refId ? { refId } : {}),
      ...(overrideBy ? { overrideBy } : {}),
    });

    // a separate explicit override record for clear reporting
    if (overrideBy) {
      const ovRef = doc(collection(fdb, COL.audit));
      tx.set(ovRef, {
        timestamp: Date.now() + 1,
        serverTime: serverTimestamp(),
        userId: user.uid,
        userName: user.name,
        action: 'NEGATIVE_OVERRIDE' as MovementAction,
        productId: variant.productId,
        variantId: variant.id,
        ownerShopId,
        qtyBefore: before,
        qtyChanged: 0,
        qtyAfter: after,
        remarks: `Negative balance authorized by ${user.name}. ${remarks ?? ''}`.trim(),
        ...(refId ? { refId } : {}),
        overrideBy: user.uid,
      });
    }

    return after;
  });
}

/**
 * Ownership transfer: removes qty from source shop, adds to destination shop,
 * both within one logical operation (two sequential movements). Requires
 * approve_ownership_transfer capability — checked by caller.
 */
export async function applyOwnershipTransfer(args: {
  variant: Variant;
  fromShopId: string;
  toShopId: string;
  qty: number;
  unit: string;
  user: AppUser;
  remarks?: string;
  refId?: string;
  toLocationId?: string;
  canOverride: boolean;
  rolls?: number;
}): Promise<void> {
  const { variant, fromShopId, toShopId, qty, unit, user, remarks, refId, toLocationId, canOverride, rolls } = args;

  await applyMovement({
    variant, ownerShopId: fromShopId, qtyChanged: -qty, unit,
    action: 'OWNERSHIP_TRANSFER', user, remarks: `Out → ${toShopId}. ${remarks ?? ''}`.trim(),
    refId, canOverride, rollDelta: rolls ? -rolls : undefined,
  });
  await applyMovement({
    variant, ownerShopId: toShopId, qtyChanged: qty, unit,
    action: 'OWNERSHIP_TRANSFER', user, remarks: `In ← ${fromShopId}. ${remarks ?? ''}`.trim(),
    refId, locationId: toLocationId, canOverride: true, rollDelta: rolls,
  });
}

// ── Atomic line spec for multi-line / multi-balance operations ────────────────
export interface MovementLineSpec {
  variant: Variant;
  ownerShopId: string;
  qtyChanged: number;
  unit: string;
  rollDelta?: number;
  remarks?: string;
}

/**
 * Atomically apply many balance changes + their audit logs in ONE transaction.
 * Used by transfers (all lines succeed or none) and ownership moves.
 * Also optionally flips a document's status in the same transaction (used by
 * transfer send / damage approval / count approval) so stock and status can
 * never diverge.
 *
 * Idempotency + legal-transition guard:
 *   If `statusDoc` is provided, the transaction first re-reads that document and
 *   verifies it still has `expectStatus`. If not (already processed, or changed),
 *   it throws DuplicateOperationError and nothing is written. This prevents
 *   double-deduction from a duplicate approve/send click.
 */
export class DuplicateOperationError extends Error {
  constructor(msg: string) { super(msg); this.name = 'DuplicateOperationError'; }
}

export class ConflictError extends Error {
  readonly conflicts: string[];
  constructor(conflicts: string[]) {
    super(`Stock changed after count was submitted. Please recount.\n\nConflicts:\n${conflicts.join('\n')}`);
    this.name = 'ConflictError';
    this.conflicts = conflicts;
  }
}

export async function applyAtomicBatch(args: {
  lines: MovementLineSpec[];
  action: MovementAction;
  user: AppUser;
  refId?: string;
  canOverride: boolean;
  statusDoc?: { collection: string; id: string; expectStatus: string; newFields: Record<string, unknown> };
  // P2: optional conflict checks run INSIDE the transaction after reading balances.
  // Each entry specifies expected balance values; if the current value differs,
  // the transaction aborts with a ConflictError — preventing stale count approvals.
  conflictChecks?: Array<{
    variantId: string;
    ownerShopId: string;
    expectedQty: number;
    expectedRolls?: number;
    label?: string;  // human-readable identifier for the error message
  }>;
}): Promise<void> {
  const { lines, action, user, refId, canOverride, statusDoc, conflictChecks } = args;
  if (!db) throw new Error('Firebase not configured — applyAtomicBatch requires live mode');
  const fdb = db;

  await runTransaction(fdb, async (tx) => {
    // 1. If guarding a status doc, re-read and verify legal transition FIRST.
    let statusRef;
    if (statusDoc) {
      statusRef = doc(fdb, statusDoc.collection, statusDoc.id);
      const snap = await tx.get(statusRef);
      if (!snap.exists()) throw new DuplicateOperationError('Record no longer exists');
      const cur = snap.data() as Record<string, unknown>;
      if (cur.status !== statusDoc.expectStatus) {
        throw new DuplicateOperationError(`Already processed (status is "${cur.status}", expected "${statusDoc.expectStatus}")`);
      }
    }

    // P3: group lines by balance key BEFORE reading — multiple lines targeting
    // the same (variantId + ownerShopId) must be aggregated into a single delta
    // so we read each balance doc exactly once and write it exactly once.
    // Without this, two lines both reading "before=100" would each compute
    // independently, and the second write would overwrite the first.
    type AggLine = {
      variant: Variant;
      ownerShopId: string;
      unit: string;
      qtyDelta: number;
      rollDelta: number;
      remarks: string[];
    };
    const aggMap = new Map<string, AggLine>();
    for (const l of lines) {
      const bId = balanceId(l.variant.id, l.ownerShopId);
      const existing = aggMap.get(bId);
      if (existing) {
        existing.qtyDelta  += l.qtyChanged;
        existing.rollDelta += l.rollDelta ?? 0;
        if (l.remarks) existing.remarks.push(l.remarks);
      } else {
        aggMap.set(bId, {
          variant: l.variant, ownerShopId: l.ownerShopId, unit: l.unit,
          qtyDelta: l.qtyChanged, rollDelta: l.rollDelta ?? 0,
          remarks: l.remarks ? [l.remarks] : [],
        });
      }
    }
    const aggLines = [...aggMap.entries()]; // [bId, AggLine][]

    // 2. Read all (unique) balances — Firestore requires all reads before writes.
    const reads = await Promise.all(aggLines.map(([bId, agg]) =>
      tx.get(doc(fdb, COL.balances, bId)).then((snap) => ({ bId, agg, snap })),
    ));

    // 3. P2: In-transaction conflict checks — run AFTER reading balances so we
    // compare against the authoritative live value, not stale React state.
    // If a balance changed between count submission and approval, abort.
    if (conflictChecks && conflictChecks.length > 0) {
      const conflictMessages: string[] = [];
      for (const check of conflictChecks) {
        const bId = balanceId(check.variantId, check.ownerShopId);
        // Find in already-read set to avoid a second read for the same balance.
        const existingRead = reads.find((r) => r.bId === bId);
        const balSnap = existingRead ? existingRead.snap : await tx.get(doc(fdb, COL.balances, bId));
        const currentQty   = balSnap.exists() ? Math.round((balSnap.data() as Balance).quantity * 100) / 100 : 0;
        const currentRolls = balSnap.exists() ? ((balSnap.data() as Balance).rollCount ?? 0) : 0;
        if (
          Math.abs(currentQty - check.expectedQty) > 0.001 ||
          (check.expectedRolls !== undefined && currentRolls !== check.expectedRolls)
        ) {
          conflictMessages.push(
            `${check.label ?? check.variantId}: expected ${check.expectedQty} qty${check.expectedRolls !== undefined ? ` / ${check.expectedRolls} PCS` : ''}, ` +
            `current ${currentQty} qty / ${currentRolls} PCS`,
          );
        }
      }
      if (conflictMessages.length > 0) throw new ConflictError(conflictMessages);
    }

    // 4. Validate negative-stock rule across all aggregated lines.
    for (const { agg, snap } of reads) {
      const before = snap.exists() ? (snap.data() as Balance).quantity : 0;
      const after = before + agg.qtyDelta;
      if (after < 0 && !canOverride) {
        throw new NegativeStockError(before, Math.abs(agg.qtyDelta));
      }
    }

    // 4. Write one balance doc + one audit log per unique balance key.
    for (const { bId, agg, snap } of reads) {
      const before       = snap.exists() ? (snap.data() as Balance).quantity : 0;
      const beforeRolls  = snap.exists() ? ((snap.data() as Balance).rollCount ?? 0) : 0;
      const after        = before + agg.qtyDelta;
      const newRolls     = Math.max(0, beforeRolls + agg.rollDelta);

      const balanceData: Record<string, unknown> = {
        id: bId, variantId: agg.variant.id, productId: agg.variant.productId,
        ownerShopId: agg.ownerShopId, quantity: after, unit: agg.unit,
        rollCount: agg.variant.productType === 'general' ? undefined : newRolls,
        locationId: snap.exists() ? (snap.data() as Balance).locationId : undefined,
        updatedAt: Date.now(),
      };
      Object.keys(balanceData).forEach((k) => balanceData[k] === undefined && delete balanceData[k]);
      tx.set(doc(fdb, COL.balances, bId), balanceData);

      const combinedRemarks = agg.remarks.join(' | ');
      const auditRef = doc(collection(fdb, COL.audit));
      tx.set(auditRef, {
        timestamp: Date.now(), serverTime: serverTimestamp(),
        userId: user.uid, userName: user.name, action,
        productId: agg.variant.productId, variantId: agg.variant.id, ownerShopId: agg.ownerShopId,
        qtyBefore: before, qtyChanged: agg.qtyDelta, qtyAfter: after,
        ...(combinedRemarks ? { remarks: combinedRemarks } : {}),
        ...(refId ? { refId } : {}),
      });
    }

    // 5. Flip the status doc in the SAME transaction (atomic with stock).
    if (statusDoc && statusRef) {
      tx.update(statusRef, statusDoc.newFields);
    }
  });
}
