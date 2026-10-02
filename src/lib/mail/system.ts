import "server-only";

/**
 * Email Tidely sends itself — today only password reset links.
 *
 * Not the person's Gmail: that connection is for unsubscribing and is never
 * used to send Tidely's own mail. Delivery goes through Resend's HTTP API
 * when RESEND_API_KEY and EMAIL_FROM are set. Without them:
 *   - in development the message is written to the server log instead, so
 *     the flow can be tried locally without sending anything;
 *   - in production nothing can be sent, and password recovery is not
 *     offered at all rather than pretending.
 */

export type SystemEmail = { to: string; subject: string; text: string };

export function systemMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

/** Whether a reset link can actually reach someone on this deployment. */
export function passwordRecoveryAvailable(): boolean {
  return systemMailConfigured() || process.env.NODE_ENV !== "production";
}

export async function sendSystemEmail(message: SystemEmail): Promise<void> {
  if (systemMailConfigured()) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      cache: "no-store",
    });
    // The status only: a provider's error body can echo the message.
    if (!response.ok) throw new Error(`System email was not accepted (HTTP ${response.status}).`);
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(`[mail:development] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return;
  }

  throw new Error("System email is not configured.");
}
