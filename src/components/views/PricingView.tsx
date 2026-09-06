import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import styles from "./PricingView.module.css";

// Placeholder tiers. Prices, limits and billing will be defined separately.
const PLANS = ["Starter", "Pro", "Team"];

export function PricingView() {
  return (
    <section className={styles.pricing}>
      <PageHeader title="Pricing" subtitle="Plans and prices are coming soon." />
      <div className={styles.plans}>
        {PLANS.map((name) => (
          <article className={styles.card} key={name}>
            <h2 className={styles.name}>{name}</h2>
            <p className={styles.price}>Coming soon</p>
            <p className={styles.description}>
              Pricing and included features will be announced here.
            </p>
            <Button disabled aria-label={`${name} plan coming soon`}>
              Coming soon
            </Button>
          </article>
        ))}
      </div>
      <p className={styles.note}>Paid plans are not available yet.</p>
    </section>
  );
}
