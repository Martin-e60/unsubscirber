/** Public feature descriptions, shared by navigation and feature pages. */
export const FEATURES = [
  {
    slug: "unsubscriber",
    name: "Unsubscriber",
    description: "Leave the mailing lists you no longer want.",
    details: [
      "Choose one sender or select several to unsubscribe in bulk.",
      "Tidely uses the sender's unsubscribe method and shows when a request was sent, removal was confirmed, or another click is needed.",
    ],
  },
  {
    slug: "senders",
    name: "Senders",
    description: "See your subscriptions in one place.",
    details: [
      "Scan your connected Gmail account and group subscription emails by sender.",
      "Search, sort and filter the list. See how often a sender writes, then choose what to keep or unsubscribe from.",
    ],
  },
  {
    slug: "rollups",
    name: "Rollups",
    description: "Collect the newsletters you want to read together.",
    details: [
      "Mark senders for a Rollup and manage them in a separate list. You can undo that choice at any time.",
      "Scheduled digest delivery is coming soon. Marking a sender currently does not change how its emails arrive in Gmail.",
    ],
  },
  {
    slug: "unsubscribe-history",
    name: "Unsubscribe history",
    description: "See what happened with each unsubscribe attempt.",
    details: [
      "Review confirmed removals, email requests sent, failed attempts and links that need your attention.",
      "A sent request is shown separately from a confirmed removal. Tidely does not yet monitor whether a sender continues emailing you afterwards.",
    ],
  },
] as const;
