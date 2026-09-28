import type { Metadata } from "next";
import { LegalShell } from "@/components/layout/LegalShell";

export const metadata: Metadata = { title: "Terms of Service | Tidely" };

const CONTACT = "martin.marinov406@gmail.com";

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="26 September 2026">
      <h2>The service</h2>
      <p>
        Tidely is a free tool that helps you unsubscribe from unwanted email in
        your Gmail mailbox. There is no paid plan, no trial and nothing to buy. It
        is a personal project provided as-is, with no guarantee of availability,
        accuracy, or of any particular result, and it may change or stop at any
        time.
      </p>

      <h2>Your account</h2>
      <p>
        Using Tidely on a real mailbox means connecting a Gmail account, and you
        are responsible for what happens under it. You may stop at any time:
        disconnect the mailbox or delete the account in Settings, and revoke
        Tidely&rsquo;s access from your Google account settings.
      </p>
      <p>
        The demo needs no account at all. It runs in your browser on invented
        data and touches no mailbox.
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
      <p>
        When a sender&rsquo;s only unsubscribe route is an email address, carrying
        out your request means sending one message from your Gmail address to that
        sender. By asking Tidely to unsubscribe you are asking for that message to
        be sent. A sent request is not a confirmed removal, and Tidely labels the
        two differently for that reason.
      </p>
      <p>
        Unsubscribing in bulk asks you to confirm first, because it cannot be
        undone. Nothing Tidely sends can be recalled.
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
