import { Resend } from "resend";
import { pool } from "../config/db.js";

const APP_URL = "https://www.auditprorx.com/";
const BATCH_SIZE = 100;

let resendClient = null;
function getClient() {
  if (resendClient) return resendClient;
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured in .env");
  }
  resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPreview(htmlContent) {
  const text = String(htmlContent || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 180) return text;
  return text.slice(0, 180).trimEnd() + "…";
}

function buildHtml({ name, title, preview }) {
  const safeName = escapeHtml(name && name.trim() ? name.trim() : "there");
  const safeTitle = escapeHtml(title || "");
  const safePreview = escapeHtml(preview || "");

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f6f7f9; padding:24px 0;">
  <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
    <div style="padding:20px 24px; border-bottom:1px solid #f1f5f9;">
      <div style="font-size:12px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">AuditProRx · New Post</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px; font-size:15px; color:#0f172a;">Hi ${safeName},</p>
      <p style="margin:0 0 16px; font-size:14px; color:#334155; line-height:1.6;">
        A new post was just published on AuditProRx. Here's a quick look:
      </p>
      <h2 style="margin:0 0 8px; font-size:18px; color:#0f172a; line-height:1.35;">${safeTitle}</h2>
      ${
        safePreview
          ? `<p style="margin:0 0 24px; font-size:14px; color:#475569; line-height:1.6;">${safePreview}</p>`
          : ""
      }
      <p style="margin:0 0 24px;">
        <a href="${APP_URL}" style="display:inline-block; background:#0f172a; color:#ffffff; text-decoration:none; padding:11px 20px; border-radius:8px; font-weight:600; font-size:14px;">
          Open AuditProRx → log in and check Leads
        </a>
      </p>
      <p style="margin:0; font-size:13px; color:#64748b;">
        Or paste this link into your browser:<br/>
        <a href="${APP_URL}" style="color:#2563eb; word-break:break-all;">${APP_URL}</a>
      </p>
    </div>
    <div style="padding:16px 24px; background:#f8fafc; border-top:1px solid #f1f5f9;">
      <p style="margin:0; font-size:11px; color:#94a3b8;">
        You're receiving this because your AuditProRx account is verified. Log in to react or respond to this post.
      </p>
    </div>
  </div>
</div>
`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function sendNewPostBroadcast({ post }) {
  if (!post || !post.title) {
    console.warn("[broadcast] skipped — missing post or title");
    return { sent: 0, batches: 0 };
  }

  const recipientsRes = await pool.query(
    `SELECT id, name, email
       FROM users
      WHERE is_verified = true
        AND email IS NOT NULL
        AND TRIM(email) <> ''`
  );
  const recipients = recipientsRes.rows;

  if (recipients.length === 0) {
    console.log("[broadcast] no verified recipients; nothing to send");
    return { sent: 0, batches: 0 };
  }

  const preview = buildPreview(post.content);
  const subject = `New on AuditProRx: ${post.title}`;
  const from = process.env.EMAIL_FROM || "noreply@auditprorx.com";

  const payloads = recipients.map((u) => ({
    from,
    to: [u.email],
    subject,
    html: buildHtml({ name: u.name, title: post.title, preview }),
  }));

  const batches = chunk(payloads, BATCH_SIZE);
  console.log(
    `[broadcast] sending "${post.title}" to ${recipients.length} recipient(s) in ${batches.length} batch(es)`
  );

  let sent = 0;
  const client = getClient();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const { data, error } = await client.batch.send(batch);
      if (error) {
        console.error(
          `[broadcast] batch ${i + 1}/${batches.length} failed:`,
          error
        );
        continue;
      }
      sent += batch.length;
      console.log(
        `[broadcast] batch ${i + 1}/${batches.length} sent (${batch.length} emails), ids:`,
        Array.isArray(data?.data) ? data.data.map((d) => d.id) : data
      );
    } catch (err) {
      console.error(
        `[broadcast] batch ${i + 1}/${batches.length} threw:`,
        err?.message || err
      );
    }
  }

  console.log(`[broadcast] done. sent=${sent}/${recipients.length}`);
  return { sent, batches: batches.length };
}
