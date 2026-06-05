"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
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
    logger.info(`record-order: recorded order ${order.id} for Midtrans ${midtransOrderId}`);
    res.json({ order_id: order.id, display_id: order.display_id });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3JlY29yZC1vcmRlci9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQTJEQSxvQkEyS0M7QUFyT0QscURBQXNFO0FBQ3RFLDREQUlxQztBQXFEOUIsS0FBSyxVQUFVLElBQUksQ0FDeEIsR0FBd0MsRUFDeEMsR0FBbUI7SUFFbkIsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkUsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFakUsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksSUFBSyxFQUFzQixDQUFDO0lBQ2pELE1BQU0sRUFDSixpQkFBaUIsRUFBRSxlQUFlLEVBQ2xDLEtBQUssR0FBRyxFQUFFLEVBQ1YsYUFBYSxFQUFFLFlBQVksR0FBRyxDQUFDLEVBQy9CLFFBQVEsR0FBRyxFQUFFLEVBQ2IsZ0JBQWdCLEVBQUUsZUFBZSxHQUNsQyxHQUFHLElBQUksQ0FBQztJQUVULElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUNyQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSwrQkFBK0IsRUFBRSxDQUFDLENBQUM7UUFDakUsT0FBTztJQUNULENBQUM7SUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2xCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDL0MsT0FBTztJQUNULENBQUM7SUFFRCw4RUFBOEU7SUFDOUUsSUFBSSxDQUFDO1FBQ0gs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