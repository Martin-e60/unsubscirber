import type { Metadata } from "next";
import { LegalShell } from "@/components/layout/LegalShell";

export const metadata: Metadata = { title: "Privacy Policy | Tidely" };

const CONTACT = "martin.marinov406@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="6 September 2026">
      <h2>What Tidely does</h2>
      <p>
        Tidely finds newsletters and promotional email in your Gmail mailbox,
        groups them by sender, and unsubscribes from the ones you choose.
      </p>

      <h2>What we access</h2>
      <p>
        When you connect your inbox, Tidely reads message metadata from your
        Gmail account — sender, subject, date, and the unsubscribe links Gmail
        exposes in message headers. It uses that to build the sender list you see
        and to carry out the unsubscribe requests you ask for. Tidely never sends
        email as you and never deletes your messages.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your email address and the Google account you connected.</li>
        <li>The sender summaries produced by a scan, so you don&rsquo;t have to rescan each visit.</li>
        <li>A record of which senders you unsubscribed from, kept, or ignored.</li>
      </ul>
      <p>
        Your Google refresh token is encrypted before it is written to our
        database. We do not store the body content of your emails.
      </p>

      <h2>Limited Use disclosure</h2>
      <p>
        Tidely&rsquo;s use and transfer of information received from Google APIs
        adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not sell your data, we do
        not use it for advertising or to train models, and no human reads it
        except where you explicitly ask us to, where it is needed to resolve a
        security incident, or where the law requires it.
      </p>

      <h2>Who else sees your data</h2>
      <p>
        Nobody. Tidely does not share your data with third parties. It runs on
        Vercel and stores data in Turso, both of which process it only as
        infrastructure providers on our behalf.
      </p>

      <h2>Revoking access and deleting your data</h2>
      <p>
        You can revoke Tidely&rsquo;s access to your Gmail account at any time at{" "}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noreferrer"
        >
          myaccount.google.com/permissions
        </a>
        . To have everything we store about you deleted, email{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and it will be removed.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that affects how your data is handled, the
        date at the top of this page will change and the new version will be
        published here.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </LegalShell>
  );
}
