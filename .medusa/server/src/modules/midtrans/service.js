"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const axios_1 = __importDefault(require("axios"));
class MidtransPaymentService extends utils_1.AbstractPaymentProvider {
    constructor(container, options) {
        super(container, options);
        this.serverKey = options.serverKey;
        this.clientKey = options.clientKey;
        this.baseUrl = options.isProduction
            ? "https://app.midtrans.com"
            : "https://app.sandbox.midtrans.com";
    }
    get authHeader() {
        return `Basic ${Buffer.from(`${this.serverKey}:`).toString("base64")}`;
    }
    snapUrl(path) {
        return `${this.baseUrl}/snap/v1${path}`;
    }
    apiUrl(path) {
        return `${this.baseUrl}/v2${path}`;
    }
    async initiatePayment(data) {
        const { amount, currency_code, context } = data;
        const orderId = `AZA-${Date.now()}`;
        const grossAmount = Math.round(Number(amount) / 100);
        const payload = {
            transaction_details: {
                order_id: orderId,
                gross_amount: grossAmount,
            },
            credit_card: { secure: true },
            customer_details: {
                email: context?.customer?.email ?? undefined,
                first_name: context?.customer?.first_name ?? undefined,
                last_name: context?.customer?.last_name ?? undefined,
                phone: context?.billing_address,
            },
            item_details: (context?.items ?? []).map((item) => ({
                id: item.title,
                price: Math.round(item.unit_price / 100),
                quantity: item.quantity,
                name: item.title.slice(0, 50),
            })),
            currency: currency_code?.toUpperCase() ?? "IDR",
        };
        const response = await axios_1.default.post(this.snapUrl("/transactions"), payload, {
            headers: {
                "Content-Type": "application/json",
                Authorization: this.authHeader,
            },
        });
        return {
            id: orderId,
            data: {
                snap_token: response.data.token,
                redirect_url: response.data.redirect_url,
                order_id: orderId,
                client_key: this.clientKey,
            },
        };
    }
    async updatePayment(data) {
        return this.initiatePayment(data);
    }
    async authorizePayment(data) {
        const sessionData = data.data;
        const orderId = sessionData.order_id;
        const response = await axios_1.default.get(this.apiUrl(`/${orderId}/status`), { headers: { Authorization: this.authHeader } });
        const { transaction_status, fraud_status } = response.data;
        let status;
        if ((transaction_status === "capture" && fraud_status === "accept") ||
            transaction_status === "settlement") {
            status = utils_1.PaymentSessionStatus.AUTHORIZED;
        }
        else if (["pending", "authorize"].includes(transaction_status)) {
            status = utils_1.PaymentSessionStatus.PENDING;
        }
        else {
            status = utils_1.PaymentSessionStatus.ERROR;
        }
        return { data: { ...sessionData, transaction_status }, status };
    }
    async capturePayment(data) {
        return { data: data.data ?? {} };
    }
    async cancelPayment(data) {
        const sessionData = data.data;
        const orderId = sessionData.order_id;
        await axios_1.default.post(this.apiUrl(`/${orderId}/cancel`), {}, { headers: { Authorization: this.authHeader } });
        return { data: { ...sessionData, status: "cancel" } };
    }
    async refundPayment(data) {
        const sessionData = data.data;
        const orderId = sessionData.order_id;
        const refundAmount = Math.round(Number(data.amount) / 100);
        const response = await axios_1.default.post(this.apiUrl(`/${orderId}/refund`), { amount: refundAmount, reason: "Customer refund request" }, {
            headers: {
                Authorization: this.authHeader,
                "Content-Type": "application/json",
            },
        });
        return { data: { ...sessionData, refund: response.data } };
    }
    async retrievePayment(data) {
        return { data: data.data ?? {} };
    }
    async deletePayment(data) {
        return this.cancelPayment(data);
    }
    async getPaymentStatus(data) {
        const sessionData = data.data;
        const orderId = sessionData?.order_id;
        if (!orderId)
            return { status: utils_1.PaymentSessionStatus.PENDING };
        try {
            const response = await axios_1.default.get(this.apiUrl(`/${orderId}/status`), { headers: { Authorization: this.authHeader } });
            const { transaction_status, fraud_status } = response.data;
            if (transaction_status === "settlement")
                return { status: utils_1.PaymentSessionStatus.AUTHORIZED };
            if (transaction_status === "capture" && fraud_status === "accept")
                return { status: utils_1.PaymentSessionStatus.AUTHORIZED };
            if (["expire", "deny"].includes(transaction_status))
                return { status: utils_1.PaymentSessionStatus.ERROR };
            if (transaction_status === "cancel")
                return { status: utils_1.PaymentSessionStatus.CANCELED };
            return { status: utils_1.PaymentSessionStatus.PENDING };
        }
        catch {
            return { status: utils_1.PaymentSessionStatus.PENDING };
        }
    }
    async getWebhookActionAndData(payload) {
        const body = payload.data;
        const { transaction_status, fraud_status, order_id, gross_amount } = body;
        if (transaction_status === "settlement" ||
            (transaction_status === "capture" && fraud_status === "accept")) {
            return {
                action: "captured",
                data: {
                    session_id: order_id,
                    amount: Math.round(parseFloat(gross_amount) * 100),
                },
            };
        }
        if (["expire", "deny", "cancel"].includes(transaction_status)) {
            return {
                action: "failed",
                data: { session_id: order_id, amount: 0 },
            };
        }
        return {
            action: "not_supported",
            data: { session_id: order_id, amount: 0 },
        };
    }
}
MidtransPaymentService.identifier = "midtrans";
exports.default = MidtransPaymentService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL21pZHRyYW5zL3NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxREFHbUM7QUF1Qm5DLGtEQUEwQjtBQXNCMUIsTUFBTSxzQkFBdUIsU0FBUSwrQkFBd0M7SUFPM0UsWUFBWSxTQUFrQyxFQUFFLE9BQXdCO1FBQ3RFLEtBQUssQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBQ25DLElBQUksQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUNuQyxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxZQUFZO1lBQ2pDLENBQUMsQ0FBQywwQkFBMEI7WUFDNUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDO0lBQ3pDLENBQUM7SUFFRCxJQUFZLFVBQVU7UUFDcEIsT0FBTyxTQUFTLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztJQUN6RSxDQUFDO0lBRU8sT0FBTyxDQUFDLElBQVk7UUFDMUIsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLFdBQVcsSUFBSSxFQUFFLENBQUM7SUFDMUMsQ0FBQztJQUVPLE1BQU0sQ0FBQyxJQUFZO1FBQ3pCLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxNQUFNLElBQUksRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUFDLElBQTBCO1FBQzlDLE1BQU0sRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQztRQUNoRCxNQUFNLE9BQU8sR0FBRyxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1FB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