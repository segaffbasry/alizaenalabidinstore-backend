import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createOrderWorkflow,
  createOrderPaymentCollectionWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/medusa/core-flows";

/**
 * Records an order in Medusa for a checkout that was paid directly through
 * Midtrans Snap on the storefront (which bypasses Medusa's own cart flow).
 *
 * Flow:
 *   1. Verify the Midtrans transaction is actually paid (server-side, server key).
 *   2. Assert the order total matches what Midtrans collected (anti-tampering).
 *   3. Create the order via createOrderWorkflow.
 *   4. Create a payment collection and mark it paid so it shows as captured.
 *
 * Idempotent on `midtrans_order_id`: a repeated call returns the existing order.
 */

interface RecordOrderItem {
  variant_id: string;
  product_id?: string;
  title: string;
  variant_title?: string;
  thumbnail?: string;
  unit_price: number; // major IDR units, e.g. 10000
  quantity: number;
}

interface RecordOrderBody {
  midtrans_order_id: string;
  items: RecordOrderItem[];
  shipping_cost?: number;
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country_code?: string;
  };
}

interface MidtransStatus {
  transaction_status: string;
  fraud_status?: string;
  gross_amount: string;
  status_code?: string;
}

export async function POST(
  req: MedusaStoreRequest<RecordOrderBody>,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const body = req.body ?? ({} as RecordOrderBody);
  const {
    midtrans_order_id: midtransOrderId,
    items = [],
    shipping_cost: shippingCost = 0,
    customer = {},
    shipping_address: shippingAddress,
  } = body;

  if (!midtransOrderId) {
    res.status(400).json({ error: "midtrans_order_id wajib diisi" });
    return;
  }
  if (!items.length) {
    res.status(400).json({ error: "Item kosong" });
    return;
  }

  // ── 1. Idempotency: order already recorded for this Midtrans transaction? ──
  try {
    const { data: existing } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "metadata"],
      filters: { metadata: { midtrans_order_id: midtransOrderId } },
    });
    if (existing?.length) {
      res.json({ order_id: existing[0].id, display_id: existing[0].display_id, duplicate: true });
      return;
    }
  } catch {
    // metadata filtering not supported in this setup — proceed without the guard
  }

  // ── 2. Verify payment with Midtrans (server-side) ──
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    res.status(500).json({ error: "MIDTRANS_SERVER_KEY tidak dikonfigurasi" });
    return;
  }
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  const apiBase = isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

  let status: MidtransStatus;
  try {
    const statusRes = await fetch(`${apiBase}/v2/${midtransOrderId}/status`, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      },
    });
    status = (await statusRes.json()) as MidtransStatus;
  } catch (err) {
    logger.error(`record-order: failed to reach Midtrans: ${(err as Error).message}`);
    res.status(502).json({ error: "Gagal memverifikasi pembayaran" });
    return;
  }

  const isPaid =
    status.transaction_status === "settlement" ||
    (status.transaction_status === "capture" && status.fraud_status === "accept");
  if (!isPaid) {
    res.status(402).json({
      error: "Pembayaran belum lunas",
      transaction_status: status.transaction_status ?? "unknown",
    });
    return;
  }

  // ── 3. Assert our total matches what Midtrans actually collected ──
  const itemsTotal = items.reduce((sum, i) => sum + Math.round(i.unit_price) * i.quantity, 0);
  const orderTotal = itemsTotal + Math.round(shippingCost);
  const midtransGross = Math.round(parseFloat(status.gross_amount));
  if (orderTotal !== midtransGross) {
    logger.error(
      `record-order: amount mismatch for ${midtransOrderId} — computed ${orderTotal}, Midtrans ${midtransGross}`
    );
    res.status(400).json({ error: "Total pesanan tidak cocok dengan pembayaran" });
    return;
  }

  // ── 4. Resolve region (IDR) and sales channel ──
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { currency_code: "idr" },
  });
  const regionId = regions?.[0]?.id;
  if (!regionId) {
    res.status(500).json({ error: "Region IDR tidak ditemukan" });
    return;
  }

  let salesChannelId = req.publishable_key_context?.sales_channel_ids?.[0];
  if (!salesChannelId) {
    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id"],
    });
    salesChannelId = channels?.[0]?.id;
  }

  // ── 5. Create the order ──
  const addr = shippingAddress;
  const orderAddress = addr?.address
    ? {
        first_name: addr.first_name ?? customer.first_name ?? "",
        last_name: addr.last_name ?? customer.last_name ?? "",
        phone: addr.phone ?? customer.phone ?? "",
        address_1: addr.address ?? "",
        city: addr.city ?? "",
        postal_code: addr.postal_code ?? "",
        country_code: (addr.country_code ?? "id").toLowerCase(),
      }
    : undefined;

  const { result: order } = await createOrderWorkflow(req.scope).run({
    input: {
      region_id: regionId,
      sales_channel_id: salesChannelId,
      currency_code: "idr",
      email: customer.email || undefined,
      items: items.map((i) => ({
        title: i.title,
        variant_id: i.variant_id,
        product_id: i.product_id,
        variant_title: i.variant_title,
        thumbnail: i.thumbnail,
        quantity: i.quantity,
        unit_price: Math.round(i.unit_price),
      })),
      shipping_methods: shippingCost
        ? [{ name: "Pengiriman", amount: Math.round(shippingCost) }]
        : [],
      shipping_address: orderAddress,
      billing_address: orderAddress,
      metadata: {
        midtrans_order_id: midtransOrderId,
        source: "web-midtrans",
      },
    },
  });

  // ── 6. Record payment as captured ──
  try {
    const { result: collections } = await createOrderPaymentCollectionWorkflow(req.scope).run({
      input: { order_id: order.id, amount: orderTotal },
    });
    const paymentCollectionId = collections?.[0]?.id;
    if (paymentCollectionId) {
      await markPaymentCollectionAsPaid(req.scope).run({
        input: { order_id: order.id, payment_collection_id: paymentCollectionId },
      });
    }
  } catch (err) {
    // Order is already created; surface the payment-marking failure but don't lose the order.
    logger.error(
      `record-order: order ${order.id} created but marking payment failed: ${(err as Error).message}`
    );
  }

  logger.info(`record-order: recorded order ${order.id} for Midtrans ${midtransOrderId}`);
  res.json({ order_id: order.id, display_id: order.display_id });
}
