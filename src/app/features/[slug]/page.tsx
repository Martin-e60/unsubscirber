import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { FEATURES } from "@/lib/features";
import styles from "./page.module.css";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FEATURES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feature = FEATURES.find((item) => item.slug === slug);
  return { title: feature ? `${feature.name} | Tidely` : "Feature not found | Tidely" };
}

export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  const feature = FEATURES.find((item) => item.slug === slug);
  if (!feature) notFound();

  return (
    <div className={styles.page}>
      <PublicHeader />
      <main className={styles.content}>
        <h1>{feature.name}</h1>
        <p className={styles.description}>{feature.description}</p>
        {feature.details.map((text) => <p key={text}>{text}</p>)}
        <Link href="/register" className={styles.cta}>Get started with Tidely</Link>
      </main>
    </div>
  );
}
