/**
 * Email sending infrastructure for P3-3.
 *
 * Cloudflare Workers cannot make raw TCP/TLS connections, so traditional SMTP
 * is not available. This module uses HTTP-based email APIs instead:
 *
 * 1. Resend (recommended) - simple API key setup
 * 2. SMTP2GO - HTTP API with SMTP-like config
 * 3. Mailgun - HTTP API
 *
 * The UI collects SMTP-style config (host, port, user, pass) for familiarity,
 * but we map known providers to their HTTP APIs. For truly custom SMTP servers,
 * users would need to use a provider that offers an HTTP relay.
 */

export interface EmailConfig {
  host: string | null;
  port: number | null;
  user: string | null;
  pass: string | null;
  from: string | null;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Known SMTP hosts mapped to their HTTP API endpoints.
 * When a user configures one of these hosts, we use the HTTP API instead.
 */
const PROVIDER_MAP: Record<string, { name: string; apiUrl: string }> = {
  // Resend uses API key in the password field
  "smtp.resend.com": {
    name: "resend",
    apiUrl: "https://api.resend.com/emails",
  },
  // SMTP2GO HTTP API
  "mail.smtp2go.com": {
    name: "smtp2go",
    apiUrl: "https://api.smtp2go.com/v3/email/send",
  },
};

/**
 * Detect provider from SMTP host and route to appropriate HTTP API.
 */
function detectProvider(host: string | null): { name: string; apiUrl: string } | null {
  if (!host) return null;
  const normalized = host.toLowerCase().trim();
  return PROVIDER_MAP[normalized] ?? null;
}

/**
 * Send email via Resend HTTP API.
 * Config: host=smtp.resend.com, pass=re_xxxxx (API key), from=you@yourdomain.com
 */
async function sendViaResend(config: EmailConfig, message: EmailMessage): Promise<SendResult> {
  const apiKey = config.pass;
  if (!apiKey) {
    return { success: false, error: "Resend API key required in password field" };
  }

  const from = config.from || config.user;
  if (!from) {
    return { success: false, error: "From address required" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    return {
      success: false,
      error: body.message || `Resend returned ${res.status}`,
    };
  }

  const data = await res.json() as { id?: string };
  return { success: true, messageId: data.id };
}

/**
 * Send email via SMTP2GO HTTP API.
 * Config: host=mail.smtp2go.com, user=apikey, pass=api-xxxxx, from=you@domain.com
 */
async function sendViaSMTP2GO(config: EmailConfig, message: EmailMessage): Promise<SendResult> {
  const apiKey = config.pass;
  if (!apiKey) {
    return { success: false, error: "SMTP2GO API key required in password field" };
  }

  const from = config.from || config.user;
  if (!from) {
    return { success: false, error: "From address required" };
  }

  const res = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      sender: from,
      to: [message.to],
      subject: message.subject,
      html_body: message.html,
      text_body: message.text,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { data?: { error?: string } };
    return {
      success: false,
      error: body.data?.error || `SMTP2GO returned ${res.status}`,
    };
  }

  const data = await res.json() as { data?: { email_id?: string } };
  return { success: true, messageId: data.data?.email_id };
}

/**
 * Generic email send that routes to the appropriate provider based on SMTP host.
 *
 * Supported configurations:
 *
 * **Resend** (recommended):
 * - Host: smtp.resend.com
 * - Port: 587 (ignored, using HTTP)
 * - User: resend (ignored)
 * - Pass: re_xxxxx (your Resend API key)
 * - From: you@yourdomain.com
 *
 * **SMTP2GO**:
 * - Host: mail.smtp2go.com
 * - Port: 587 (ignored, using HTTP)
 * - User: (ignored)
 * - Pass: api-xxxxx (your SMTP2GO API key)
 * - From: you@yourdomain.com
 */
export async function sendEmail(config: EmailConfig, message: EmailMessage): Promise<SendResult> {
  const provider = detectProvider(config.host);

  if (!provider) {
    return {
      success: false,
      error: `Unsupported email provider. Use smtp.resend.com or mail.smtp2go.com. ` +
        `Raw SMTP is not available on Cloudflare Workers.`,
    };
  }

  switch (provider.name) {
    case "resend":
      return sendViaResend(config, message);
    case "smtp2go":
      return sendViaSMTP2GO(config, message);
    default:
      return { success: false, error: `Provider ${provider.name} not implemented` };
  }
}

/**
 * Test email configuration by sending a test message.
 */
export async function sendTestEmail(config: EmailConfig, toAddress: string): Promise<SendResult> {
  return sendEmail(config, {
    to: toAddress,
    subject: "Money Pal - Test Email",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Money Pal is connected</h2>
        <p>Your email notifications are configured correctly.</p>
        <p style="color: #6b7280; font-size: 14px;">
          You'll receive monthly financial reports at this address.
        </p>
      </div>
    `,
    text: "Money Pal is connected. Your email notifications are configured correctly.",
  });
}
