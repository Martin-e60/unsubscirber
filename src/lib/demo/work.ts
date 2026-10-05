import { SENDER_STATUS, UNSUBSCRIBE_METHOD } from "@/lib/constants";
import type { DemoSenderSeed } from "@/lib/demo/data";
import type { DemoMessageSeed } from "@/lib/demo/mailbox";

/**
 * The demo's second mailbox: Sam's invented work Gmail.
 *
 * Smaller than the personal one and deliberately different — other senders,
 * other decisions, other mail in Clear out — so switching mailboxes in the
 * demo visibly changes every screen. Like the rest of the demo, every name
 * and address is made up, under example.com / example.org.
 */

export const DEMO_WORK_ADDRESS = "sam@northwind.example.com";

/** Messages the simulated scan of the work mailbox reports having read. */
export const DEMO_WORK_SCAN_TOTAL = 1_260;

export const DEMO_WORK_SENDERS: DemoSenderSeed[] = [
  {
    id: "w01",
    name: "Talentpool Jobs",
    address: "alerts@talentpool.example.com",
    messageCount: 64,
    firstSeenDaysAgo: 210,
    lastSeenDaysAgo: 1,
    sampleSubject: "12 new roles that match your profile",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "w02",
    name: "Ledgerline",
    address: "product@ledgerline.example.com",
    messageCount: 48,
    firstSeenDaysAgo: 260,
    lastSeenDaysAgo: 2,
    sampleSubject: "What’s new in Ledgerline this month",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
  },
  {
    id: "w03",
    name: "Brightdesk Webinars",
    address: "events@brightdesk.example.org",
    messageCount: 36,
    firstSeenDaysAgo: 180,
    lastSeenDaysAgo: 3,
    sampleSubject: "Live Thursday: scaling support without burnout",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "SUCCESS",
  },
  {
    id: "w04",
    name: "Cloudbin",
    address: "no-reply@cloudbin.example.com",
    messageCount: 30,
    firstSeenDaysAgo: 120,
    lastSeenDaysAgo: 1,
    sampleSubject: "Weekly storage report for your workspace",
    method: null,
    outcome: "FAILED",
  },
  {
    id: "w05",
    name: "Vendorly",
    address: "offers@vendorly.example.com",
    messageCount: 27,
    firstSeenDaysAgo: 150,
    lastSeenDaysAgo: 4,
    sampleSubject: "Exclusive B2B pricing ends Friday",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "FAILED",
  },
  {
    id: "w06",
    name: "Conference Hub",
    address: "hello@conferencehub.example.org",
    messageCount: 22,
    firstSeenDaysAgo: 300,
    lastSeenDaysAgo: 6,
    sampleSubject: "Early-bird tickets for DesignOps Summit",
    method: UNSUBSCRIBE_METHOD.MAILTO,
    outcome: "SENT",
  },
  {
    id: "w07",
    name: "Figment Weekly",
    address: "digest@figment.example.com",
    messageCount: 18,
    firstSeenDaysAgo: 140,
    lastSeenDaysAgo: 5,
    sampleSubject: "Five interface patterns we keep coming back to",
    method: UNSUBSCRIBE_METHOD.HTTP,
    outcome: "MANUAL",
  },
  {
    id: "w08",
    name: "Teamtrack",
    address: "digest@teamtrack.example.com",
    messageCount: 40,
    firstSeenDaysAgo: 330,
    lastSeenDaysAgo: 1,
    sampleSubject: "Your team’s week at a glance",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    status: SENDER_STATUS.KEPT,
    decidedDaysAgo: 20,
  },
  {
    id: "w09",
    name: "Quarterly Insights",
    address: "research@quarterlyinsights.example.org",
    messageCount: 15,
    firstSeenDaysAgo: 400,
    lastSeenDaysAgo: 14,
    sampleSubject: "The Q3 benchmark report is here",
    method: UNSUBSCRIBE_METHOD.ONE_CLICK,
    oneClick: true,
    outcome: "SUCCESS",
    status: SENDER_STATUS.UNSUBSCRIBED,
    decidedDaysAgo: 12,
  },
];

const ME = "Sam Rivers";
const KB = 1024;
const MB = 1024 * 1024;

