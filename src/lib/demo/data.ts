import { SENDER_STATUS, UNSUBSCRIBE_METHOD, type SenderStatus, type UnsubscribeMethod } from "@/lib/constants";

/**
 * The demo mailbox.
 *
 * Every sender, subject line and address below is invented. The domains are all
 * under example.com / example.org, which exist precisely so documentation and
 * demos can use them without touching anybody's real service, and the "finish
 * this yourself" links point there too — so a visitor clicking through the demo
 * cannot reach a real unsubscribe endpoint.
 *
 * `outcome` is what the demo will do when this sender is unsubscribed. The four
 * values mirror the four things the real engine can honestly report, and the
 * mix here is deliberate: a demo where everything succeeds would misrepresent
 * how unsubscribing actually goes.
 */

export type DemoOutcome = "SUCCESS" | "SENT" | "MANUAL" | "FAILED";

export type DemoSenderSeed = {
  id: string;
  name: string;
  address: string;
  messageCount: number;
  firstSeenDaysAgo: number;
  lastSeenDaysAgo: number;
  sampleSubject: string;
  /** How this sender advertises unsubscribing. Null means it does not. */
  method: UnsubscribeMethod | null;
  /** One-click is only possible over a header the sender publishes. */
  oneClick?: boolean;
  outcome: DemoOutcome;
  /** Seeds that already have a decision, so the demo has a history to show. */
  status?: SenderStatus;
  decidedDaysAgo?: number;
  /** Held back until the visitor scans further back than the default window. */
  reserve?: boolean;
};

export const DEMO_USER = {
  id: "demo-user",
  name: "Sam Rivers",
  email: "sam.rivers@example.com",
};

export const DEMO_ACCOUNT = {
  id: "demo-mailbox",
  email: "sam.rivers@example.com",
  provider: "gmail",
};

/** Messages the simulated scan reports having read. */
export const DEMO_SCAN_TOTAL = 3_840;

