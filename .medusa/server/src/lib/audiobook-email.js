"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audiobookEmail = audiobookEmail;
exports.maybeSendAudiobookEmail = maybeSendAudiobookEmail;
const utils_1 = require("@medusajs/framework/utils");
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
const DEFAULT_DRIVE_URL = "https://drive.google.com/drive/folders/1VPtzzDO4QZ7D2Le4c4oVJ4HJKuzMnZUL";
const DEFAULT_HANDLES = "test-audio";
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function audiobookEmail(firstName) {
    const driveUrl = process.env.AUDIOBOOK_DRIVE_URL || DEFAULT_DRIVE_URL;
    const greeting = firstName ? `Halo ${escapeHtml(firstName)},` : "Halo,";
    const p = (text) => `<p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px; color: #1A1A1A;">${text}</p>`;
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
    ${p("Kami berharap audio meditasi ini dapat menjadi ruang yang membantu Anda menemukan ketenangan, kejernihan berpikir, serta perspektif baru dalam menghadapi berbagai tantangan yang sedang dijalani.")}
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
    ${p("Luangkan waktu sejenak untuk mendengarkannya dengan penuh kesadaran dan tanpa gangguan agar manfaatnya dapat dirasakan secara optimal.")}
    ${p("Semoga setiap langkah yang Anda jalani dipenuhi kemudahan, kesehatan, ketenangan, dan keberkahan.")}
    <p style="font-size: 16px; line-height: 1.7; margin: 24px 0 0; color: #1A1A1A;">
      Salam hangat,<br />
      <strong>Ali Zaenal Abidin</strong>
    </p>
  </div>
</div>`,
    };
}
async function sendViaResend(to, subject, html) {
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
async function maybeSendAudiobookEmail(opts) {
    const logger = opts.scope.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    try {
        if (!opts.email) {
            return;
        }
        const wantedHandles = (process.env.AUDIOBOOK_PRODUCT_HANDLES || DEFAULT_HANDLES)
            .split(",")
            .map((h) => h.trim().toLowerCase())
            .filter(Boolean);
        const productIds = [...new Set(opts.items.map((i) => i.product_id).filter(Boolean))];
        if (!productIds.length) {
            return;
        }
        const query = opts.scope.resolve(utils_1.ContainerRegistrationKeys.QUERY);
        const { data: products } = await query.graph({
            entity: "product",
            fields: ["id", "handle"],
            filters: { id: productIds },
        });
        const hasAudiobook = (products ?? []).some((pr) => wantedHandles.includes((pr.handle ?? "").toLowerCase()));
        if (!hasAudiobook) {
            return;
        }
        if (!process.env.RESEND_API_KEY || !(process.env.EMAIL_FROM || process.env.NEWSLETTER_FROM_EMAIL)) {
            logger.warn(`audiobook-email: order ${opts.orderId} contains the audiobook but RESEND_API_KEY / EMAIL_FROM is not set — skipping send`);
            return;
        }
        const { subject, html } = audiobookEmail(opts.firstName);
        await sendViaResend(opts.email, subject, html);
        logger.info(`audiobook-email: sent access email for order ${opts.orderId} to ${opts.email}`);
    }
    catch (err) {
        logger.error(`audiobook-email: failed for order ${opts.orderId}: ${err.message}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW9ib29rLWVtYWlsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2xpYi9hdWRpb2Jvb2stZW1haWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEyQkEsd0NBMkNDO0FBOEJELDBEQXFEQztBQXpKRCxxREFBc0U7QUFHdEU7Ozs7Ozs7Ozs7Ozs7O0dBY0c7QUFFSCxNQUFNLGlCQUFpQixHQUNyQiwwRUFBMEUsQ0FBQztBQUM3RSxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUM7QUFFckMsU0FBUyxVQUFVLENBQUMsQ0FBUztJQUMzQixPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztBQUM5RSxDQUFDO0FBRUQsU0FBZ0IsY0FBYyxDQUFDLFNBQWtCO0lBQy9DLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksaUJBQWlCLENBQUM7SUFDdEUsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFFeEUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUN6QixtRkFBbUYsSUFBSSxNQUFNLENBQUM7SUFFaEcsT0FBTztRQUNMLE9BQU8sRUFBRSx5Q0FBeUM7UUFDbEQsSUFBSSxFQUFFOzs7Ozs7TUFNSixDQUFDLENBQUMsUUFBUSxDQUFDO01BQ1gsQ0FBQyxDQUFDLGlGQUFpRixDQUFDO01BQ3BGLENBQUMsQ0FDRCxvTUFBb00sQ0FDck07TUFDQyxDQUFDLENBQUMsK0RBQStELENBQUM7O2lCQUV2RCxRQUFROzs7Ozs7d0NBTWUsUUFBUSw2QkFBNkIsUUFBUTs7TUFFL0UsQ0FBQyxD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