/** The work mailbox in Clear out: colleagues, tools and a few newsletters. */
export function demoWorkMailboxSeeds(): DemoMessageSeed[] {
  return [
    {
      id: "w-m-priya-1", threadId: "w-t-priya", fromName: "Priya Natarajan", fromAddress: "priya@northwind.example.com",
      to: ME, subject: "Roadmap review moved to Wednesday", snippet: "Same room, 2pm. I’ve added the draft to the shared folder.",
      daysAgo: 0.2, labelIds: ["INBOX", "UNREAD", "Label_work"], sizeBytes: 14 * KB,
    },
    {
      id: "w-m-ops-1", threadId: "w-t-ops", fromName: "Northwind IT", fromAddress: "it@northwind.example.com",
      to: ME, subject: "Laptop refresh: pick a slot", snippet: "Your new laptop is ready. Choose a 30-minute slot to swap it over.",
      daysAgo: 1.4, labelIds: ["INBOX", "Label_work"], sizeBytes: 22 * KB,
    },
    {
      id: "w-m-tom-1", threadId: "w-t-tom", fromName: "Tom Okafor", fromAddress: "tom@northwind.example.com",
      to: ME, subject: "Final deck for the client pitch", snippet: "Attached the final version with the new pricing slide.",
      daysAgo: 3.1, labelIds: ["INBOX", "Label_work"], hasAttachment: true, sizeBytes: 9.6 * MB,
    },
    {
      id: "w-m-tom-2", threadId: "w-t-tom", fromName: ME, fromAddress: DEMO_WORK_ADDRESS,
      to: "Tom Okafor", subject: "Re: Final deck for the client pitch", snippet: "Looks great. One typo on slide 7, otherwise ready to go.",
      daysAgo: 3.0, labelIds: ["SENT", "Label_work"], sizeBytes: 8 * KB,
    },
    {
      id: "w-m-cloudbin-1", threadId: "w-t-cloudbin-1", fromName: "Cloudbin", fromAddress: "no-reply@cloudbin.example.com",
      to: ME, subject: "Weekly storage report for your workspace", snippet: "Your workspace used 61% of its storage this week.",
      daysAgo: 1.1, labelIds: ["INBOX", "UNREAD"], sizeBytes: 48 * KB,
    },
    {
      id: "w-m-cloudbin-2", threadId: "w-t-cloudbin-2", fromName: "Cloudbin", fromAddress: "no-reply@cloudbin.example.com",
      to: ME, subject: "Weekly storage report for your workspace", snippet: "Your workspace used 58% of its storage this week.",
      daysAgo: 8.1, labelIds: ["INBOX"], sizeBytes: 47 * KB,
    },
    {
      id: "w-m-talent-1", threadId: "w-t-talent-1", fromName: "Talentpool Jobs", fromAddress: "alerts@talentpool.example.com",
      to: ME, subject: "12 new roles that match your profile", snippet: "Senior product designer, design systems lead and 10 more.",
      daysAgo: 1.0, labelIds: ["INBOX", "UNREAD", "Label_newsletters"], sizeBytes: 64 * KB,
      listId: "<jobs.talentpool.example.com>",
    },
    {
      id: "w-m-talent-2", threadId: "w-t-talent-2", fromName: "Talentpool Jobs", fromAddress: "alerts@talentpool.example.com",
      to: ME, subject: "9 new roles that match your profile", snippet: "Product design manager, UX researcher and 7 more.",
      daysAgo: 4.0, labelIds: ["INBOX", "Label_newsletters"], sizeBytes: 61 * KB,
      listId: "<jobs.talentpool.example.com>",
    },
    {
      id: "w-m-ledger-1", threadId: "w-t-ledger-1", fromName: "Ledgerline", fromAddress: "product@ledgerline.example.com",
      to: ME, subject: "What’s new in Ledgerline this month", snippet: "Bulk approvals, faster exports and a new mobile receipt scanner.",
      daysAgo: 2.0, labelIds: ["INBOX", "Label_newsletters"], sizeBytes: 120 * KB,
      listId: "<product.ledgerline.example.com>",
    },
    {
      id: "w-m-quarterly-1", threadId: "w-t-quarterly-1", fromName: "Quarterly Insights", fromAddress: "research@quarterlyinsights.example.org",
      to: ME, subject: "The Q3 benchmark report is here", snippet: "How 400 teams plan, ship and measure — download the full report.",
      daysAgo: 14.0, labelIds: ["Label_newsletters"], hasAttachment: true, sizeBytes: 3.2 * MB,
    },
    {
      id: "w-m-expenses-1", threadId: "w-t-expenses", fromName: "Northwind Finance", fromAddress: "finance@northwind.example.com",
      to: ME, subject: "Expense report approved", snippet: "Your September expenses were approved and will be paid on the 28th.",
      daysAgo: 19.5, labelIds: ["Label_receipts"], sizeBytes: 30 * KB,
    },
    {
      id: "w-m-offsite-1", threadId: "w-t-offsite", fromName: "Priya Natarajan", fromAddress: "priya@northwind.example.com",
      to: ME, subject: "Team offsite: travel details", snippet: "Train tickets are booked. Hotel confirmation attached.",
      daysAgo: 40.2, labelIds: ["Label_travel", "Label_work"], hasAttachment: true, sizeBytes: 420 * KB,
    },
  ];
}
