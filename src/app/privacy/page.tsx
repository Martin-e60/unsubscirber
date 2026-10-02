import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/layout/LegalShell";
import { GMAIL_MODIFY_SCOPE, GOOGLE_SCOPES } from "@/lib/constants";

export const metadata: Metadata = { title: "Privacy Policy | Tidely" };

const CONTACT = "martin.marinov406@gmail.com";

/**
 * The privacy policy, checked line by line against what the code does.
 *
 * An earlier version said the contents of your email are never read and that
 * Tidely never sends email as you. Neither was true in every case: a sender that
 * publishes no unsubscribe header can only be left by finding a link inside one
 * of its messages, and a sender whose only route is an email address can only be
 * left by sending one. Both are narrow, both are described here, and neither is
 * hidden behind a friendlier sentence.
 */
export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="2 October 2026">
      <h2>What Tidely does</h2>
      <p>
        Tidely finds newsletters and promotional email in your Gmail mailbox,
        groups them by sender, and unsubscribes from the ones you choose. Its
        Clear out page also lets you find emails already in your mailbox and
        archive them, move them to Trash, label them or mark them as read. It is
        free, and it is a personal project rather than a company.
      </p>
      <p>
        The <Link href="/demo">demo</Link> is separate from all of this: it runs
        entirely in your own browser on invented data, needs no account, and
        never contacts Google or any mailbox.
      </p>

      <h2>What Tidely reads, and exactly when</h2>
      <p>
        These are the moments Tidely reads or changes anything in your mailbox.
        This is all of them.
      </p>
      <ul>
        <li>
          <strong>When you run a scan:</strong> Tidely reads message{" "}
          <em>headers</em> — the sender, the subject line, the date, and the
          unsubscribe information senders put in the <code>List-Unsubscribe</code>{" "}
          and <code>List-Id</code> headers. It does not open the message.
        </li>
        <li>
          <strong>When you unsubscribe from a sender that published no
          unsubscribe header:</strong> the only remaining way to leave that list
          is to find a link inside the message itself, so Tidely fetches that
          sender&rsquo;s most recent message and searches its HTML for an
          unsubscribe link. This happens only for that one message, only for
          senders with no usable header, and only because you asked to
          unsubscribe.
        </li>
        <li>
          <strong>When a sender&rsquo;s only unsubscribe route is an email
          address:</strong> Tidely sends one message from your Gmail address to
          that address, with the subject &ldquo;unsubscribe&rdquo; and a single
          line asking to be removed. It sends nothing else, to nobody else, ever.
        </li>
        <li>
          <strong>When you use Clear out:</strong> Tidely searches your mailbox
          with the filters you choose and shows each matching message&rsquo;s
          sender, recipients, subject, date, size, labels and read status, plus
          Gmail&rsquo;s own short excerpt of it. It does not download message
          bodies or attachments. This is fetched while you look at the page and
          is not stored. Opening a preview does not mark an email as read.
        </li>
        <li>
          <strong>When you organise emails in Clear out,</strong> and only after
          you select them and ask: Tidely archives them, moves them to
          Gmail&rsquo;s Trash, adds one of your labels, or marks them as read. It
          changes only the messages you selected — not the rest of their
          conversations — and never deletes anything permanently. Gmail empties
          its Trash after 30 days.
        </li>
      </ul>

      <h2>The Google permissions this needs</h2>
      <p>
        When you connect your inbox, Google asks you to approve these scopes:
      </p>
      <ul>
        <li>
          <code>gmail.readonly</code> — to read message headers during a scan,
          and the one message body described above.
        </li>
        <li>
          <code>gmail.send</code> — to send the unsubscribe emails described
          above. It is not used for anything else.
        </li>
        <li>
          <code>gmail.modify</code> — only if you choose to organise mail in Clear
          out. It is not requested when you first connect: Tidely asks for it
          separately, explains it first, and keeps everything you already
          allowed. It is used to archive, move to Trash, label and mark as read
          the emails you select. Unlike Gmail&rsquo;s full-access scope, it
          cannot permanently delete mail, and Tidely never asks for full access.
        </li>
        <li>
          <code>userinfo.email</code>, <code>userinfo.profile</code> and{" "}
          <code>openid</code> — to know which mailbox is connected and to show
          your name in the interface.
        </li>
      </ul>
      <p className="muted">
        In full: <code>{GOOGLE_SCOPES.join(" ")}</code>, and, once you allow
        organising, <code>{GMAIL_MODIFY_SCOPE}</code>.
      </p>
      <p>
        Without the organise permission, Tidely cannot archive, move, label or
        modify your messages. With it, Tidely changes messages only when you
        select them and confirm, and it never deletes anything permanently.
      </p>

      <h2>What is stored</h2>
      <ul>
        <li>Your email address, your name, and the Google account you connected.</li>
        <li>
          One summary row per sender — the address, display name, how many
          messages were seen, when the first and last arrived, one sample subject
          line, and the unsubscribe details from its headers.
        </li>
        <li>Your decisions: which senders you kept and which you unsubscribed from.</li>
        <li>
          A log of every unsubscribe attempt, including the failures, with what
          was tried and what came back.
        </li>
        <li>
          The progress of your scans, so a scan can be resumed rather than
          restarted.
        </li>
        <li>
          A History of what you did in Clear out: the action, when, and how many
          emails it succeeded or failed for. Not which emails, and nothing about
          their contents.
        </li>
      </ul>
      <p>
        Your Google refresh token is encrypted with AES-256-GCM before it is
        written to the database. The login cookie is a signed token holding only
        an internal user id — no email address and no Google tokens.{" "}
        <strong>Message bodies are never stored</strong>, and neither are the
        subjects, senders or excerpts Clear out shows you. The one message that may
        be fetched during an unsubscribe is searched for a link in memory and
        discarded; what is kept is the outcome and, where relevant, the
        unsubscribe URL you were handed.
      </p>

      <h2>Who else is involved</h2>
      <ul>
        <li>
          <strong>Google</strong>, as the provider of your mailbox.
        </li>
        <li>
          <strong>Vercel</strong> (hosting) and <strong>Turso</strong> (database),
          which process this data only as infrastructure providers.
        </li>
        <li>
          <strong>The senders you unsubscribe from.</strong> An unsubscribe
          request necessarily reaches that sender&rsquo;s own systems, and a
          mailto unsubscribe tells them your email address — which they already
          have, since they were emailing you. What they do with the request is
          outside Tidely&rsquo;s control.
        </li>
      </ul>
      <p>
        Your data is not sold, not shared with anyone else, not used for
        advertising, and not used to train models.
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
        , including the Limited Use requirements. Google user data is used only to
        provide the features described on this page. No human reads it, except
        where you explicitly ask for help with something, where it is necessary
        to resolve a security incident, or where the law requires it.
      </p>

      <h2>Removing your data</h2>
      <p>There are three separate things you can do, and they differ:</p>
      <ul>
        <li>
          <strong>Disconnect mailbox</strong> (in Settings) revokes the token with
          Google and deletes every sender, scan, attempt and Clear out History
          entry stored for that mailbox. Your Tidely login stays, so you can connect a mailbox again
          without signing up twice.
        </li>
        <li>
          <strong>Delete account</strong> (in Settings) does all of the above and
          also deletes the account record itself — your email address, your name
          and the link to your Google account — then signs you out. Nothing of
          yours remains in the database.
        </li>
        <li>
          <strong>Revoke access at Google</strong>, at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          , stops Tidely reaching your mailbox immediately. It does not delete
          what Tidely already stored — use one of the two options above for that.
        </li>
      </ul>
      <p>
        Deleted rows are removed from the live database immediately. Encrypted
        infrastructure backups may keep a copy for a short period before they
        expire. If you would rather have it handled by hand, email{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
      <p>
        Unsubscribes already carried out are not reversed by any of this, and
        emails already sent cannot be unsent. Emails you archived, labelled or
        moved to Trash stay that way in Gmail.
      </p>

      <h2>Google app verification</h2>
      <p>
        The Gmail permissions above are what Google classifies as restricted
        scopes. Before an app using them can be offered to everyone, Google
        requires verification and an independent security assessment that has to
        be renewed annually. Until that is complete for this project, Google
        sign-in works only for addresses added to it as test users.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that affects how your data is handled, the
        date at the top of this page changes with it and the new version is
        published here.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </LegalShell>
  );
}
