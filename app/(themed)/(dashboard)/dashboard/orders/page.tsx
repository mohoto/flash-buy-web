import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { OrdersList } from "./orders-list";

export default async function OrdersPage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  // order_number ("étiquette", cf. assign_rapid_item_order_number) et
  // nickname vivent sur live_rapid_items, pas sur live_orders directement —
  // une commande = une intention d'achat en mode rapid, donc au plus une
  // étiquette par commande. live_order_items(quantity) sert à compter le
  // nombre d'articles (colonne "Articles").
  const { data: orders } = await supabase
    .from("live_orders")
    .select(
      "id, buyer_tiktok_username, status, total_cents, created_at, live_id, live_rapid_items(order_number, nickname), live_order_items(quantity, size_label, raw_product_text, raw_size_text, unit_price_cents, discount_cents, products(name))"
    )
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const { data: shippingInfos } = await supabase
    .from("live_buyer_shipping_info")
    .select("buyer_tiktok_username, first_name, last_name, email, phone, address, postal_code, city, country")
    .eq("shop_id", shop.id);

  const shippingByBuyer = new Map(
    (shippingInfos ?? []).map((info) => [info.buyer_tiktok_username, info])
  );

  const ordersWithOrderNumber = (orders ?? []).map((order) => {
    const shippingInfo = shippingByBuyer.get(order.buyer_tiktok_username) ?? null;
    return {
      id: order.id,
      buyer_tiktok_username: order.buyer_tiktok_username,
      status: order.status,
      total_cents: order.total_cents,
      created_at: order.created_at,
      live_id: order.live_id,
      order_number: order.live_rapid_items?.[0]?.order_number ?? null,
      nickname: order.live_rapid_items?.[0]?.nickname ?? null,
      full_name: shippingInfo ? `${shippingInfo.first_name} ${shippingInfo.last_name}`.trim() : null,
      email: shippingInfo?.email ?? null,
      phone: shippingInfo?.phone ?? null,
      address: shippingInfo?.address ?? null,
      postal_code: shippingInfo?.postal_code ?? null,
      city: shippingInfo?.city ?? null,
      country: shippingInfo?.country ?? null,
      items_count: order.live_order_items.reduce((sum, item) => sum + item.quantity, 0),
      items: order.live_order_items.map((item) => ({
        product_name: item.products?.name ?? item.raw_product_text,
        size_label: item.size_label ?? item.raw_size_text,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        discount_cents: item.discount_cents,
      })),
    };
  });

  return (
    <div>
      <OrdersList orders={ordersWithOrderNumber} />
    </div>
  );
}
