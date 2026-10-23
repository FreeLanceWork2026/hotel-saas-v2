"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Search, ArrowRight } from "lucide-react";
import styles from "./Account.module.css";

export default function TrackLookup({
  label,
  placeholder,
  cta,
}: {
  label: string;
  placeholder: string;
  cta: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = value.trim().replace(/^#/, "");
    if (n) router.push(`/track/${encodeURIComponent(n)}`);
  };

  return (
    <form className={styles.lookup} onSubmit={submit}>
      <label htmlFor="track-order-input" className={styles.lookupLabel}>
        {label}
      </label>
      <div className={styles.lookupRow}>
        <Search size={16} className={styles.lookupIcon} />
        <input
          id="track-order-input"
          className={styles.lookupInput}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button type="submit" className={styles.lookupBtn} id="track-order-submit">
          {cta} <ArrowRight size={15} />
        </button>
      </div>
    </form>
  );
}
