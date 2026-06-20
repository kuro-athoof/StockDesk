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