export const DEMO_SENDERS: DemoSenderSeed[] = [
  {
    id: "d01",
    name: "Kettle & Crumb",
    address: "hello@kettleandcrumb.example.com",
    messageCount: 186,
    firstSeenDaysAgo: 330,
    lastSeenDaysAgo: 1,
    sampleSubject: "Today only: 30% off everything in the bakery shop",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "d02",
    name: "Nimbus Deals",
    address: "offers@nimbusdeals.example.com",
    messageCount: 164,
    firstSeenDaysAgo: 300,
    lastSeenDaysAgo: 1,
    sampleSubject: "Your weekend flash sale is live",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "d03",
    name: "Pixelforge",
    address: "product@pixelforge.example.com",
    messageCount: 121,
    firstSeenDaysAgo: 340,
    lastSeenDaysAgo: 2,
    sampleSubject: "New in the editor: nested components",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "MANUAL",
  },
  {
    id: "d04",
    name: "The Sunday Long Read",
    address: "editor@sundaylongread.example.org",
    messageCount: 48,
    firstSeenDaysAgo: 336,
    lastSeenDaysAgo: 3,
    sampleSubject: "Issue 148: the quiet economics of repair",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    status: SENDER_STATUS.KEPT,
    decidedDaysAgo: 9,
  },
  {
    id: "d05",
    name: "Harbourline Rail",
    address: "travel@harbourlinerail.example.com",
    messageCount: 94,
    firstSeenDaysAgo: 290,
    lastSeenDaysAgo: 4,
    sampleSubject: "Timetable changes on your saved route",
    method: UNSUBSCRIBE_METHOD.MAILTO,
    outcome: "SENT",
  },
  {
    id: "d06",
    name: "Lumen Fitness",
    address: "news@lumenfitness.example.com",
    messageCount: 88,
    firstSeenDaysAgo: 250,
    lastSeenDaysAgo: 2,
    sampleSubject: "Five moves for a stronger week",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "d07",
    name: "Cardamom Kitchen",
    address: "recipes@cardamomkitchen.example.org",
    messageCount: 76,
    firstSeenDaysAgo: 320,
    lastSeenDaysAgo: 5,
    sampleSubject: "One pan, six ingredients, twenty minutes",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "SUCCESS",
  },
  {
    id: "d08",
    name: "Strata Analytics",
    address: "updates@strata-analytics.example.com",
    messageCount: 71,
    firstSeenDaysAgo: 210,
    lastSeenDaysAgo: 1,
    sampleSubject: "Your weekly dashboard digest",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    status: SENDER_STATUS.UNSUBSCRIBED,
    decidedDaysAgo: 4,
  },
  {
    id: "d09",
    name: "Meadowgate Garden Centre",
    address: "shop@meadowgate.example.com",
    messageCount: 64,
    firstSeenDaysAgo: 300,
    lastSeenDaysAgo: 6,
    sampleSubject: "Bare-root season starts this week",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "SUCCESS",
  },
  {
    id: "d10",
    name: "Orbital Games",
    address: "noreply@orbitalgames.example.com",
    messageCount: 59,
    firstSeenDaysAgo: 180,
    lastSeenDaysAgo: 2,
    sampleSubject: "Patch 4.2 is out — here's what changed",
    method: UNSUBSCRIBE_METHOD.BODY_LINK,
    outcome: "MANUAL",
  },
  {
    id: "d11",
    name: "Tidewater Bookshop",
    address: "books@tidewater.example.org",
    messageCount: 52,
    firstSeenDaysAgo: 310,
    lastSeenDaysAgo: 8,
    sampleSubject: "Staff picks for a long evening",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    status: SENDER_STATUS.KEPT,
    decidedDaysAgo: 21,
  },
  {
    id: "d12",
    name: "Brightpath Courses",
    address: "learn@brightpath.example.com",
    messageCount: 47,
    firstSeenDaysAgo: 260,
    lastSeenDaysAgo: 3,
    sampleSubject: "Only 2 days left to enrol",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "FAILED",
  },
  {
    id: "d13",
    name: "Copperleaf Interiors",
    address: "studio@copperleaf.example.com",
    messageCount: 43,
    firstSeenDaysAgo: 275,
    lastSeenDaysAgo: 7,
    sampleSubject: "Autumn lookbook: warm minimal",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "d14",
    name: "Ferrytown Council",
    address: "bulletin@ferrytown.example.org",
    messageCount: 38,
    firstSeenDaysAgo: 340,
    lastSeenDaysAgo: 11,
    sampleSubject: "Roadworks and collection dates for October",
    method: null,
    outcome: "FAILED",
  },
  {
    id: "d15",
    name: "Solvent Supply Co.",
    address: "sales@solventsupply.example.com",
    messageCount: 36,
    firstSeenDaysAgo: 150,
    lastSeenDaysAgo: 1,
    sampleSubject: "Re: following up on your quote",
    method: UNSUBSCRIBE_METHOD.MAILTO,
    outcome: "SENT",
    status: SENDER_STATUS.REQUESTED,
    decidedDaysAgo: 6,
  },
  {
    id: "d16",
    name: "Northwind Weather",
    address: "alerts@northwindweather.example.com",
    messageCount: 34,
    firstSeenDaysAgo: 200,
    lastSeenDaysAgo: 2,
    sampleSubject: "Wind warning for your area tomorrow",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "d17",
    name: "Halcyon Audio",
    address: "hello@halcyonaudio.example.com",
    messageCount: 31,
    firstSeenDaysAgo: 240,
    lastSeenDaysAgo: 9,
    sampleSubject: "Your cart is waiting (and so are the headphones)",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "MANUAL",
    status: SENDER_STATUS.MANUAL,
    decidedDaysAgo: 3,
  },
  {
    id: "d18",
    name: "Quillmark Stationery",
    address: "post@quillmark.example.org",
    messageCount: 29,
    firstSeenDaysAgo: 290,
    lastSeenDaysAgo: 14,
    sampleSubject: "Refill season: notebooks restocked",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "d19",
    name: "Verdant Grocery",
    address: "boxes@verdantgrocery.example.com",
    messageCount: 27,
    firstSeenDaysAgo: 170,
    // Nothing since the unsubscribe twelve days ago: the "no new mail" case.
    lastSeenDaysAgo: 13,
    sampleSubject: "This week's box: what's inside",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    status: SENDER_STATUS.UNSUBSCRIBED,
    decidedDaysAgo: 12,
  },
  {
    id: "d20",
    name: "Clearwater Insurance",
    address: "renewals@clearwaterinsure.example.com",
    messageCount: 24,
    firstSeenDaysAgo: 330,
    lastSeenDaysAgo: 16,
    sampleSubject: "Your policy renews in 30 days",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "SUCCESS",
  },
  {
    id: "d21",
    name: "Beacon Jobs",
    address: "matches@beaconjobs.example.com",
    messageCount: 22,
    firstSeenDaysAgo: 120,
    lastSeenDaysAgo: 2,
    sampleSubject: "7 new roles that match your profile",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "d22",
    name: "Lanternhouse Theatre",
    address: "boxoffice@lanternhouse.example.org",
    messageCount: 19,
    firstSeenDaysAgo: 300,
    lastSeenDaysAgo: 19,
    sampleSubject: "Spring season on sale to members first",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "SUCCESS",
  },
  {
    id: "d23",
    name: "Grovemoor Charity",
    address: "appeals@grovemoor.example.org",
    messageCount: 17,
    firstSeenDaysAgo: 320,
    lastSeenDaysAgo: 10,
    sampleSubject: "Your support kept the doors open",
    method: UNSUBSCRIBE_METHOD.MAILTO,
    outcome: "SENT",
  },
  {
    id: "d24",
    name: "Slate & Stone Careers",
    address: "talent@slateandstone.example.com",
    messageCount: 14,
    firstSeenDaysAgo: 95,
    lastSeenDaysAgo: 22,
    sampleSubject: "A role we thought you'd like",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "FAILED",
    status: SENDER_STATUS.FAILED,
    decidedDaysAgo: 8,
  },

  {
    // Unsubscribed a few minutes ago, after the sample scan: "not checked yet".
    id: "d30",
    name: "Pinecrest Weekly",
    address: "digest@pinecrestweekly.example.org",
    messageCount: 26,
    firstSeenDaysAgo: 190,
    lastSeenDaysAgo: 2,
    sampleSubject: "Five stories worth your Sunday",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    status: SENDER_STATUS.UNSUBSCRIBED,
    decidedDaysAgo: 5 / 1440,
  },

  // Held back: these only appear if the visitor scans further back than the
  // default 30-day window, so the lookback control does something visible.
  {
    id: "d25",
    name: "Old Mill Cycles",
    address: "news@oldmillcycles.example.com",
    messageCount: 41,
    firstSeenDaysAgo: 700,
    lastSeenDaysAgo: 64,
    sampleSubject: "Winter servicing slots are open",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    reserve: true,
  },
  {
    id: "d26",
    name: "Thornbury Wines",
    address: "cellar@thornburywines.example.org",
    messageCount: 33,
    firstSeenDaysAgo: 640,
    lastSeenDaysAgo: 78,
    sampleSubject: "Six bottles for the darker months",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "MANUAL",
    reserve: true,
  },
  {
    id: "d27",
    name: "Redgate Conference",
    address: "tickets@redgateconf.example.com",
    messageCount: 26,
    firstSeenDaysAgo: 590,
    lastSeenDaysAgo: 120,
    sampleSubject: "Last call for early-bird tickets",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    reserve: true,
  },
  {
    id: "d28",
    name: "Palewater Hotels",
    address: "stay@palewaterhotels.example.com",
    messageCount: 21,
    firstSeenDaysAgo: 610,
    lastSeenDaysAgo: 96,
    sampleSubject: "A midweek break, 20% off",
    method: UNSUBSCRIBE_METHOD.MAILTO,
    outcome: "SENT",
    reserve: true,
  },
  {
    id: "d29",
    name: "Ironvale Hardware",
    address: "store@ironvale.example.com",
    messageCount: 18,
    firstSeenDaysAgo: 680,
    lastSeenDaysAgo: 150,
    sampleSubject: "Clearance: last of the summer stock",
    method: null,
    outcome: "FAILED",
    reserve: true,
  },
];

/**
 * Mail that arrived after a confirmed unsubscribe — the Unsubscribed page's
 * "new emails" case. Strata Analytics was unsubscribed four days ago.
 */
export type DemoFollowUpSeed = {
  id: string;
  senderId: string;
  subject: string;
  receivedDaysAgo: number;
};

export const DEMO_FOLLOW_UPS: DemoFollowUpSeed[] = [
  { id: "f01", senderId: "d08", subject: "Your weekly dashboard digest", receivedDaysAgo: 2.4 },
  { id: "f02", senderId: "d08", subject: "New: team benchmarks are here", receivedDaysAgo: 1 },
];

/** A sample link for the "needs a click" outcome. Points at a reserved domain. */
export function demoManualUrl(id: string): string {
  return `https://example.com/demo-unsubscribe/${id}?confirm=1`;
}
