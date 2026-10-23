"use client";

import { useActionState, useState } from "react";
import { Lock, LogOut, RefreshCw, Save, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { FEATURES, type FeatureGroup, type FeatureMap } from "@/lib/features";
import { ownerLogin, ownerLogout, saveFeatures } from "./actions";
import styles from "./Platform.module.css";

type Result = { ok: boolean; error?: string } | null;

const GROUPS: FeatureGroup[] = ["Hotel", "Restaurant", "Operations", "Extras"];

export default function PlatformClient({
  configured,
  features,
}: {
  configured: boolean;
  features: FeatureMap | null;
}) {
  if (!configured) {
    return (
      <div className={styles.center}>
        <div className={styles.card}>
          <Lock size={28} className={styles.lockIcon} />
          <h1 className={styles.title}>Platform Settings</h1>
          <p className={styles.sub}>
            Not configured. Set the <code>PLATFORM_OWNER_PASSWORD</code> secret (12+ characters) on this
            deployment, then reload.
          </p>
        </div>
      </div>
    );
  }
  return features ? <Switches initial={features} /> : <LoginForm />;
}

function LoginForm() {
  const [state, action, pending] = useActionState<Result, FormData>(ownerLogin, null);
  return (
    <div className={styles.center}>
      <form action={action} className={styles.card}>
        <Lock size={28} className={styles.lockIcon} />
        <h1 className={styles.title}>Platform Settings</h1>
        <p className={styles.sub}>Owner access only.</p>
        <input
          type="password"
          name="password"
          className={styles.input}
          placeholder="Owner password"
          autoComplete="current-password"
          autoFocus
          required
        />
        {state?.error && (
          <div className={`${styles.banner} ${styles.bannerError}`}>
            <AlertCircle size={16} /> {state.error}
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <RefreshCw size={16} className={styles.spin} /> : <ShieldCheck size={16} />}
          {pending ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

function Switches({ initial }: { initial: FeatureMap }) {
  const [state, action, pending] = useActionState<Result, FormData>(saveFeatures, null);
  const [values, setValues] = useState<FeatureMap>(initial);
  const dirty = FEATURES.some((f) => values[f.key] !== initial[f.key]);

  return (
    <form action={action} className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Platform Settings</h1>
          <p className={styles.sub}>
            Turn modules on or off for this client. OFF modules are hidden completely. Changes apply within ~15 seconds.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className="btn btn-outline" onClick={() => void ownerLogout()}>
            <LogOut size={16} /> Lock
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || (!dirty && !state?.error)}>
            {pending ? <RefreshCw size={16} className={styles.spin} /> : <Save size={16} />}
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {state && (
        <div className={`${styles.banner} ${state.ok ? styles.bannerOk : styles.bannerError}`}>
          {state.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {state.ok ? "Saved." : state.error}
        </div>
      )}

      {GROUPS.map((group) => (
        <section key={group} className={styles.group}>
          <h2 className={styles.groupTitle}>{group}</h2>
          {FEATURES.filter((f) => f.group === group).map((f) => (
            <label key={f.key} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>
                  {f.label}
                  {!f.defaultOn && <span className={styles.lockedTag}>locked by default</span>}
                </span>
                <span className={styles.rowDesc}>{f.description}</span>
              </span>
              <input
                type="checkbox"
                name={f.key}
                className={styles.toggle}
                checked={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
              />
            </label>
          ))}
        </section>
      ))}
    </form>
  );
}
