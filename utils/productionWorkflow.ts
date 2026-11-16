export type ProductionMove = {
  product_id: string;
  from_shelf_id: string;
  to_shelf_id: string;
  // شناسه قدیمی bundle_id همچنان بسته مبدأ است تا داده‌های قبلی سازگار بمانند.
  bundle_id?: string | null;
  target_bundle_id?: string | null;
  create_new_target_bundle?: boolean;
  client_key?: string;
  quantity: number;
  unit?: string | null;
};
