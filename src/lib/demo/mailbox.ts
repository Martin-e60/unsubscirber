/**
 * The demo's mailbox for Clear out.
 *
 * Invented messages for an invented person, under example.com/example.org
 * like the rest of the demo: personal mail, work, receipts, notifications
 * and newsletters, read and unread, in the Inbox and archived, some sent,
 * some labelled, some with attachments, spread over two years. Built
 * deterministically, so every visitor starts with the same mailbox.
 */

export type DemoMessageSeed = {
  id: string;
  threadId: string;
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  snippet: string;
  /** Days before the visit, fractional for the time of day. */
  daysAgo: number;
  labelIds: string[];
  hasAttachment?: boolean;
  sizeBytes: number;
  listId?: string | null;
  /** The first attempt to change it fails, so the retry path can be seen. */
  flaky?: boolean;
};

export const DEMO_LABELS = [
  { id: "Label_family", name: "Family" },
  { id: "Label_newsletters", name: "Newsletters" },
  { id: "Label_receipts", name: "Receipts" },
  { id: "Label_travel", name: "Travel" },
  { id: "Label_work", name: "Work" },
];

const ME = "Sam Rivers";
const ME_ADDRESS = "sam.rivers@example.com";
const KB = 1024;
const MB = 1024 * 1024;

