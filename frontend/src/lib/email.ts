const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = "RESEND_API_KEY is not set";
    console.error(error, "— skipping email send:", params.subject, "to", params.to);
    return { sent: false, error };
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "WealthView Duo <onboarding@resend.dev>",
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("Resend send failed:", res.status, body);
    const error = (body as { message?: string })?.message ?? `Resend API error (${res.status})`;
    return { sent: false, error };
  }

  return { sent: true, error: null as string | null };
}

export function verificationEmailHtml(params: { fullName: string; verifyUrl: string }) {
  const { fullName, verifyUrl } = params;
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f6f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f4f1;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:32px 40px 0 40px;text-align:center;">
                <span style="font-size:22px;font-weight:800;color:#3d2c1f;">WealthView</span>
                <span style="font-size:13px;font-weight:700;color:#a8763e;background-color:#f9ede1;padding:3px 10px;border-radius:999px;margin-left:6px;">Duo</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 8px 40px;text-align:center;">
                <div style="font-size:36px;margin-bottom:12px;">✉️</div>
                <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#1f2937;">
                  Confirm your email, ${escapeHtml(fullName)}
                </h1>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
                  One click to activate your WealthView Duo account.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;text-align:center;">
                <a href="${verifyUrl}" style="display:inline-block;background-color:#a8763e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:12px;">
                  Confirm my email
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 32px 40px;text-align:center;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0 0;font-size:11px;color:#b0aaa2;">WealthView Duo</p>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
