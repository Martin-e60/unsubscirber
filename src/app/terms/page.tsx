import type { Metadata } from "next";
import { LegalShell } from "@/components/layout/LegalShell";

export const metadata: Metadata = { title: "Terms of Service | Tidely" };

const CONTACT = "martin.marinov406@gmail.com";

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="6 September 2026">
      <h2>The service</h2>
      <p>
        Tidely is a free tool that helps you unsubscribe from unwanted email in
        your Gmail mailbox. It is provided as-is, with no guarantee of
        availability, accuracy, or of any particular result.
      </p>

      <h2>Your account</h2>
      <p>
        You need a Google account to use Tidely, and you are responsible for what
        happens under it. You may stop using the service at any time and revoke
        its access from your Google account settings.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Only connect a mailbox you are authorised to access.</li>
        <li>Do not use Tidely to send unsolicited email.</li>
        <li>
          Do not attempt to disrupt the service, work around its limits, or
          interfere with the systems it connects to.
        </li>
      </ul>

      <h2>Unsubscribe requests</h2>
      <p>
        Unsubscribe requests are carried out against third-party systems that
        Tidely does not control. A sender may ignore a valid request, take time to
        process it, or keep sending mail under a different address. Tidely reports
        what it attempted; it cannot guarantee the outcome.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, Tidely is not liable for email you
        continue to receive, for messages you miss, or for any indirect or
        consequential loss arising from your use of the service.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change. The date at the top of this page shows when they
        last did, and continued use after a change means you accept the updated
        terms.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </LegalShell>
  );
}