/** The hand-written messages: the ones a visitor will recognise and act on. */
const PERSONAL: DemoMessageSeed[] = [
  {
    id: "m-maya-1", threadId: "t-maya", fromName: "Maya Chen", fromAddress: "maya.chen@example.org",
    to: ME, subject: "Saturday plans?", snippet: "Shall we meet around 11? I can bring the picnic blanket if the weather holds.",
    daysAgo: 0.1, labelIds: ["INBOX", "UNREAD", "Label_family"], sizeBytes: 9 * KB,
  },
  {
    id: "m-studio-1", threadId: "t-studio", fromName: "Studio North", fromAddress: "hello@studionorth.example.com",
    to: ME, subject: "Project notes for next week", snippet: "Here are the updated mockups and the notes from Thursday’s review.",
    daysAgo: 1.2, labelIds: ["INBOX", "Label_work"], hasAttachment: true, sizeBytes: 6.4 * MB,
  },
  {
    id: "m-energy-1", threadId: "t-energy-1", fromName: "City Energy", fromAddress: "billing@cityenergy.example.com",
    to: ME, subject: "Your September statement", snippet: "Your monthly statement is ready. Amount due: £64.20, collected on 14 October.",
    daysAgo: 2.4, labelIds: ["INBOX", "Label_receipts"], hasAttachment: true, sizeBytes: 220 * KB,
  },
  {
    id: "m-alex-1", threadId: "t-alex", fromName: "Alex Morgan", fromAddress: "alex.morgan@example.net",
    to: ME, subject: "Photos from our trip", snippet: "Finally got around to sending these. The one at the lighthouse is my favourite.",
    daysAgo: 10.3, labelIds: ["INBOX", "Label_travel"], hasAttachment: true, sizeBytes: 18.5 * MB,
  },
  {
    id: "m-alex-2", threadId: "t-alex", fromName: ME, fromAddress: ME_ADDRESS,
    to: "Alex Morgan", subject: "Re: Photos from our trip", snippet: "These are brilliant, thank you! Can you send the full-size one of the harbour?",
    daysAgo: 9.8, labelIds: ["SENT", "Label_travel"], sizeBytes: 12 * KB,
  },
  {
    id: "m-alex-3", threadId: "t-alex", fromName: "Alex Morgan", fromAddress: "alex.morgan@example.net",
    to: ME, subject: "Re: Photos from our trip", snippet: "Here it is — the original straight off the camera, so it’s a big one.",
    daysAgo: 9.1, labelIds: ["INBOX", "UNREAD", "Label_travel"], hasAttachment: true, sizeBytes: 26.8 * MB,
  },
  {
    id: "m-studio-2", threadId: "t-studio-2", fromName: "Priya Natarajan", fromAddress: "priya@studionorth.example.com",
    to: ME, subject: "Contract draft for the spring campaign", snippet: "Attached is the draft. Have a look at clause 4 before we send it over.",
    daysAgo: 23.5, labelIds: ["Label_work"], hasAttachment: true, sizeBytes: 1.2 * MB,
  },
  {
    id: "m-studio-3", threadId: "t-studio-2", fromName: ME, fromAddress: ME_ADDRESS,
    to: "Priya Natarajan", subject: "Re: Contract draft for the spring campaign", snippet: "Clause 4 looks fine to me. One small change to the dates in section 2.",
    daysAgo: 22.9, labelIds: ["SENT", "Label_work"], sizeBytes: 14 * KB,
  },
  {
    id: "m-mum-1", threadId: "t-mum", fromName: "Mum", fromAddress: "helen.rivers@example.org",
    to: ME, subject: "Sunday lunch", snippet: "Your dad is doing the roast again. Let me know if Maya is coming too.",
    daysAgo: 5.6, labelIds: ["INBOX", "Label_family"], sizeBytes: 7 * KB,
  },
  {
    id: "m-harbour-1", threadId: "t-harbour-1", fromName: "Harbourline Rail", fromAddress: "tickets@harbourlinerail.example.com",
    to: ME, subject: "Your e-ticket: Ferrytown to Kingsport", snippet: "Booking reference HLR-48213. Coach C, seat 42. Show this ticket on your phone.",
    daysAgo: 33.2, labelIds: ["Label_travel"], hasAttachment: true, sizeBytes: 340 * KB,
  },
  {
    id: "m-hotel-1", threadId: "t-hotel-1", fromName: "Palewater Hotels", fromAddress: "reservations@palewaterhotels.example.com",
    to: ME, subject: "Booking confirmed: 2 nights in Kingsport", snippet: "We look forward to welcoming you. Check-in from 3pm; breakfast is included.",
    daysAgo: 35.7, labelIds: ["INBOX", "Label_travel"], sizeBytes: 64 * KB,
  },
  {
    id: "m-dentist-1", threadId: "t-dentist", fromName: "Brookside Dental", fromAddress: "appointments@brooksidedental.example.com",
    to: ME, subject: "Reminder: check-up on 14 October", snippet: "This is a reminder of your appointment at 9:20am. Reply if you need to rearrange.",
    daysAgo: 3.1, labelIds: ["INBOX", "UNREAD"], sizeBytes: 11 * KB,
  },
  {
    id: "m-bank-1", threadId: "t-bank-1", fromName: "Fernhill Bank", fromAddress: "statements@fernhillbank.example.com",
    to: ME, subject: "Your annual account summary", snippet: "Your annual summary for the year to 31 March is ready to view in the app.",
    daysAgo: 186, labelIds: ["Label_receipts"], hasAttachment: true, sizeBytes: 2.1 * MB,
  },
  {
    id: "m-verdant-receipt", threadId: "t-verdant-receipt", fromName: "Verdant Grocery", fromAddress: "orders@verdantgrocery.example.com",
    to: ME, subject: "Receipt for your order #20714", snippet: "Thanks for your order. Your veg box arrives on Thursday between 8am and noon.",
    daysAgo: 41.3, labelIds: ["Label_receipts"], sizeBytes: 48 * KB,
  },
  {
    id: "m-old-photos", threadId: "t-old-photos", fromName: "Alex Morgan", fromAddress: "alex.morgan@example.net",
    to: ME, subject: "Wedding photos (the big ones)", snippet: "As promised, every photo at full size. Download them before the link expires!",
    daysAgo: 540, labelIds: ["Label_family"], hasAttachment: true, sizeBytes: 31.4 * MB, flaky: true,
  },
  {
    id: "m-studio-old", threadId: "t-studio-old", fromName: "Studio North", fromAddress: "hello@studionorth.example.com",
    to: ME, subject: "Brand guidelines v1", snippet: "Here is the first version of the brand guidelines, with the colour palette and type.",
    daysAgo: 410, labelIds: ["Label_work"], hasAttachment: true, sizeBytes: 12.3 * MB,
  },
  {
    id: "m-landlord", threadId: "t-landlord", fromName: "Oakfield Lettings", fromAddress: "lettings@oakfield.example.com",
    to: ME, subject: "Tenancy renewal documents", snippet: "Please find attached the renewal agreement. Sign and return by the end of the month.",
    daysAgo: 270, labelIds: [], hasAttachment: true, sizeBytes: 3.6 * MB,
  },
  {
    id: "m-maya-old", threadId: "t-maya-old", fromName: "Maya Chen", fromAddress: "maya.chen@example.org",
    to: ME, subject: "Book club: next pick", snippet: "I vote for the lighthouse novel. Tidewater has it in stock if anyone needs a copy.",
    daysAgo: 128, labelIds: [], sizeBytes: 8 * KB,
  },
  {
    id: "m-council", threadId: "t-council", fromName: "Ferrytown Council", fromAddress: "council-tax@ferrytown.example.org",
    to: ME, subject: "Council tax bill 2026/27", snippet: "Your council tax bill for the coming year is attached. Ten monthly instalments.",
    daysAgo: 214, labelIds: ["Label_receipts"], hasAttachment: true, sizeBytes: 410 * KB,
  },
];

