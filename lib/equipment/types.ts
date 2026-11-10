export type EquipmentStatus =
  | "available"
  | "in_use"
  | "maintenance"
  | "damaged"
  | "retired";
export type Category = { id: string; name: string; active: boolean };
export type Equipment = {
  id: string;
  equipment_code: string;
  name: string;
  category_id: string;
  category_name: string;
  manufacturer: string;
  model: string;
  serial_number: string | null;
  description: string;
  quantity: number;
  available: number;
  in_use: number;
  maintenance: number;
  damaged: number;
  retired: number;
  unit: string;
  storage_location: string;
  purchase_date: string | null;
  purchase_price: number;
  supplier: string;
  warranty_expiration: string | null;
  status: EquipmentStatus;
  version: number;
  archived_at: string | null;
  image_id?: string;
  created_by: string;
  updated_by: string;
};
export type EquipmentImage = {
  id: string;
  equipment_id?: string;
  filename: string;
  is_cover: boolean;
  sort_order: number;
  created_at?: string;
};
export type CheckoutItem = {
  id: string;
  equipment_id: string;
  quantity: number;
  returned_quantity: number;
  equipment: { name: string; equipment_code: string };
};
export type Checkout = {
  id: string;
  checkout_code: string;
  borrower: string;
  checkout_date: string;
  expected_return_date: string;
  related_booking: string | null;
  notes: string;
  created_by: string;
  items: CheckoutItem[];
};
export type EquipmentReturn = {
  id: string;
  item_id: string;
  checkout_code?: string;
  quantity: number;
  condition: string;
  return_date: string;
  notes: string;
  created_by: string;
};
export type Maintenance = {
  id: string;
  equipment_id: string;
  maintenance_code: string;
  quantity: number;
  issue: string;
  reported_date: string;
  start_date: string | null;
  completion_date: string | null;
  service_provider: string;
  cost: number;
  status: string;
  notes: string;
  confirmed_by: string | null;
  equipment?: { name: string; equipment_code: string };
};
export type Document = {
  id: string;
  filename: string;
  kind: string;
  mime_type: string;
  size: number;
  maintenance_id: string | null;
  created_at: string;
};
export type Activity = {
  id: number;
  equipment_id: string | null;
  action: string;
  actor: string;
  created_at: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
};
export type Summary = {
  quantity: number;
  available: number;
  in_use: number;
  maintenance: number;
  damaged: number;
  retired: number;
  purchase_value: number;
  maintenance_expenses: number;
};
export type Permissions = { write: boolean; admin: boolean };
export type InventoryResponse = {
  equipment: Equipment[];
  total: number;
  page: number;
  pageSize: number;
  categories: Category[];
  summary: Summary;
  permissions: Permissions;
};
export type DetailResponse = {
  equipment: Equipment;
  checkouts: Checkout[];
  returns: EquipmentReturn[];
  maintenance: Maintenance[];
  documents: Document[];
  activity: Activity[];
  historyTotal: number;
  returnsTotal: number;
  documentsTotal: number;
  images: EquipmentImage[];
  maintenanceTotal: number;
  activityTotal: number;
  maintenanceExpenses: number;
};
