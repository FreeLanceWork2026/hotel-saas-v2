"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { updateSiteSettings, type SiteSettings } from "./actions";
import styles from "./Settings.module.css";
import { useFeature } from "@/context/FeaturesContext";
import { Save, Upload, RefreshCw, CheckCircle2, AlertCircle, Palette, Globe, Phone, Clock, Image as ImageIcon, Type } from "lucide-react";

interface Props {
  initial: SiteSettings;
  locale: string;
}

type State = { ok: boolean; error?: string } | null;

export default function SettingsClient({ initial, locale }: Props) {
  const hasRetainer = useFeature("retainer");
  const [state, action, isPending] = useActionState<State, FormData>(
    updateSiteSettings,
    null
  );
  const [logoPreview, setLogoPreview] = useState(initial.logo_url || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await fetch("/api/admin/product-image", {
        method: "POST",
        headers: { "x-filename": file.name },
        body: file,
      });
      const json = await res.json() as { url?: string; error?: string };
      if (json.url) setLogoPreview(json.url);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form action={action} className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Site Settings</h1>
          <p className={styles.pageSub}>
            Change your brand name, logo, colours, and contact details — no code needed.
          </p>
        </div>
        <button
          type="submit"
          className={`btn btn-primary ${styles.saveBtn}`}
          disabled={isPending}
        >
          {isPending ? <RefreshCw size={16} className={styles.spin} /> : <Save size={16} />}
          {isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Status banner */}
      {state?.ok && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          <CheckCircle2 size={16} /> Changes saved successfully!
        </div>
      )}
      {state?.error && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <AlertCircle size={16} /> {state.error}
        </div>
      )}

      <div className={styles.grid}>

        {/* ── Branding ─────────────────────────────────── */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Type size={16} />
            <h2 className={styles.cardTitle}>Brand Identity</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="brand_name">Brand Name</label>
            <input
              id="brand_name"
              name="brand_name"
              className={styles.input}
              defaultValue={initial.brand_name}
              placeholder="My Restaurant"
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="brand_tagline">Tagline</label>
            <input
              id="brand_tagline"
              name="brand_tagline"
              className={styles.input}
              defaultValue={initial.brand_tagline}
              placeholder="Fresh Food. Real Flavour."
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="brand_icon">Brand Emoji / Icon</label>
            <input
              id="brand_icon"
              name="brand_icon"
              className={styles.input}
              defaultValue={initial.brand_icon}
              placeholder="🍽️"
              maxLength={4}
            />
            <p className={styles.hint}>Used in the kiosk top bar and admin sidebar. Paste any emoji.</p>
          </div>
        </section>

        {/* ── Logo ─────────────────────────────────────── */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <ImageIcon size={16} />
            <h2 className={styles.cardTitle}>Logo</h2>
          </div>

          <input type="hidden" name="logo_url" value={logoPreview} />

          <div className={styles.logoArea}>
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo preview" className={styles.logoPreview} />
            ) : (
              <div className={styles.logoPlaceholder}>No logo uploaded</div>
            )}
          </div>

          <div className={styles.logoActions}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? <><RefreshCw size={14} className={styles.spin} /> Uploading…</>
                : <><Upload size={14} /> Upload Logo</>
              }
            </button>
            {logoPreview && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setLogoPreview("")}
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={handleLogoUpload}
          />
          <p className={styles.hint}>PNG or SVG recommended. Max 2MB.</p>
        </section>

        {/* ── Hero Text ─────────────────────────────────── */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Globe size={16} />
            <h2 className={styles.cardTitle}>Homepage Hero</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="hero_title">Hero Title</label>
            <textarea
              id="hero_title"
              name="hero_title"
              className={`${styles.input} ${styles.textarea}`}
              defaultValue={initial.hero_title}
              rows={2}
              placeholder="Welcome to Our Restaurant"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="hero_subtitle">Hero Subtitle</label>
            <textarea
              id="hero_subtitle"
              name="hero_subtitle"
              className={`${styles.input} ${styles.textarea}`}
              defaultValue={initial.hero_subtitle}
              rows={3}
              placeholder="Fresh food made to order…"
            />
          </div>
        </section>

        {/* ── Contact ────────────────────────────────────── */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Phone size={16} />
            <h2 className={styles.cardTitle}>Contact & Location</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="address">Address</label>
            <input id="address" name="address" className={styles.input} defaultValue={initial.address} placeholder="123 Main St, Addis Ababa" />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className={styles.input} defaultValue={initial.phone} placeholder="+251 91 234 5678" />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="whatsapp">WhatsApp Number</label>
            <input id="whatsapp" name="whatsapp" className={styles.input} defaultValue={initial.whatsapp} placeholder="+251912345678" />
            <p className={styles.hint}>Include country code, no spaces or dashes.</p>
          </div>
        </section>

        {/* ── Hours ────────────────────────────────────────── */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Clock size={16} />
            <h2 className={styles.cardTitle}>Business Hours</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="business_hours">Hours</label>
            <input id="business_hours" name="business_hours" className={styles.input} defaultValue={initial.business_hours} placeholder="Mon–Sat: 8AM – 8PM" />
          </div>
        </section>

        {/* ── Reservation retainer (only when switched on in Platform Settings) ── */}
        {hasRetainer ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Clock size={16} />
              <h2 className={styles.cardTitle}>Reservation Retainer</h2>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="retainer_percent">Retainer % of the room / hall price</label>
              <select id="retainer_percent" name="retainer_percent" className={styles.input} defaultValue={initial.retainer_percent}>
                {["10", "20", "25", "30", "50", "75", "100"].map((p) => <option key={p} value={p}>{p}%</option>)}
              </select>
            </div>
          </section>
        ) : (
          <input type="hidden" name="retainer_percent" value={initial.retainer_percent} />
        )}

        {/* ── Social ───────────────────────────────────────── */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Globe size={16} />
            <h2 className={styles.cardTitle}>Social Media Links</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="facebook_url">Facebook URL</label>
            <input id="facebook_url" name="facebook_url" className={styles.input} defaultValue={initial.facebook_url} placeholder="https://facebook.com/yourbusiness" type="url" />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="instagram_url">Instagram URL</label>
            <input id="instagram_url" name="instagram_url" className={styles.input} defaultValue={initial.instagram_url} placeholder="https://instagram.com/yourbusiness" type="url" />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="telegram_url">Telegram Link</label>
            <input id="telegram_url" name="telegram_url" className={styles.input} defaultValue={initial.telegram_url} placeholder="https://t.me/yourbusiness" type="url" />
          </div>
        </section>

        {/* ── Brand Colour ─────────────────────────────────── */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Palette size={16} />
            <h2 className={styles.cardTitle}>Brand Colour</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="primary_color">Primary Colour</label>
            <div className={styles.colorRow}>
              <input id="primary_color_picker" type="color" className={styles.colorPicker}
                defaultValue={initial.primary_color}
                onChange={(e) => {
                  const inp = document.getElementById("primary_color") as HTMLInputElement;
                  if (inp) inp.value = e.target.value;
                }}
              />
              <input id="primary_color" name="primary_color" className={styles.input}
                defaultValue={initial.primary_color}
                placeholder="#d94f28"
                pattern="^#[0-9a-fA-F]{6}$"
                onChange={(e) => {
                  const picker = document.getElementById("primary_color_picker") as HTMLInputElement;
                  if (picker && /^#[0-9a-fA-F]{6}$/.test(e.target.value)) picker.value = e.target.value;
                }}
              />
            </div>
            <p className={styles.hint}>6-digit hex colour used across buttons and accents. Changes apply after save + page reload.</p>
          </div>
        </section>

      </div>

      {/* Bottom save */}
      <div className={styles.bottomBar}>
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? <RefreshCw size={16} className={styles.spin} /> : <Save size={16} />}
          {isPending ? "Saving…" : "Save All Changes"}
        </button>
      </div>
    </form>
  );
}
