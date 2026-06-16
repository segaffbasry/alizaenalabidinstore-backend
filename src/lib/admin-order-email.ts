import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

/**
 * Admin notification email — sent to the shop's operations inbox after a
 * verified Midtrans payment so the team can fulfil the order.
 *
 * Transport is the Resend HTTP API (same service as the audiobook email).
 *
 * Env (set in Railway):
 *   RESEND_API_KEY            — required; without it sending is a silent no-op
 *   EMAIL_FROM                — verified sender (falls back to NEWSLETTER_FROM_EMAIL)
 *   ADMIN_NOTIFICATION_EMAIL  — recipient (default: iomw.official@gmail.com)
 */

const DEFAULT_ADMIN_EMAIL = "iomw.official@gmail.com";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface AdminOrderDetails {
  buyerName: string;
  email: string;
  phone: string;
  product: string;
  orderNumber: string;
  purchaseDate: string;
  paymentMethod: string;
  total: string;
}

export function adminOrderEmail(d: AdminOrderDetails): { subject: string; html: string } {
  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding: 6px 12px 6px 0; color: #6B6560; font-size: 14px; white-space: nowrap; vertical-align: top;">${escapeHtml(label)}</td>
      <td style="padding: 6px 0; color: #1A1A1A; font-size: 14px; font-weight: 600;">${escapeHtml(value)}</td>
    </tr>`;

  const p = (text: string) =>
    `<p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px; color: #1A1A1A;">${text}</p>`;

  return {
    subject: `Pesanan Baru #${d.orderNumber} — Siap Diproses`,
    html: `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1A1A1A;">
  <div style="background: #1A1A1A; color: #F5F0E8; padding: 24px 32px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 20px; font-weight: 500;">Pesanan Baru</h1>
  </div>
  <div style="background: #F5F0E8; padding: 32px; border-radius: 0 0 12px 12px;">
    ${p("Halo Tim Admin,")}
    ${p("Ada pesanan baru yang telah berhasil dibayarkan dan siap untuk diproses.")}

    <h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 12px; color: #1A1A1A;">Detail Pesanan</h2>
    <table style="border-collapse: collapse; width: 100%; background: #fff; border-radius: 8px; padding: 8px;">
      <tbody>
        ${row("Nama Pembeli", d.buyerName)}
        ${row("Email", d.email)}
        ${row("Nomor HP", d.phone)}
        ${row("Produk", d.product)}
        ${row("Nomor Pesanan", d.orderNumber)}
        ${row("Tanggal Pembelian", d.purchaseDate)}
        ${row("Metode Pembayaran", d.paymentMethod)}
        ${row("Total Pembayaran", d.total)}
      </tbody>
    </table>

    <h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 12px; color: #1A1A1A;">Tindak lanjut yang perlu dilakukan</h2>
    <ul style="font-size: 14px; line-height: 1.8; margin: 0 0 16px; padding-left: 20px; color: #1A1A1A;">
      <li>Verifikasi data pesanan</li>
      <li>Siapkan produk/paket yang dipesan</li>
      <li>Lakukan pengiriman atau aktivasi akses</li>
      <li>Update status pesanan setelah selesai diproses</li>
    </ul>

    ${p("Silakan segera lakukan pengecekan dan proses pesanan sesuai prosedur yang berlaku.")}
    ${p("Terima kasih.")}
  </div>
</div>`,
  };
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.NEWSLETTER_FROM_EMAIL;
  if (!apiKey || !from) {
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Notify the admin inbox about a freshly paid order. Never throws — a failed
 * notification must not break order recording (the payment already succeeded).
 */
export async function maybeSendAdminOrderEmail(opts: {
  scope: MedusaContainer;
  items: { title: string; variant_title?: string; quantity: number }[];
  customer: { email?: string; first_name?: string; last_name?: string; phone?: string };
  orderNumber: string;
  total: number;
  paymentMethod?: string;
}): Promise<void> {
  const logger = opts.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    if (!process.env.RESEND_API_KEY || !(process.env.EMAIL_FROM || process.env.NEWSLETTER_FROM_EMAIL)) {
      logger.warn(
        `admin-order-email: order ${opts.orderNumber} paid but RESEND_API_KEY / EMAIL_FROM is not set — skipping admin notification`
      );
      return;
    }

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_EMAIL;

    const buyerName =
      [opts.customer.first_name, opts.customer.last_name].filter(Boolean).join(" ").trim() || "-";

    const product =
      opts.items
        .map((i) => {
          const variant = i.variant_title ? ` (${i.variant_title})` : "";
          const qty = i.quantity > 1 ? ` ×${i.quantity}` : "";
          return `${i.title}${variant}${qty}`;
        })
        .join(", ") || "-";

    const purchaseDate = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date());

    const { subject, html } = adminOrderEmail({
      buyerName,
      email: opts.customer.email || "-",
      phone: opts.customer.phone || "-",
      product,
      orderNumber: opts.orderNumber,
      purchaseDate: `${purchaseDate} WIB`,
      paymentMethod: opts.paymentMethod || "Midtrans",
      total: formatIDR(opts.total),
    });

    await sendViaResend(adminEmail, subject, html);
    logger.info(`admin-order-email: sent notification for order ${opts.orderNumber} to ${adminEmail}`);
  } catch (err) {
    logger.error(
      `admin-order-email: failed for order ${opts.orderNumber}: ${(err as Error).message}`
    );
  }
}