/** Repeating mail: newsletters, notifications and receipts from the demo's senders. */
const STREAMS: {
  key: string;
  fromName: string;
  fromAddress: string;
  everyDays: number;
  count: number;
  startDaysAgo: number;
  subjects: string[];
  snippets: string[];
  labelIds?: string[];
  listId?: string;
  inboxFor?: number;
  unreadFor?: number;
  attachmentEvery?: number;
  size: number;
}[] = [
  {
    key: "nimbus", fromName: "Nimbus Deals", fromAddress: "offers@nimbusdeals.example.com",
    everyDays: 4, count: 26, startDaysAgo: 4.3,
    subjects: ["Your weekend flash sale is live", "Ending tonight: up to 40% off", "Picked for you this week", "Last chance on these deals"],
    snippets: ["A few offers selected for you.", "Prices drop at midnight.", "Based on what you looked at recently."],
    listId: "deals.nimbusdeals.example.com", inboxFor: 40, unreadFor: 30, size: 86 * KB,
  },
  {
    key: "kettle", fromName: "Kettle & Crumb", fromAddress: "hello@kettleandcrumb.example.com",
    everyDays: 6, count: 20, startDaysAgo: 6.2,
    subjects: ["A little treat for your inbox", "Today only: 30% off in the bakery shop", "New: autumn loaves", "Recipe: overnight focaccia"],
    snippets: ["See what is fresh this week.", "Warm from the oven and on the shelves now.", "Our head baker shares her method."],
    listId: "news.kettleandcrumb.example.com", inboxFor: 30, unreadFor: 20, size: 120 * KB,
  },
  {
    key: "pixelforge", fromName: "Pixelforge", fromAddress: "product@pixelforge.example.com",
    everyDays: 9, count: 14, startDaysAgo: 8.1,
    subjects: ["New tools for your next project", "What’s new in Pixelforge", "Tips: faster exports"],
    snippets: ["Explore the latest updates.", "Three features you asked for.", "Save time on every export."],
    listId: "product.pixelforge.example.com", inboxFor: 20, size: 140 * KB,
  },
  {
    key: "tidewater", fromName: "Tidewater Bookshop", fromAddress: "books@tidewater.example.org",
    everyDays: 14, count: 12, startDaysAgo: 12.4,
    subjects: ["Staff picks for a long evening", "New arrivals this fortnight", "Author event: an evening at the shop"],
    snippets: ["Three new reads we think you will love.", "Fresh off the delivery van.", "Tickets are free but limited."],
    labelIds: ["Label_newsletters"], listId: "books.tidewater.example.org", inboxFor: 30, size: 70 * KB,
  },
  {
    key: "strata", fromName: "Strata Analytics", fromAddress: "updates@strata-analytics.example.com",
    everyDays: 7, count: 18, startDaysAgo: 2.2,
    subjects: ["Your weekly dashboard digest", "Strata product update", "Webinar: dashboards that get read"],
    snippets: ["Here is how your workspace did this week.", "Five improvements shipped this month.", "Join us live on Thursday."],
    listId: "updates.strata-analytics.example.com", inboxFor: 25, unreadFor: 25, size: 60 * KB,
  },
  {
    key: "verdant", fromName: "Verdant Grocery", fromAddress: "boxes@verdantgrocery.example.com",
    everyDays: 7, count: 16, startDaysAgo: 3.5,
    subjects: ["This week’s veg box", "Seasonal recipes inside", "Add extras before Tuesday"],
    snippets: ["Squash, kale and the last of the tomatoes.", "Three dinners from one box.", "Bread and eggs are back."],
    listId: "boxes.verdantgrocery.example.com", inboxFor: 20, unreadFor: 14, size: 95 * KB,
  },
  {
    key: "pinecrest", fromName: "Pinecrest Weekly", fromAddress: "digest@pinecrestweekly.example.org",
    everyDays: 7, count: 22, startDaysAgo: 30.5,
    subjects: ["Pinecrest Weekly: the week in review", "Pinecrest Weekly: local elections special"],
    snippets: ["Your weekly round-up of local news.", "Everything you need to know before Thursday."],
    listId: "weekly.pinecrestweekly.example.org", size: 75 * KB,
  },
  {
    key: "northwind", fromName: "Northwind Weather", fromAddress: "alerts@northwindweather.example.com",
    everyDays: 3, count: 30, startDaysAgo: 1.6,
    subjects: ["Weather alert: strong winds tomorrow", "Your weekend forecast", "Frost warning overnight"],
    snippets: ["Gusts of up to 50 mph expected along the coast.", "Mostly dry with sunny spells.", "Temperatures dropping to −2°C."],
    inboxFor: 10, unreadFor: 6, size: 24 * KB,
  },
  {
    key: "cityenergy", fromName: "City Energy", fromAddress: "billing@cityenergy.example.com",
    everyDays: 30, count: 16, startDaysAgo: 32.4,
    subjects: ["Your monthly statement", "Your statement is ready"],
    snippets: ["Your monthly statement is ready.", "View your usage and bill online."],
    labelIds: ["Label_receipts"], attachmentEvery: 1, size: 210 * KB,
  },
  {
    key: "beacon", fromName: "Beacon Jobs", fromAddress: "matches@beaconjobs.example.com",
    everyDays: 5, count: 24, startDaysAgo: 5.4,
    subjects: ["12 new roles that match your profile", "A recruiter viewed your profile", "Jobs near you this week"],
    snippets: ["Senior designer, product designer and more.", "See who’s interested in your experience.", "Fresh listings within 10 miles."],
    listId: "matches.beaconjobs.example.com", inboxFor: 15, unreadFor: 15, size: 58 * KB,
  },
  {
    key: "orbital", fromName: "Orbital Games", fromAddress: "noreply@orbitalgames.example.com",
    everyDays: 10, count: 14, startDaysAgo: 15.2,
    subjects: ["Your receipt from Orbital Games", "Season pass: new levels unlocked", "Weekend double XP"],
    snippets: ["Thanks for your purchase.", "Six new levels are waiting.", "Log in Saturday and Sunday."],
    attachmentEvery: 3, size: 90 * KB,
  },
];

