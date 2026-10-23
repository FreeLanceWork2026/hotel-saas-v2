"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./FaqAccordion.module.css";

interface FaqItem {
  q: string;
  a: string;
}

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <div className={styles.accordion}>
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={i} className={`card ${styles.item}`}>
            <button
              className={styles.question}
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
            >
              <span>{item.q}</span>
              <ChevronDown
                size={20}
                className={`${styles.icon} ${isOpen ? styles.iconOpen : ""}`}
              />
            </button>
            <div
              className={`${styles.answerWrap} ${
                isOpen ? styles.answerOpen : ""
              }`}
            >
              <div className={styles.answerInner}>
                <p className="text-muted">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
