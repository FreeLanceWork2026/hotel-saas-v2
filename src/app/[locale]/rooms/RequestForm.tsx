"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./Rooms.module.css";

/** Guest booking request (only rendered when "Guest self-booking" is ON). Staff confirm by assigning a room. */
export default function RequestForm({ roomTypeId, checkIn, checkOut, guests }: {
  roomTypeId: string; checkIn: string; checkOut: string; guests: number;
}) {
  const t = useTranslations("rooms");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  if (state === "sent") return <p className={styles.badgeOk}>{t("sent")}</p>;
  if (!open) {
    return <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>{t("request")}</button>;
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/bookings/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomTypeId, checkIn, checkOut, guests,
          name: fd.get("name"), phone: fd.get("phone"), website: fd.get("website"),
        }),
      });
      setState(res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <form className={styles.requestForm} onSubmit={submit}>
      <input name="name" placeholder={t("name")} required maxLength={80} autoComplete="name" />
      <input name="phone" type="tel" placeholder={t("phone")} required maxLength={20} autoComplete="tel" />
      {/* Honeypot: bots fill this, people never see it */}
      <input name="website" tabIndex={-1} autoComplete="off" className={styles.hp} aria-hidden="true" />
      <button type="submit" className="btn btn-primary btn-sm" disabled={state === "sending"}>
        {state === "sending" ? t("sending") : t("send")}
      </button>
      {state === "failed" && <p className={styles.error}>{t("failed")}</p>}
    </form>
  );
}