/** A tiny deterministic generator, so every visitor gets the same mailbox. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function demoMailboxSeeds(): DemoMessageSeed[] {
  const random = seeded(20261002);
  const messages: DemoMessageSeed[] = [...PERSONAL];

  for (const stream of STREAMS) {
    for (let i = 0; i < stream.count; i++) {
      const daysAgo = stream.startDaysAgo + i * stream.everyDays + random() * 0.8;
      const labelIds = [...(stream.labelIds ?? [])];
      if (daysAgo <= (stream.inboxFor ?? 0)) labelIds.unshift("INBOX");
      if (daysAgo <= (stream.unreadFor ?? 0)) labelIds.push("UNREAD");
      messages.push({
        id: `m-${stream.key}-${String(i + 1).padStart(2, "0")}`,
        threadId: `t-${stream.key}-${i + 1}`,
        fromName: stream.fromName,
        fromAddress: stream.fromAddress,
        to: ME,
        subject: stream.subjects[i % stream.subjects.length],
        snippet: stream.snippets[i % stream.snippets.length],
        daysAgo,
        labelIds,
        hasAttachment: stream.attachmentEvery ? i % stream.attachmentEvery === 0 : false,
        sizeBytes: Math.round(stream.size * (0.7 + random() * 0.6)),
        listId: stream.listId ?? null,
      });
    }
  }

  return messages;
}

export const DEMO_ME = { name: ME, address: ME_ADDRESS };
