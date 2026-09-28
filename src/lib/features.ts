/** Public feature descriptions, shared by navigation and feature pages. */
export const FEATURES = [
  {
    slug: "senders",
    name: "Senders",
    description: "See every mailing list in one place.",
    details: [
      "Tidely scans your connected Gmail account and groups subscription email by sender, with how many messages each one sent and how often it writes.",
      "Search, sort and filter that list, then decide sender by sender. A scan reads message headers only — who sent it, when, and how the sender says to unsubscribe.",
    ],
  },
  {
    slug: "unsubscriber",
    name: "Unsubscriber",
    description: "Leave the lists you no longer want.",
    details: [
      "Unsubscribe from one sender or select several and do it in one go. Tidely uses the unsubscribe method the sender itself publishes.",
      "It reports what actually happened, not what it hoped for: removal confirmed, request sent but unconfirmed, one more click needed, or failed. Some senders only offer a page you have to finish yourself, and Tidely hands you that link rather than pretending.",
    ],
  },
  {
    slug: "unsubscribe-history",
    name: "Unsubscribe history",
    description: "Check what happened with every attempt.",
    details: [
      "Every attempt is recorded — the confirmed removals, the requests sent, the links that need your attention, and the outright failures.",
      "Tidely does not monitor whether a sender keeps emailing you afterwards, so a confirmed removal is a confirmation from that sender, not a promise about your future inbox.",
    ],
  },
] as const;
