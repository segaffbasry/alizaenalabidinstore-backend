"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
const audiobook_email_1 = require("../../../lib/audiobook-email");
async function POST(req, res) {
    const logger = req.scope.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const query = req.scope.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const body = req.body ?? {};
    const { midtrans_order_id: midtransOrderId, items = [], shipping_cost: shippingCost = 0, customer = {}, shipping_address: shippingAddress, } = body;
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
    }
    catch {
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
    let status;
    try {
        const statusRes = await fetch(`${apiBase}/v2/${midtransOrderId}/status`, {
            headers: {
                Accept: "application/json",
                Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
            },
        });
        status = (await statusRes.json());
    }
    catch (err) {
        logger.error(`record-order: failed to reach Midtrans: ${err.message}`);
        res.status(502).json({ error: "Gagal memverifikasi pembayaran" });
        return;
    }
    const isPaid = status.transaction_status === "settlement" ||
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
        logger.error(`record-order: amount mismatch for ${midtransOrderId} — computed ${orderTotal}, Midtrans ${midtransGross}`);
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
    const { result: order } = await (0, core_flows_1.createOrderWorkflow)(req.scope).run({
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
        const { result: collections } = await (0, core_flows_1.createOrderPaymentCollectionWorkflow)(req.scope).run({
            input: { order_id: order.id, amount: orderTotal },
        });
        const paymentCollectionId = collections?.[0]?.id;
        if (paymentCollectionId) {
            await (0, core_flows_1.markPaymentCollectionAsPaid)(req.scope).run({
                input: { order_id: order.id, payment_collection_id: paymentCollectionId },
            });
        }
    }
    catch (err) {
        // Order is already created; surface the payment-marking failure but don't lose the order.
        logger.error(`record-order: order ${order.id} created but marking payment failed: ${err.message}`);
    }
    // ── 7. Digital delivery: audiobook access email (fire-and-forget) ──
    void (0, audiobook_email_1.maybeSendAudiobookEmail)({
        scope: req.scope,
        items,
        email: customer.email,
        firstName: customer.first_name,
        orderId: order.id,
    });
    logger.info(`record-order: recorded order ${order.id} for Midtrans ${midtransOrderId}`);
    res.json({ order_id: order.id, display_id: order.display_id });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3JlY29yZC1vcmRlci9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQTREQSxvQkFvTEM7QUEvT0QscURBQXNFO0FBQ3RFLDREQUlxQztBQUNyQyxrRUFBdUU7QUFxRGhFLEtBQUssVUFBVSxJQUFJLENBQ3hCLEdBQXdDLEVBQ3hDLEdBQW1CO0lBRW5CLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGlDQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ25FLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGlDQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBRWpFLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLElBQUssRUFBc0IsQ0FBQztJQUNqRCxNQUFNLEVBQ0osaUJBQWlCLEVBQUUsZUFBZSxFQUNsQyxLQUFLLEdBQUcsRUFBRSxFQUNWLGFBQWEsRUFBRSxZQUFZLEdBQUcsQ0FBQyxFQUMvQixRQUFRLEdBQUcsRUFBRSxFQUNiLGdCQUFnQixFQUFFLGVBQWUsR0FDbEMsR0FBRyxJQUFJLENBQUM7SUFFVCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDckIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLE9BQU87SUFDVCxDQUFDO0lBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNsQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQy9DLE9BQU87SUFDVCxDQUFDO0lBRUQsOEVBQThFO0lBQzlFLElB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