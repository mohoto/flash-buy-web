import type { Database } from "@/lib/database.types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
export type Shop = Tables<"shops">;
export type Product = Tables<"products">;
export type ProductVariant = Tables<"product_variants">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
