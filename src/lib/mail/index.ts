import "server-only";
import type { MailAccount } from "@/db/schema";
import type { MailProvider } from "./provider";
import { GmailProvider } from "./gmail";
import { getValidAccessToken } from "./tokens";

/**
 * Builds the right MailProvider for a connected account.
 *
 * This is the single place that maps a provider name to an implementation.
 * Adding Outlook is one new case here plus one new file.
 */
export async function getProviderForAccount(
  account: MailAccount,
): Promise<MailProvider> {
  const accessToken = await getValidAccessToken(account);

  switch (account.provider) {
    case "gmail":
      return new GmailProvider(account.email, accessToken);
    default:
      throw new Error(`No mail provider implemented for "${account.provider}"`);
  }
}

export * from "./provider";
