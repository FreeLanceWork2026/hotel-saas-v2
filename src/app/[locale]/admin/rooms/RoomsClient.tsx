"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Save } from "lucide-react";
import shared from "../admin.shared.module.css";
import s from "@/components/hotel/BookingBoard.module.css";
import { Drawer } from "@/components/hotel/BookingBoard";
import { useToast } from "@/components/ui/Toast";
import { compareRoomNumbers, priceUnitLabel, type Housekeeping, type Room, type RoomRate, type RoomType } from "@/lib/booking";
import { addRate, deleteRate, deleteRoom, deleteService, saveRoom, saveRoomType, saveService, type RoomInput, type RoomTypeInput } from "./actions";
import { UNIT_LABEL, type Service, type ServiceUnit } from "@/lib/folio";

const HK: { value: Housekeeping; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Needs cleaning" },
  { value: "out_of_service", label: "Out of service" },
];

const birr = (n: number) => `${n.toLocaleString()} ETB`;
const optNum = (v: string) => (v.trim() === "" ? null : Number(v));

export default function RoomsClient({ types, rates, rooms, services }: {
  types: RoomType[]; rates: RoomRate[]; rooms: Room[];
  /** undefined = events switch OFF, null = folio.sql not run */
  services?: Service[] | null;
}) {
  const [editService, setEditService] = useState<Service | "new" | null>(null);
  const [editType, setEditType] = useState<RoomType | "new" | null>(null);
  const [editRoom, setEditRoom] = useState<Room | "new" | null>(null);
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => {
      const ta = typeById.get(a.room_type_id)?.sort_order ?? 0;
      const tb = typeById.get(b.room_type_id)?.sort_order ?? 0;
      return ta - tb || compareRoomNumbers(a.number, b.number);
    }),
    [rooms, typeById]
  );
  const countBy = (typeId: string) => rooms.filter((r) => r.room_type_id === typeId && r.is_active);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section className={shared.card}>
        <div className={shared.cardHeader}>
          <h2 className={shared.cardTitle}>Room types &amp; prices</h2>
          <button type="button" className={shared.headerBtn} onClick={() => setEditType("new")}><Plus size={16} /> Add type</button>
        </div>
        <div className={shared.tableWrapper}>
          <table className={shared.table}>
            <thead>
              <tr><th>Type</th><th>Price</th><th>Rooms</th><th>Beds / capacity</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const list = countBy(t.id);
                return (
                  <tr key={t.id}>
                    <td className={shared.cellName}>{t.name}{t.name_am ? <div className={s.sub}>{t.name_am}</div> : null}</td>
                    <td>
                      {birr(t.base_price)} / {priceUnitLabel(t)}
                      {t.weekend_price !== null && <div className={s.sub}>Weekend {birr(t.weekend_price)}</div>}
                      {rates.some((r) => r.room_type_id === t.id) && <div className={s.sub}>+ seasonal prices</div>}
                    </td>
                    <td>{list.length}</td>
                    <td>
                      {t.kind === "hall"
                        ? `${t.capacity_min ?? "?"}–${t.capacity_max ?? "?"} people`
                        : `${list.reduce((n, r) => n + r.beds, 0)} beds${t.bed_width_m ? ` · ${t.bed_width_m} m` : ""}`}
                    </td>
                    <td>
                      <span className={`${shared.badge} ${t.is_active ? shared.badgeActive : shared.badgeInactive}`}>{t.is_active ? "Active" : "Hidden"}</span>
                    </td>
                    <td><button type="button" className={shared.actionBtn} onClick={() => setEditType(t)}><Pencil size={13} /> Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={shared.card}>
        <div className={shared.cardHeader}>
          <h2 className={shared.cardTitle}>Rooms &amp; halls ({rooms.length})</h2>
          <button type="button" className={shared.headerBtn} onClick={() => setEditRoom("new")} disabled={types.length === 0}><Plus size={16} /> Add room</button>
        </div>
        <div className={shared.tableWrapper}>
          <table className={shared.table}>
            <thead>
              <tr><th>No.</th><th>Type</th><th>Beds</th><th>Housekeeping</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {sortedRooms.map((r) => (
                <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                  <td className={shared.cellName}>{r.number}</td>
                  <td>{typeById.get(r.room_type_id)?.name ?? "—"}</td>
                  <td>{r.beds}</td>
                  <td><span className={`${s.hk} ${s[`hk_${r.housekeeping}`]}`} style={{ cursor: "default" }} /> {HK.find((h) => h.value === r.housekeeping)?.label}</td>
                  <td><span className={`${shared.badge} ${r.is_active ? shared.badgeActive : shared.badgeInactive}`}>{r.is_active ? "Active" : "Inactive"}</span></td>
                  <td><button type="button" className={shared.actionBtn} onClick={() => setEditRoom(r)}><Pencil size={13} /> Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {services !== undefined && (
        <section className={shared.card}>
          <div className={shared.cardHeader}>
            <h2 className={shared.cardTitle}>Event &amp; extra services</h2>
            <button type="button" className={shared.headerBtn} onClick={() => setEditService("new")} disabled={services === null}><Plus size={16} /> Add service</button>
          </div>
          {services === null ? (
            <div className={shared.cardBody}>Run <code>database/folio.sql</code> in Supabase to enable services and guest bills.</div>
          ) : (
            <div className={shared.tableWrapper}>
              <table className={shared.table}>
                <thead><tr><th>Service</th><th>Default price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {services.length === 0 && <tr><td colSpan={4} className={shared.cellEmptyRow}>No services yet.</td></tr>}
                  {services.map((x) => (
                    <tr key={x.id} style={{ opacity: x.is_active ? 1 : 0.55 }}>
                      <td className={shared.cellName}>{x.name}{x.name_am ? <div className={s.sub}>{x.name_am}</div> : null}</td>
                      <td>{birr(x.price)} {UNIT_LABEL[x.unit]}</td>
                      <td><span className={`${shared.badge} ${x.is_active ? shared.badgeActive : shared.badgeInactive}`}>{x.is_active ? "Active" : "Hidden"}</span></td>
                      <td><button type="button" className={shared.actionBtn} onClick={() => setEditService(x)}><Pencil size={13} /> Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editService && <ServiceForm service={editService === "new" ? null : editService} onClose={() => setEditService(null)} />}
      {editType && (
        <TypeForm type={editType === "new" ? null : editType} rates={rates} onClose={() => setEditType(null)} />
      )}
      {editRoom && (
        <RoomForm room={editRoom === "new" ? null : editRoom} types={types} onClose={() => setEditRoom(null)} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={shared.inputGroup}>
      <label className={shared.label}>{label}</label>
      {children}
    </div>
  );
}

function TypeForm({ type, rates, onClose }: { type: RoomType | null; rates: RoomRate[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [saving, start] = useTransition();
  const [f, setF] = useState({
    name: type?.name ?? "",
    name_am: type?.name_am ?? "",
    kind: type?.kind ?? "room",
    pricing: type?.pricing ?? "per_room",
    base_price: String(type?.base_price ?? ""),
    weekend_price: type?.weekend_price === null || type?.weekend_price === undefined ? "" : String(type.weekend_price),
    deposit_amount: type?.deposit_amount === null || type?.deposit_amount === undefined ? "" : String(type.deposit_amount),
    bed_width_m: type?.bed_width_m === null || type?.bed_width_m === undefined ? "" : String(type.bed_width_m),
    capacity_min: type?.capacity_min === null || type?.capacity_min === undefined ? "" : String(type.capacity_min),
    capacity_max: type?.capacity_max === null || type?.capacity_max === undefined ? "" : String(type.capacity_max),
    description: type?.description ?? "",
    description_am: type?.description_am ?? "",
    image_url: type?.image_url ?? "",
    sort_order: String(type?.sort_order ?? 0),
    is_active: type?.is_active ?? true,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const isHall = f.kind === "hall";

  const save = () =>
    start(async () => {
      const input: RoomTypeInput = {
        id: type?.id,
        name: f.name, name_am: f.name_am,
        kind: f.kind as RoomTypeInput["kind"], pricing: f.pricing as RoomTypeInput["pricing"],
        base_price: Number(f.base_price),
        weekend_price: optNum(f.weekend_price), deposit_amount: optNum(f.deposit_amount),
        bed_width_m: optNum(f.bed_width_m), capacity_min: optNum(f.capacity_min), capacity_max: optNum(f.capacity_max),
        description: f.description, description_am: f.description_am, image_url: f.image_url,
        sort_order: Number(f.sort_order) || 0, is_active: f.is_active,
      };
      const res = await saveRoomType(input);
      if (!res.ok) { toast.error("Could not save", res.error); return; }
      toast.success("Saved", f.name);
      router.refresh();
      onClose();
    });

  return (
    <Drawer title={type ? `Edit ${type.name}` : "New room type"} onClose={onClose}>
      <div className={s.row2}>
        <Field label="Name *"><input className={shared.input} value={f.name} onChange={set("name")} /></Field>
        <Field label="Name (Amharic)"><input className={shared.input} value={f.name_am} onChange={set("name_am")} /></Field>
      </div>
      <div className={s.row2}>
        <Field label="Kind">
          <select className={shared.select} value={f.kind} onChange={set("kind")}>
            <option value="room">Room (per night)</option>
            <option value="hall">Meeting hall (per day)</option>
          </select>
        </Field>
        <Field label="Pricing">
          <select className={shared.select} value={f.pricing} onChange={set("pricing")}>
            <option value="per_room">Flat price per {isHall ? "day" : "room"}</option>
            <option value="per_guest">Per guest (multi-bed rooms)</option>
          </select>
        </Field>
      </div>
      <div className={s.row3}>
        <Field label={`Price (ETB) *`}><input className={shared.input} type="number" min={0} value={f.base_price} onChange={set("base_price")} /></Field>
        <Field label="Weekend price"><input className={shared.input} type="number" min={0} value={f.weekend_price} onChange={set("weekend_price")} placeholder="optional" /></Field>
        <Field label="Deposit"><input className={shared.input} type="number" min={0} value={f.deposit_amount} onChange={set("deposit_amount")} placeholder="optional" /></Field>
      </div>
      {isHall ? (
        <div className={s.row2}>
          <Field label="Min people"><input className={shared.input} type="number" min={0} value={f.capacity_min} onChange={set("capacity_min")} /></Field>
          <Field label="Max people"><input className={shared.input} type="number" min={0} value={f.capacity_max} onChange={set("capacity_max")} /></Field>
        </div>
      ) : (
        <Field label="Bed width (m)"><input className={shared.input} type="number" step="0.1" min={0} value={f.bed_width_m} onChange={set("bed_width_m")} placeholder="optional" /></Field>
      )}
      <Field label="Description"><textarea className={shared.textarea} rows={2} value={f.description} onChange={set("description")} /></Field>
      <Field label="Description (Amharic)"><textarea className={shared.textarea} rows={2} value={f.description_am} onChange={set("description_am")} /></Field>
      <div className={s.row2}>
        <Field label="Photo URL"><input className={shared.input} value={f.image_url} onChange={set("image_url")} placeholder="optional" /></Field>
        <Field label="Display order"><input className={shared.input} type="number" value={f.sort_order} onChange={set("sort_order")} /></Field>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active (bookable and shown on the website)
      </label>
      <div className={s.actions}>
        <button type="button" className={shared.headerBtn} disabled={saving || !f.name.trim() || f.base_price === ""} onClick={save}>
          {saving ? <Loader2 size={16} className={s.spin} /> : <Save size={16} />} Save
        </button>
        <button type="button" className={shared.actionBtn} onClick={onClose}>Cancel</button>
      </div>

      {type && <SeasonalRates typeId={type.id} rates={rates.filter((r) => r.room_type_id === type.id)} />}
    </Drawer>
  );
}

function SeasonalRates({ typeId, rates }: { typeId: string; rates: RoomRate[] }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState({ label: "", starts_on: "", ends_on: "", price: "" });

  const add = () =>
    start(async () => {
      const res = await addRate({ room_type_id: typeId, label: r.label, starts_on: r.starts_on, ends_on: r.ends_on, price: Number(r.price) });
      if (!res.ok) { toast.error("Could not add", res.error); return; }
      setR({ label: "", starts_on: "", ends_on: "", price: "" });
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      const res = await deleteRate(id);
      if (!res.ok) toast.error("Could not delete", res.error);
      else router.refresh();
    });

  return (
    <div className={s.formBox}>
      <strong>Seasonal / holiday prices</strong>
      <div className={s.sub}>Override the price for specific dates (both days included).</div>
      {rates.map((x) => (
        <div key={x.id} className={s.actions}>
          <span style={{ flex: 1 }}>{x.label || "Special"} · {x.starts_on} → {x.ends_on} · <strong>{birr(x.price)}</strong></span>
          <button type="button" className={`${shared.actionBtn} ${shared.actionBtnDanger}`} disabled={pending} onClick={() => remove(x.id)}><Trash2 size={13} /></button>
        </div>
      ))}
      <div className={s.row2}>
        <Field label="From"><input className={shared.input} type="date" value={r.starts_on} onChange={(e) => setR({ ...r, starts_on: e.target.value })} /></Field>
        <Field label="To"><input className={shared.input} type="date" value={r.ends_on} min={r.starts_on} onChange={(e) => setR({ ...r, ends_on: e.target.value })} /></Field>
      </div>
      <div className={s.row2}>
        <Field label="Label"><input className={shared.input} value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} placeholder="e.g. Timket" /></Field>
        <Field label="Price (ETB)"><input className={shared.input} type="number" min={0} value={r.price} onChange={(e) => setR({ ...r, price: e.target.value })} /></Field>
      </div>
      <div className={s.actions}>
        <button type="button" className={shared.actionBtn} disabled={pending || !r.starts_on || !r.ends_on || r.price === ""} onClick={add}>
          <Plus size={13} /> Add price
        </button>
      </div>
    </div>
  );
}

function RoomForm({ room, types, onClose }: { room: Room | null; types: RoomType[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    number: room?.number ?? "",
    room_type_id: room?.room_type_id ?? types[0]?.id ?? "",
    beds: String(room?.beds ?? 1),
    housekeeping: room?.housekeeping ?? ("clean" as Housekeeping),
    notes: room?.notes ?? "",
    is_active: room?.is_active ?? true,
  });

  const save = () =>
    start(async () => {
      const input: RoomInput = {
        id: room?.id, number: f.number, room_type_id: f.room_type_id, beds: Math.floor(Number(f.beds)),
        housekeeping: f.housekeeping, notes: f.notes, is_active: f.is_active,
      };
      const res = await saveRoom(input);
      if (!res.ok) { toast.error("Could not save", res.error); return; }
      toast.success("Saved", `Room ${f.number}`);
      router.refresh();
      onClose();
    });

  const remove = () => {
    if (!room || !confirm(`Delete room ${room.number}?`)) return;
    start(async () => {
      const res = await deleteRoom(room.id);
      if (!res.ok) { toast.error("Could not delete", res.error); return; }
      router.refresh();
      onClose();
    });
  };

  const isHall = types.find((t) => t.id === f.room_type_id)?.kind === "hall";

  return (
    <Drawer title={room ? `Room ${room.number}` : "New room"} onClose={onClose}>
      <div className={s.row2}>
        <Field label="Number / name *"><input className={shared.input} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
        <Field label="Type">
          <select className={shared.select} value={f.room_type_id} onChange={(e) => setF({ ...f, room_type_id: e.target.value })}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <div className={s.row2}>
        {!isHall && (
          <Field label="Beds"><input className={shared.input} type="number" min={1} value={f.beds} onChange={(e) => setF({ ...f, beds: e.target.value })} /></Field>
        )}
        <Field label="Housekeeping">
          <select className={shared.select} value={f.housekeeping} onChange={(e) => setF({ ...f, housekeeping: e.target.value as Housekeeping })}>
            {HK.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea className={shared.textarea} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active (bookable)
      </label>
      <div className={s.actions}>
        <button type="button" className={shared.headerBtn} disabled={pending || !f.number.trim()} onClick={save}>
          {pending ? <Loader2 size={16} className={s.spin} /> : <Save size={16} />} Save
        </button>
        <button type="button" className={shared.actionBtn} onClick={onClose}>Cancel</button>
        {room && (
          <button type="button" className={`${shared.actionBtn} ${shared.actionBtnDanger}`} disabled={pending} onClick={remove}>
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </Drawer>
  );
}

function ServiceForm({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    name: service?.name ?? "",
    name_am: service?.name_am ?? "",
    unit: service?.unit ?? ("each" as ServiceUnit),
    price: String(service?.price ?? ""),
    sort_order: String(service?.sort_order ?? 0),
    is_active: service?.is_active ?? true,
  });

  const save = () =>
    start(async () => {
      const res = await saveService({
        id: service?.id, name: f.name, name_am: f.name_am, unit: f.unit,
        price: Number(f.price), sort_order: Number(f.sort_order) || 0, is_active: f.is_active,
      });
      if (!res.ok) { toast.error("Could not save", res.error); return; }
      toast.success("Saved", f.name);
      router.refresh();
      onClose();
    });

  const remove = () => {
    if (!service || !confirm(`Delete "${service.name}"? Past bills keep their lines.`)) return;
    start(async () => {
      const res = await deleteService(service.id);
      if (!res.ok) { toast.error("Could not delete", res.error); return; }
      router.refresh();
      onClose();
    });
  };

  return (
    <Drawer title={service ? `Edit ${service.name}` : "New service"} subtitle="The price is a default — staff can change it on each bill." onClose={onClose}>
      <div className={s.row2}>
        <Field label="Name *"><input className={shared.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Wedding package" /></Field>
        <Field label="Name (Amharic)"><input className={shared.input} value={f.name_am} onChange={(e) => setF({ ...f, name_am: e.target.value })} /></Field>
      </div>
      <div className={s.row3}>
        <Field label="Default price (ETB) *"><input className={shared.input} type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="Charged">
          <select className={shared.select} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as ServiceUnit })}>
            {(Object.keys(UNIT_LABEL) as ServiceUnit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
          </select>
        </Field>
        <Field label="Display order"><input className={shared.input} type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active (can be added to bills)
      </label>
      <div className={s.actions}>
        <button type="button" className={shared.headerBtn} disabled={pending || !f.name.trim() || f.price === ""} onClick={save}>
          {pending ? <Loader2 size={16} className={s.spin} /> : <Save size={16} />} Save
        </button>
        <button type="button" className={shared.actionBtn} onClick={onClose}>Cancel</button>
        {service && (
          <button type="button" className={`${shared.actionBtn} ${shared.actionBtnDanger}`} disabled={pending} onClick={remove}>
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </Drawer>
  );
}
