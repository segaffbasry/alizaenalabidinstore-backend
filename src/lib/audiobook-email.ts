import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

/**
 * Digital delivery email for the audio meditation product.
 *
 * Sent from the record-order route after a verified Midtrans payment that
 * contains the audiobook product. Transport is the Resend HTTP API — the
 * same service the storefront uses for newsletter mail.
 *
 * Env (set in Railway):
 *   RESEND_API_KEY              — required; without it sending is a silent no-op
 *   EMAIL_FROM                  — verified sender, e.g. `Ali Zaenal Abidin <hello@alizaenalabidin.com>`
 *                                 (falls back to NEWSLETTER_FROM_EMAIL)
 *   AUDIOBOOK_PRODUCT_HANDLES   — comma-separated handles that count as the
 *                                 audiobook (default: "test-audio")
 *   AUDIOBOOK_DRIVE_URL         — download link (defaults to the current folder)
 */

const DEFAULT_DRIVE_URL =
  "https://drive.google.com/drive/folders/1VPtzzDO4QZ7D2Le4c4oVJ4HJKuzMnZUL";
const DEFAULT_HANDLES = "test-audio";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function audiobookEmail(firstName?: string): { subject: string; html: string } {
  const driveUrl = process.env.AUDIOBOOK_DRIVE_URL || DEFAULT_DRIVE_URL;
  const greeting = firstName ? `Halo ${escapeHtml(firstName)},` : "Halo,";

  const p = (text: string) =>
    `<p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px; color: #1A1A1A;">${text}</p>`;

  return {
    subject: "Audio Meditasi Anda — Ali Zaenal Abidin",
    html: `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #1A1A1A;">
  <div style="background: #1A1A1A; color: #F5F0E8; padding: 28px 32px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 22px; font-weight: 500;">Ali Zaenal Abidin</h1>
  </div>
  <div style="background: #F5F0E8; padding: 32px; border-radius: 0 0 12px 12px;">
    ${p(greeting)}
    ${p("Terima kasih telah mempercayakan perjalanan pengembangan diri Anda kepada kami.")}
    ${p(
      "Kami berharap audio meditasi ini dapat menjadi ruang yang membantu Anda menemukan ketenangan, kejernihan berpikir, serta perspektif baru dalam menghadapi berbagai tantangan yang sedang dijalani."
    )}
    ${p("Silakan akses dan unduh meditasi Anda melalui tautan berikut:")}
    <div style="text-align: center; margin: 24px 0;">
      <a href="${driveUrl}"
         style="display: inline-block; background: #724233; color: #F5F0E8; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
        Akses Audio Meditasi
      </a>
    </div>
    <p style="font-size: 13px; line-height: 1.6; margin: 0 0 24px; color: #6B6560; text-align: center; word-break: break-all;">
      Atau salin tautan ini: <a href="${driveUrl}" style="color: #724233;">${driveUrl}</a>
    </p>
    ${p(
      "Luangkan waktu sejenak untuk mendengarkannya dengan penuh kesadaran dan tanpa gangguan agar manfaatnya dapat dirasakan secara optimal."
    )}
    ${p(
      "Semoga setiap langkah yang Anda jalani dipenuhi kemudahan, kesehatan, ketenangan, dan keberkahan."
    )}
    <p style="font-size: 16px; line-height: 1.7; margin: 24px 0 0; color: #1A1A1A;">
      Salam hangat,<br />
      <strong>Ali Zaenal Abidin</strong>
    </p>
  </div>
</div>`,
  };
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.NEWSLETTER_FROM_EMAIL;
  if (!apiKey || !from) {
    return false;
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
  return true;
}

/**
 * If the recorded order contains the audiobook product, email the customer
 * their access link. Never throws — digital delivery failure must not break
 * order recording (the payment already succeeded).
 */
export async function maybeSendAudiobookEmail(opts: {
  scope: MedusaContainer;
  items: { product_id?: string; title: string }[];
  email?: string;
  firstName?: string;
  orderId: string;
}): Promise<void> {
  const logger = opts.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    if (!opts.email) {
      return;
    }

    const wantedHandles = (process.env.AUDIOBOOK_PRODUCT_HANDLES || DEFAULT_HANDLES)
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    const productIds = [...new Set(opts.items.map((i) => i.product_id).filter(Boolean))] as string[];
    if (!productIds.length) {
      return;
    }

    const query = opts.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { id: productIds },
    });

    const hasAudiobook = (products ?? []).some((pr: { handle?: string }) =>
      wantedHandles.includes((pr.handle ?? "").toLowerCase())
    );
    if (!hasAudiobook) {
      return;
    }

    if (!process.env.RESEND_API_KEY || !(process.env.EMAIL_FROM || process.env.NEWSLETTER_FROM_EMAIL)) {
      logger.warn(
        `audiobook-email: order ${opts.orderId} contains the audiobook but RESEND_API_KEY / EMAIL_FROM is not set — skipping send`
      );
      return;
    }

    const { subject, html } = audiobookEmail(opts.firstName);
    await sendViaResend(opts.email, subject, html);
    logger.info(`audiobook-email: sent access email for order ${opts.orderId} to ${opts.email}`);
  } catch (err) {
    logger.error(
      `audiobook-email: failed for order ${opts.orderId}: ${(err as Error).message}`
    );
  }
}
