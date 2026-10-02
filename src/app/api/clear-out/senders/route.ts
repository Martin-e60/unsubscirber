import type { NextRequest } from "next/server";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { senders } from "@/db/schema";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { SenderSuggestionDto } from "@/lib/api/types";
import { isSenderAddress } from "@/lib/clearout/filters";
import { requireRead, withOrganiser } from "@/lib/clearout/server";
import { parseFromHeader } from "@/lib/mail/headers";

/**
 * Suggestions for the By sender picker.
 *
 * Two sources, so the picker is not limited to the mailing lists Cleanup
 * found: senders a scan already knows, and — for anything typed — who
 * actually wrote matching mail, from a small Gmail search (15 messages,
 * From header only). An exact address can always be entered as typed.
 */

export const dynamic = "force-dynamic";

const GMAIL_SAMPLE = 15;

export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const account = await requireAccount(user.id);
  requireRead(account);

  // Letters, digits and address punctuation only: nothing that Gmail would
  // read as an operator.
  const term = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.@+_-]/gu, "")
    .slice(0, 80);

  // An underscore stays a one-character wildcard; harmless for a suggestion.
  const pattern = `%${term}%`;
  const known = await db
    .select({ name: senders.name, address: senders.address })
    .from(senders)
    .where(
      term
        ? and(
            eq(senders.mailAccountId, account.id),
            or(like(senders.address, pattern), like(senders.name, pattern)),
          )
        : eq(senders.mailAccountId, account.id),
    )
    .orderBy(desc(senders.lastSeenAt))
    .limit(8);

  const found: SenderSuggestionDto[] = [];
  if (term.length >= 2) {
    const metadata = await withOrganiser(account, async (organiser) => {
      const { ids } = await organiser.searchMessages({
        q: `from:${term} -in:drafts -in:chats`,
        labelIds: [],
        maxResults: GMAIL_SAMPLE,
      });
      return organiser.getMetadata(ids, ["From"]);
    });
    for (const meta of metadata) {
      if (!meta) continue;
      const parsed = parseFromHeader(meta.headers.from);
      if (parsed.address) found.push({ name: parsed.name, address: parsed.address });
    }
  }

  const seen = new Set<string>();
  const suggestions = [...known, ...found].filter((sender) => {
    const address = sender.address.toLowerCase();
    if (!isSenderAddress(address) || seen.has(address)) return false;
    seen.add(address);
    return true;
  });

  return json<SenderSuggestionDto[]>(suggestions.slice(0, 12));
});
