// lib/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.EMAIL_FROM || 'ARIA <noreply@step2dev.io>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string
): Promise<boolean> {
  // If no Resend key, skip silently in dev
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping verification email')
    console.warn(`[email] Verify URL: ${APP_URL}/auth/verify?token=${token}`)
    return true
  }

  try {
    const verifyUrl = `${APP_URL}/auth/verify?token=${token}`

    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Verify your Step2Dev account',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center;">
            <div style="width:52px;height:52px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;margin-bottom:12px;line-height:52px;">AI</div>
            <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;letter-spacing:-0.03em;">Step2Dev — ARIA</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="font-size:20px;font-weight:700;color:#09090f;margin:0 0 12px;letter-spacing:-0.02em;">
              Verify your email, ${name.split(' ')[0]} 👋
            </h2>
            <p style="font-size:15px;color:#52525b;line-height:1.65;margin:0 0 28px;">
              You're one step away from accessing ARIA — your AI Senior DevOps Engineer with 40 years of experience.
              Click the button below to verify your email and get started.
            </p>

            <div style="text-align:center;margin:28px 0;">
              <a href="${verifyUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:-0.01em;box-shadow:0 4px 16px rgba(79,70,229,0.4);">
                Verify my email →
              </a>
            </div>

            <p style="font-size:13px;color:#a1a1aa;margin:24px 0 0;line-height:1.6;">
              This link expires in <strong>24 hours</strong>.
              If you didn't create an account, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Features preview -->
        <tr>
          <td style="padding:0 40px 32px;">
            <div style="background:#f4f4f6;border-radius:10px;padding:18px 20px;">
              <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#a1a1aa;margin:0 0 12px;">What you get with ARIA</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${[
                  ['⚡', 'Error → Fix in seconds', 'Paste any error, get exact copy-paste commands'],
                  ['📦', 'Repo Security Grader', 'Grade any GitHub repo A–F on security & CI/CD'],
                  ['🖥️', 'Server Health AI', 'Live metrics + AI diagnosis of your infrastructure'],
                  ['🧠', '4-Week Memory', 'ARIA remembers your stack and past issues'],
                ].map(([icon, title, desc]) => `
                <tr>
                  <td style="padding:5px 0;vertical-align:top;width:28px;">
                    <span style="font-size:16px;">${icon}</span>
                  </td>
                  <td style="padding:5px 0 5px 8px;">
                    <span style="font-size:13px;font-weight:600;color:#09090f;">${title}</span>
                    <span style="font-size:12px;color:#71717a;"> — ${desc}</span>
                  </td>
                </tr>`).join('')}
              </table>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #e4e4e7;text-align:center;">
            <p style="font-size:12px;color:#a1a1aa;margin:0;">
              Step2Dev · ARIA AI DevOps Engineer<br>
              <a href="${APP_URL}" style="color:#4f46e5;text-decoration:none;">${APP_URL}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })
    return true
  } catch (err) {
    console.error('[email] Failed to send verification:', err)
    return false
  }
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Welcome to ARIA, ${name.split(' ')[0]}! 🚀`,
      html: `
<html><body style="font-family:-apple-system,sans-serif;background:#f4f4f6;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center;">
    <h1 style="color:#fff;font-size:24px;font-weight:800;margin:0;">You're in, ${name.split(' ')[0]}! 🎉</h1>
  </div>
  <div style="padding:36px 40px;">
    <p style="font-size:15px;color:#52525b;line-height:1.65;">
      ARIA is ready to help you. Here's how to get the most out of it right now:
    </p>
    <div style="margin:20px 0;">
      ${[
        ['1', 'Go to Chat tab', 'Ask anything — "Why is my Docker container using 100% CPU?"'],
        ['2', 'Try Error Analyzer', 'Paste any error and get copy-paste fix commands'],
        ['3', 'Scan a GitHub repo', 'Drop any public repo URL and get a security grade'],
        ['4', 'Add your server', 'Install the monitoring agent for live CPU/RAM/disk'],
      ].map(([n, title, desc]) => `
      <div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start;">
        <div style="width:24px;height:24px;background:#4f46e5;border-radius:50%;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:24px;text-align:center;">${n}</div>
        <div><strong style="font-size:14px;color:#09090f;">${title}</strong><br><span style="font-size:13px;color:#71717a;">${desc}</span></div>
      </div>`).join('')}
    </div>
    <div style="text-align:center;margin-top:28px;">
      <a href="${APP_URL}/dashboard/aria" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:13px 32px;border-radius:11px;font-size:14px;font-weight:700;">
        Open ARIA →
      </a>
    </div>
  </div>
</div>
</body></html>`,
    })
  } catch {}
}
