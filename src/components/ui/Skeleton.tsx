"use client";

import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

/** Single shimmer skeleton rectangle */
export function Skeleton({ width = "100%", height = "1rem", borderRadius = "6px", className }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className ?? ""}`}
      style={{ width, height, borderRadius }}
    />
  );
}

/** Full admin-page skeleton that matches the dashboard/list layout */
export function AdminPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.header}>
        <div>
          <Skeleton width="180px" height="1.75rem" borderRadius="8px" />
          <Skeleton width="260px" height="0.875rem" borderRadius="6px" className={styles.mt} />
        </div>
        <Skeleton width="120px" height="2.5rem" borderRadius="10px" />
      </div>

      {/* Stats bar */}
      <div className={styles.statsRow}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.statCard}>
            <Skeleton width="36px" height="36px" borderRadius="10px" />
            <div style={{ flex: 1 }}>
              <Skeleton width="60px" height="0.75rem" borderRadius="4px" />
              <Skeleton width="80px" height="1.25rem" borderRadius="6px" className={styles.mt} />
            </div>
          </div>
        ))}
      </div>

      {/* Table / card rows */}
      <div className={styles.tableCard}>
        {/* Header row */}
        <div className={styles.tableHeader}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={i === 1 ? "160px" : "100px"} height="0.75rem" borderRadius="4px" />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={styles.tableRow} style={{ animationDelay: `${i * 60}ms` }}>
            <div className={styles.rowLeft}>
              <Skeleton width="40px" height="40px" borderRadius="10px" />
              <div>
                <Skeleton width="140px" height="0.875rem" borderRadius="4px" />
                <Skeleton width="80px" height="0.75rem" borderRadius="4px" className={styles.mt} />
              </div>
            </div>
            <Skeleton width="80px" height="0.875rem" borderRadius="4px" />
            <Skeleton width="60px" height="1.5rem" borderRadius="20px" />
            <Skeleton width="72px" height="2rem" borderRadius="8px" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dashboard-specific skeleton with metric cards + chart placeholder */
export function DashboardSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Skeleton width="220px" height="1.75rem" borderRadius="8px" />
          <Skeleton width="160px" height="0.875rem" borderRadius="6px" className={styles.mt} />
        </div>
      </div>

      {/* Metric cards */}
      <div className={styles.metricsRow}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.metricCard}>
            <Skeleton width="36px" height="36px" borderRadius="10px" />
            <Skeleton width="90px" height="0.75rem" borderRadius="4px" className={styles.mt} />
            <Skeleton width="120px" height="2rem" borderRadius="6px" className={styles.mt} />
          </div>
        ))}
      </div>

      {/* Recent orders list */}
      <div className={styles.tableCard}>
        <Skeleton width="180px" height="1.25rem" borderRadius="6px" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.tableRow} style={{ animationDelay: `${i * 80}ms` }}>
            <div className={styles.rowLeft}>
              <Skeleton width="40px" height="40px" borderRadius="10px" />
              <div>
                <Skeleton width="130px" height="0.875rem" borderRadius="4px" />
                <Skeleton width="80px" height="0.75rem" borderRadius="4px" className={styles.mt} />
              </div>
            </div>
            <Skeleton width="60px" height="1.5rem" borderRadius="20px" />
            <Skeleton width="80px" height="0.875rem" borderRadius="4px" />
          </div>
        ))}
      </div>
    </div>
  );
}
