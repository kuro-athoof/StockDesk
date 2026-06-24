import type { Role } from '../types';

// Capability keys used across the app and mirrored in Firestore rules.
export type Capability =
  | 'manage_settings'
  | 'manage_users'
  | 'manage_products'
  | 'receive_stock'
  | 'transfer_stock'
  | 'adjust_stock'
  | 'approve_adjustment'
  | 'approve_ownership_transfer'
  | 'override_negative'
  | 'perform_count'
  | 'view_costs'
  | 'view_reports'
  | 'export_reports'
  | 'delete_records'
  | 'request_stock'
  | 'confirm_transfer';

const MATRIX: Record<Role, Capability[]> = {
  admin: [
    'manage_settings', 'manage_users', 'manage_products', 'receive_stock',
    'transfer_stock', 'adjust_stock', 'approve_adjustment', 'approve_ownership_transfer',
    'override_negative', 'perform_count', 'view_costs', 'view_reports',
    'export_reports', 'delete_records', 'request_stock', 'confirm_transfer',
  ],
  purchase_manager: [
    'manage_products', 'receive_stock', 'transfer_stock', 'adjust_stock',
    'approve_adjustment', 'approve_ownership_transfer', 'override_negative',
    'perform_count', 'view_costs', 'view_reports', 'export_reports',
    'request_stock', 'confirm_transfer',
  ],
  shop_manager: [
    'view_reports', 'request_stock', 'confirm_transfer', 'view_costs',
    'approve_ownership_transfer', 'override_negative',
  ],
  // P1: warehouse_staff no longer hold receive_stock.
  // Full costed receiving (FOB, cost, total value) is restricted to Admin and
  // Purchase Manager. Warehouse staff use Warehouse Mode quick-receive only,
  // which does not show cost fields and requires a pre-existing cost record.
  warehouse_staff: [
    'transfer_stock', 'perform_count',
  ],
  auditor: [
    'view_reports', 'export_reports', 'view_costs',
  ],
};

export function can(role: Role | undefined, cap: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(cap);
}

// Shop scoping: shop_manager sees only assigned shops; everyone else sees all.
export function scopedShopIds(
  role: Role | undefined,
  assigned: string[],
  allShopIds: string[],
): string[] {
  if (role === 'shop_manager') return assigned;
  return allShopIds;
}
