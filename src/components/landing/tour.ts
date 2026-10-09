/**
 * The landing page's feature tour: what it lists, and which entry is current.
 *
 * The previews are static screenshots of the demo's sample-data screens
 * (public/landing), not running copies of the app.
 */

export type TourFeature = {
  id: string;
  name: string;
  description: string;
  image: string;
  alt: string;
};

export const TOUR_FEATURES: readonly TourFeature[] = [
  {
    id: "home",
    name: "Home",
    description:
      "Your mailbox at a glance, with the next step to take. Impact figures are estimates based on confirmed removals.",
    image: "/landing/tour-home.webp",
    alt: "The Home screen: the next step, the last scan and the impact estimates.",
  },
  {
    id: "cleanup",
    name: "Cleanup",
    description: "Review your senders and choose Keep or Unsubscribe for each one.",
    image: "/landing/tour-cleanup.webp",
    alt: "The Cleanup screen: a list of senders with Keep and Unsubscribe choices.",
  },
  {
    id: "clear-out",
    name: "Clear out",
    description:
      "Select emails to organize: archive them, label them or move them to Trash.",
    image: "/landing/tour-clear-out.webp",
    alt: "The Clear out screen: a list of emails with checkboxes for selecting them.",
  },
  {
    id: "unsubscribed",
    name: "Unsubscribed",
    description:
      "Your confirmed removals, and any email received from those senders afterwards when you check.",
    image: "/landing/tour-unsubscribed.webp",
    alt: "The Unsubscribed screen: the senders you left and what was seen after.",
  },
];

/**
 * The entry that is current: the last one whose top edge has reached the
 * anchor line. Position alone decides it, so a settled page always has exactly
 * one answer and a name cannot flicker. Before the first entry has reached the
 * line, the first one is current.
 */
export function activeFeature(tops: readonly number[], anchor: number): number {
  let active = 0;
  tops.forEach((top, index) => {
    if (top <= anchor) active = index;
  });
  return active;
}
