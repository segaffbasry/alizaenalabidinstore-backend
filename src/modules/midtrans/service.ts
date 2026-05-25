import {
  AbstractPaymentProvider,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import type {
  InitiatePaymentInput,
  InitiatePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  WebhookActionResult,
  ProviderWebhookPayload,
} from "@medusajs/types";
import axios from "axios";

interface MidtransOptions {
  serverKey: string;
  clientKey: string;
  isProduction: boolean;
}

interface MidtransSnapResponse {
  token: string;
  redirect_url: string;
}

interface MidtransStatusResponse {
  transaction_id: string;
  order_id: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  gross_amount: string;
}

class MidtransPaymentService extends AbstractPaymentProvider<MidtransOptions> {
  static identifier = "midtrans";

  private serverKey: string;
  private clientKey: string;
  private baseUrl: string;

  constructor(container: Record<string, unknown>, options: MidtransOptions) {
    super(container, options);
    this.serverKey = options.serverKey;
    this.clientKey = options.clientKey;
    this.baseUrl = options.isProduction
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com";
  }

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.serverKey}:`).toString("base64")}`;
  }

  private snapUrl(path: string): string {
    return `${this.baseUrl}/snap/v1${path}`;
  }

  private apiUrl(path: string): string {
    return `${this.baseUrl}/v2${path}`;
  }

  async initiatePayment(data: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
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
        phone: (context as Record<string, unknown> | undefined)?.billing_address as string | undefined,
      },
      item_details: (
        ((context as Record<string, unknown> | undefined)?.items as Array<{ title: string; unit_price: number; quantity: number }> | undefined) ?? []
      ).map((item) => ({
        id: item.title,
        price: Math.round(item.unit_price / 100),
        quantity: item.quantity,
        name: item.title.slice(0, 50),
      })),
      currency: currency_code?.toUpperCase() ?? "IDR",
    };

    const response = await axios.post<MidtransSnapResponse>(
      this.snapUrl("/transactions"),
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
      }
    );

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

  async updatePayment(data: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return this.initiatePayment(data as unknown as InitiatePaymentInput);
  }

  async authorizePayment(data: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const sessionData = data.data as Record<string, unknown>;
    const orderId = sessionData.order_id as string;

    const response = await axios.get<MidtransStatusResponse>(
      this.apiUrl(`/${orderId}/status`),
      { headers: { Authorization: this.authHeader } }
    );

    const { transaction_status, fraud_status } = response.data;
    let status: PaymentSessionStatus;

    if (
      (transaction_status === "capture" && fraud_status === "accept") ||
      transaction_status === "settlement"
    ) {
      status = PaymentSessionStatus.AUTHORIZED;
    } else if (["pending", "authorize"].includes(transaction_status)) {
      status = PaymentSessionStatus.PENDING;
    } else {
      status = PaymentSessionStatus.ERROR;
    }

    return { data: { ...sessionData, transaction_status }, status };
  }

  async capturePayment(data: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: (data.data as Record<string, unknown>) ?? {} };
  }

  async cancelPayment(data: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const sessionData = data.data as Record<string, unknown>;
    const orderId = sessionData.order_id as string;

    await axios.post(
      this.apiUrl(`/${orderId}/cancel`),
      {},
      { headers: { Authorization: this.authHeader } }
    );

    return { data: { ...sessionData, status: "cancel" } };
  }

  async refundPayment(data: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const sessionData = data.data as Record<string, unknown>;
    const orderId = sessionData.order_id as string;
    const refundAmount = Math.round(Number(data.amount) / 100);

    const response = await axios.post(
      this.apiUrl(`/${orderId}/refund`),
      { amount: refundAmount, reason: "Customer refund request" },
      {
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
        },
      }
    );

    return { data: { ...sessionData, refund: response.data } };
  }

  async retrievePayment(data: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: (data.data as Record<string, unknown>) ?? {} };
  }

  async deletePayment(data: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(data as unknown as CancelPaymentInput);
  }

  async getPaymentStatus(data: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const sessionData = data.data as Record<string, unknown>;
    const orderId = sessionData?.order_id as string;
    if (!orderId) return { status: PaymentSessionStatus.PENDING };

    try {
      const response = await axios.get<MidtransStatusResponse>(
        this.apiUrl(`/${orderId}/status`),
        { headers: { Authorization: this.authHeader } }
      );

      const { transaction_status, fraud_status } = response.data;

      if (transaction_status === "settlement") return { status: PaymentSessionStatus.AUTHORIZED };
      if (transaction_status === "capture" && fraud_status === "accept") return { status: PaymentSessionStatus.AUTHORIZED };
      if (["expire", "deny"].includes(transaction_status)) return { status: PaymentSessionStatus.ERROR };
      if (transaction_status === "cancel") return { status: PaymentSessionStatus.CANCELED };
      return { status: PaymentSessionStatus.PENDING };
    } catch {
      return { status: PaymentSessionStatus.PENDING };
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const body = payload.data as unknown as MidtransStatusResponse;
    const { transaction_status, fraud_status, order_id, gross_amount } = body;

    if (
      transaction_status === "settlement" ||
      (transaction_status === "capture" && fraud_status === "accept")
    ) {
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

export default MidtransPaymentService;
