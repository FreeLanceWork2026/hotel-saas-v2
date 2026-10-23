// Global not-found page (404)
// Placed at app/[locale]/not-found.tsx to match Next.js App Router convention
import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFoundPage() {
  return (
    <div className={styles.page}>
      {/* Ambient glow */}
      <div className={styles.glow} />

      <div className={styles.content}>
        {/* Large 404 text */}
        <div className={styles.code}>404</div>

        <div className={styles.icon}>🍽️</div>

        <h1 className={styles.title}>Page Not Found</h1>
        <p className={styles.subtitle}>
          This plate is empty — that page is not on the menu.
          <br />
          Let&apos;s get you back to something delicious.
        </p>

        <div className={styles.actions}>
          <Link href="/" className="btn btn-primary btn-lg">
            ← Back to Home
          </Link>
          <Link href="/shop" className="btn btn-outline btn-lg">
            View Menu
          </Link>
        </div>

        {/* Quick links */}
        <div className={styles.quickLinks}>
          <span className={styles.quickLinksLabel}>Or jump to:</span>
          <Link href="/shop" className={styles.quickLink}>Menu</Link>
          <span className={styles.quickLinksDot}>·</span>
          <Link href="/how-its-made" className={styles.quickLink}>Our Story</Link>
        </div>
      </div>
    </div>
  );
}
