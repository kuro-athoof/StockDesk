import type { AppUser, Role } from '../types';

const ROLE_ALIASES: Record<string, Role> = {
  admin: 'admin',
  ADMIN: 'admin',
  super_admin: 'admin',
  SUPER_ADMIN: 'admin',
  purchase_manager: 'purchase_manager',
  PURCHASE_MANAGER: 'purchase_manager',
  shop_manager: 'shop_manager',
  SHOP_MANAGER: 'shop_manager',
  warehouse_staff: 'warehouse_staff',
  WAREHOUSE_STAFF: 'warehouse_staff',
  auditor: 'auditor',
  AUDITOR: 'auditor',
};

function normalizeRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null;
  return ROLE_ALIASES[value.trim()] ?? null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeShopId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('shop_')) return trimmed;
  return `shop_${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

export function normalizeUserProfile(uid: string, raw: Record<string, unknown>): AppUser | null {
  const role = normalizeRole(raw.role);
  if (!role) return null;

  const assignedSource =
    raw.assignedShopIds !== undefined ? raw.assignedShopIds : raw.assignedShops;
  const assignedShopIds = asStringArray(assignedSource).map(normalizeShopId).filter(Boolean);

  return {
    uid,
    name: typeof raw.name === 'string' && raw.name.trim()
      ? raw.name
      : (typeof raw.email === 'string' && raw.email.trim() ? raw.email : 'StockDesk User'),
    email: typeof raw.email === 'string' ? raw.email : '',
    role,
    assignedShopIds,
    active: raw.active === true || raw.isActive === true,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
  };
}
