import type { Role } from '../types';

// ── Capability definitions ────────────────────────────────────────────────────
// Each capability maps to a UI gate and a Firestore rule.
// Keep in sync with firestore.rules helper functions.
export type Capability =
  // User / settings management
  | 'manage_settings'
  | 'manage_users'
  | 'manage_products'
  | 'manage_country_rates'     // admin only — FOB exchange rates
  // Warehouse operations
  | 'warehouse_mode'           // access Warehouse Mode scan screen
  | 'receive_stock'            // full costed receiving page
  | 'transfer_stock'           // Move Stock page (transfers + ownership)
  | 'adjust_stock'
  | 'perform_count'            // create/submit stock counts
  // Approvals
  | 'approve_adjustment'       // approve stock count corrections for any shop
  | 'approve_own_shop_adjustment' // shop_manager: approve for assigned shops only
  | 'approve_own_shop_damage'  // shop_manager: approve damage for assigned shops only
  | 'approve_ownership_transfer'
  | 'override_negative'
  // Cost / financial visibility
  | 'view_costs'               // see FOB, cost, total value, margin
  // Reporting
  | 'view_reports'
  | 'export_reports'
  | 'view_notifications'
  | 'review_operations'        // office/purchase_manager review-only view
  // Other
  | 'delete_records'
  | 'request_stock'
  | 'confirm_transfer';

// ── Role → capabilities matrix ─────────────────────────────────────────────────
// Business rules (from FINAL ROLE MATRIX brief):
//
//  admin           Full access. Country rates. User management. All shops.
//  office          All data/reports/notifications. No warehouse ops.
//  purchase_manager All data/reports. View costs. Review ops. No warehouse mode.
//  shop_manager    Daily ops for assigned shop only. Receive, move, count, damage,
//                  approve corrections and damage for OWN shop. View reports for own shop.
//  warehouse_staff Warehouse Mode only for assigned shop. No costs. No approvals.
//  auditor         Read-only reports and audit logs. No cost visibility.
//
const MATRIX: Record<Role, Capability[]> = {
  admin: [
    'manage_settings', 'manage_users', 'manage_products', 'manage_country_rates',
    'warehouse_mode', 'receive_stock', 'transfer_stock', 'adjust_stock', 'perform_count',
    'approve_adjustment', 'approve_own_shop_adjustment', 'approve_own_shop_damage',
    'approve_ownership_transfer', 'override_negative',
    'view_costs', 'view_reports', 'export_reports', 'view_notifications', 'review_operations',
    'delete_records', 'request_stock', 'confirm_transfer',
  ],

  // Office: full visibility, review-only. No warehouse scanning or stock operations.
  office: [
    'view_costs', 'view_reports', 'export_reports', 'view_notifications', 'review_operations',
    'approve_adjustment', 'approve_own_shop_damage',
  ],

  // Purchase Manager: cost visibility, all reports, review ops. No warehouse mode.
  purchase_manager: [
    'manage_products', 'receive_stock', 'transfer_stock', 'adjust_stock', 'perform_count',
    'approve_adjustment', 'approve_own_shop_adjustment', 'approve_own_shop_damage',
    'approve_ownership_transfer', 'override_negative',
    'view_costs', 'view_reports', 'export_reports', 'view_notifications', 'review_operations',
    'request_stock', 'confirm_transfer',
  ],

  // Shop Manager: all daily ops, but scoped to assignedShopIds.
  // Can approve stock corrections and damage for their own shops.
  // Cannot manage users, country rates, or see other shops' data.
  shop_manager: [
    'receive_stock', 'transfer_stock', 'adjust_stock', 'perform_count',
    'approve_own_shop_adjustment', 'approve_own_shop_damage',
    'approve_ownership_transfer', 'override_negative',
    'view_reports', 'view_notifications', 'confirm_transfer',
    // Note: shop_manager does NOT have view_costs — cost history and FOB are
    // purchase/admin-level data. Remove this line if policy changes.
  ],

  // Warehouse Staff: Warehouse Mode only for assigned shop.
  // No costs, no approvals, no reports, no admin.
  warehouse_staff: [
    'warehouse_mode', 'transfer_stock', 'perform_count',
  ],

  // Auditor: read-only. Reports and audit logs. No cost visibility per policy.
  auditor: [
    'view_reports', 'export_reports', 'review_operations',
  ],
};

export function can(role: Role | undefined, cap: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(cap);
}

// Shop scoping: shop_manager and warehouse_staff see only assignedShopIds.
// All other roles see all shops ([] = all).
export function scopedShopIds(
  role: Role | undefined,
  assigned: string[],
  allShopIds: string[],
): string[] {
  if (role === 'shop_manager' || role === 'warehouse_staff') return assigned;
  return allShopIds;
}
