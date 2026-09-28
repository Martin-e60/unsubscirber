import { permanentRedirect } from "next/navigation";

/**
 * There is no pricing.
 *
 * This used to be a placeholder for plans that were never going to exist.
 * Tidely is free, so the URL has nothing of its own to show. A permanent
 * redirect to the landing page keeps any existing link working.
 */
export default function PricingPage() {
  permanentRedirect("/");
}
