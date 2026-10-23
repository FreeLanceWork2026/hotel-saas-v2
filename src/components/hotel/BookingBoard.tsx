"use client";

// Front-desk availability calendar — rooms × days grid with booking bars.
// Used by /admin/bookings and /kiosk/rooms (same actions, staff-authorised).
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useRouter as useNextRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, Loader2, IdCard, LogIn, LogOut, Ban, Pencil, UserX } from "lucide-react";
import shared from "@/app/[locale]/admin/admin.shared.module.css";
import s from "./BookingBoard.module.css";
import { useToast } from "@/components/ui/Toast";
import { resizeImage } from "@/lib/clientImage";
import { useLocale } from "next-intl";
import FolioPanel from "./FolioPanel";
import { retainerAmount } from "@/lib/folio";
import {
  addDays, compareRoomNumbers, daysBetween, priceUnitLabel, quoteStay,
  type Booking, type Housekeeping, type Room, type RoomRate, type RoomType,
} from "@/lib/booking";
import {
  cancelBooking, checkInBooking, checkOutBooking, createBooking, findRooms, getIdPhotoUrl,
  setHousekeeping, updateBooking, type BookingInput, type RoomSuggestion,
} from "@/app/[locale]/admin/bookings/actions";

interface Props {
  types: RoomType[];
  rates: RoomRate[];
  rooms: Room[];
  bookings: Booking[];
  requests: Booking[];
  start: string;
  days: number;
  today: string;
  basePath: string;
  ready: boolean;
  /** 0 = retainer switch OFF */
  retainerPercent?: number;
}

type Sheet =
  | { mode: "new"; roomId?: string; date?: string }
  | { mode: "view"; booking: Booking }
  | { mode: "edit"; booking: Booking };

const HK_NEXT: Record<Housekeeping, Housekeeping> = { clean: "dirty", dirty: "out_of_service", out_of_service: "clean" };
const HK_LABEL: Record<Housekeeping, string> = { clean: "Clean", dirty: "Needs cleaning", out_of_service: "Out of service" };
const STATUS_LABEL: Record<string, string> = {
  requested: "Request", reserved: "Reserved", checked_in: "Checked in",
  checked_out: "Checked out", cancelled: "Cancelled", no_show: "No-show",
};

const birr = (n: number) => `${n.toLocaleString()} ETB`;
const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });

export default function BookingBoard(props: Props) {
  const { types, rooms, bookings, requests, start, days, today, basePath, ready } = props;
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [navPending, startNav] = useTransition();

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days]);

  // Grid rows: 1 = day header, then per type a heading row followed by its rooms
  const groups = useMemo(() => {
    let row = 1;
    return types
      .map((t) => ({ type: t, rooms: rooms.filter((r) => r.room_type_id === t.id).sort((a, b) => compareRoomNumbers(a.number, b.number)) }))
      .filter((g) => g.rooms.length > 0)
      .map((g) => {
        const headRow = ++row;
        return { type: g.type, headRow, rows: g.rooms.map((room) => ({ room, row: ++row })) };
      });
  }, [types, rooms]);

  const go = (d: string) => startNav(() => router.push(`${basePath}?start=${d}`));

  if (!ready) {
    return (
      <div className={shared.feedbackError}>
        Hotel tables are missing. Run <code>database/hotel.sql</code> (and optionally <code>seed_hotel_demo.sql</code>) in the Supabase SQL Editor.
      </div>
    );
  }

  // Occupancy today (for the header summary)
  const inHouse = bookings.filter((b) => b.status === "checked_in").length;
  const arriving = bookings.filter((b) => b.status === "reserved" && b.check_in === today).length;
  const departing = bookings.filter((b) => b.status === "checked_in" && b.check_out === today).length;
  const pct = props.retainerPercent ?? 0;
  const retainerPending = (b: Booking) =>
    pct > 0 && b.status === "reserved" && (b.paid ?? 0) < retainerAmount(b.total_amount, pct);

  return (
    <div className={s.board}>
      <div className={s.toolbar}>
        <div className={s.nav}>
          <button type="button" className={shared.actionBtn} onClick={() => go(addDays(start, -7))} aria-label="Previous week"><ChevronLeft size={16} /></button>
          <button type="button" className={shared.actionBtn} onClick={() => go(today)}>Today</button>
          <button type="button" className={shared.actionBtn} onClick={() => go(addDays(start, 7))} aria-label="Next week"><ChevronRight size={16} /></button>
          <input type="date" className={`${shared.input} ${s.dateInput}`} value={start} onChange={(e) => e.target.value && go(e.target.value)} />
          {navPending && <Loader2 size={16} className={s.spin} />}
        </div>
        <div className={s.stats}>
          <span><strong>{inHouse}</strong> in house</span>
          <span><strong>{arriving}</strong> arriving today</span>
          <span><strong>{departing}</strong> leaving today</span>
        </div>
        <button type="button" className={shared.headerBtn} onClick={() => setSheet({ mode: "new" })}>
          <Plus size={16} /> New booking
        </button>
      </div>

      {requests.length > 0 && (
        <div className={s.requests}>
          <div className={s.requestsTitle}>Website requests waiting for a room ({requests.length})</div>
          {requests.map((b) => (
            <div key={b.id} className={s.requestRow}>
              <span><strong>{b.guest_name}</strong> · {b.guest_phone}</span>
              <span>{typeById.get(b.room_type_id ?? "")?.name ?? "Any room"} · {b.guests} guest{b.guests > 1 ? "s" : ""}</span>
              <span>{fmtDay(b.check_in, { day: "numeric", month: "short" })} → {fmtDay(b.check_out, { day: "numeric", month: "short" })}</span>
              <button type="button" className={shared.actionBtn} onClick={() => setSheet({ mode: "edit", booking: b })}>Assign room</button>
              <CancelButton id={b.id} label="Decline" />
            </div>
          ))}
        </div>
      )}

      <div className={s.legend}>
        <span><i className={`${s.swatch} ${s.reserved}`} /> Reserved</span>
        <span><i className={`${s.swatch} ${s.checked_in}`} /> Checked in</span>
        <span><i className={`${s.swatch} ${s.checked_out}`} /> Checked out</span>
        <span><i className={`${s.hk} ${s.hk_clean}`} /> Clean</span>
        <span><i className={`${s.hk} ${s.hk_dirty}`} /> Needs cleaning</span>
        <span><i className={`${s.hk} ${s.hk_out_of_service}`} /> Out of service</span>
      </div>

      <div className={s.gridWrap}>
        <div className={s.grid} style={{ gridTemplateColumns: `minmax(118px, 140px) repeat(${days}, minmax(48px, 1fr))` }}>
          <div className={`${s.corner} ${s.sticky}`} style={{ gridRow: 1, gridColumn: 1 }}>Room</div>
          {dates.map((d, i) => (
            <div key={d} className={`${s.dayHead} ${d === today ? s.today : ""}`} style={{ gridRow: 1, gridColumn: i + 2 }}>
              <span>{fmtDay(d, { weekday: "short" })}</span>
              <strong>{fmtDay(d, { day: "numeric" })}</strong>
              <span>{fmtDay(d, { month: "short" })}</span>
            </div>
          ))}

          {groups.map(({ type, headRow, rows }) => {
            return [
              <div key={`g-${type.id}`} className={s.groupHead} style={{ gridRow: headRow, gridColumn: "1 / -1" }}>
                {type.name} · {birr(type.base_price)} / {priceUnitLabel(type)}
              </div>,
              ...rows.map(({ room, row: r }) => {
                const roomBookings = bookings.filter((b) => b.room_id === room.id);
                return [
                  <div key={`l-${room.id}`} className={`${s.roomLabel} ${s.sticky}`} style={{ gridRow: r, gridColumn: 1 }}>
                    <HousekeepingDot room={room} />
                    <span className={s.roomNo}>{room.number}</span>
                    <span className={s.roomBeds}>{type.kind === "hall" ? `${type.capacity_max ?? ""} ppl` : `${room.beds} bed${room.beds > 1 ? "s" : ""}`}</span>
                  </div>,
                  ...dates.map((d, i) => (
                    <button
                      key={`c-${room.id}-${d}`}
                      type="button"
                      className={`${s.cell} ${d === today ? s.todayCol : ""} ${room.housekeeping === "out_of_service" ? s.cellOff : ""}`}
                      style={{ gridRow: r, gridColumn: i + 2 }}
                      onClick={() => setSheet({ mode: "new", roomId: room.id, date: d })}
                      aria-label={`New booking room ${room.number} on ${d}`}
                    />
                  )),
                  ...roomBookings.map((b) => {
                    const from = Math.max(0, daysBetween(start, b.check_in));
                    const to = Math.min(days, daysBetween(start, b.check_out));
                    if (to <= from) return null;
                    return (
                      <button
                        key={`b-${b.id}`}
                        type="button"
                        className={`${s.bar} ${s[b.status] ?? ""}`}
                        style={{ gridRow: r, gridColumn: `${from + 2} / ${to + 2}` }}
                        onClick={() => setSheet({ mode: "view", booking: b })}
                        title={`${b.guest_name} · ${STATUS_LABEL[b.status]}${retainerPending(b) ? " · retainer not paid" : ""}`}
                      >
                        {retainerPending(b) && <span className={s.pendingMark}>⏳</span>}
                        {b.guest_name}{b.guests > 1 ? ` (${b.guests})` : ""}
                      </button>
                    );
                  }),
                ];
              }),
            ];
          })}
        </div>
      </div>

      {sheet?.mode === "view" && (
        <BookingDetails
          booking={sheet.booking}
          room={roomById.get(sheet.booking.room_id ?? "")}
          type={typeById.get(sheet.booking.room_type_id ?? "")}
          today={today}
          onEdit={() => setSheet({ mode: "edit", booking: sheet.booking })}
          onClose={() => setSheet(null)}
        />
      )}
      {(sheet?.mode === "new" || sheet?.mode === "edit") && (
        <BookingForm
          {...props}
          typeById={typeById}
          roomById={roomById}
          booking={sheet.mode === "edit" ? sheet.booking : undefined}
          presetRoomId={sheet.mode === "new" ? sheet.roomId : undefined}
          presetDate={sheet.mode === "new" ? sheet.date ?? today : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────

function useRefresh() {
  const router = useNextRouter();
  return () => router.refresh();
}

function HousekeepingDot({ room }: { room: Room }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const refresh = useRefresh();
  const next = HK_NEXT[room.housekeeping];
  return (
    <button
      type="button"
      className={`${s.hk} ${s[`hk_${room.housekeeping}`]} ${pending ? s.hkPending : ""}`}
      title={`${HK_LABEL[room.housekeeping]} — click to mark "${HK_LABEL[next]}"`}
      aria-label={`Housekeeping: ${HK_LABEL[room.housekeeping]}`}
      onClick={() =>
        start(async () => {
          const res = await setHousekeeping(room.id, next);
          if (!res.ok) toast.error("Could not update", res.error);
          else refresh();
        })
      }
    />
  );
}

function CancelButton({ id, label, noShow = false, onDone }: { id: string; label: string; noShow?: boolean; onDone?: () => void }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const refresh = useRefresh();
  return (
    <button
      type="button"
      className={`${shared.actionBtn} ${shared.actionBtnDanger}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(noShow ? "Mark this booking as a no-show?" : `${label} this booking?`)) return;
        start(async () => {
          const res = await cancelBooking(id, noShow);
          if (!res.ok) toast.error("Could not update", res.error);
          else { toast.success(noShow ? "Marked as no-show" : "Booking cancelled"); refresh(); onDone?.(); }
        });
      }}
    >
      {noShow ? <UserX size={13} /> : <Ban size={13} />} {label}
    </button>
  );
}

export function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={s.sheetRoot} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className={s.sheetBackdrop} onClick={onClose} aria-label="Close" />
      <div className={s.sheet}>
        <div className={s.sheetHead}>
          <div>
            <h2>{title}</h2>
            {subtitle && <div className={s.sub}>{subtitle}</div>}
          </div>
          <button type="button" className={s.sheetClose} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className={s.sheetBody}>{children}</div>
      </div>
    </div>
  );
}

// ── Booking details + check-in / check-out ───────────────────

function BookingDetails({ booking: b, room, type, today, onEdit, onClose }: {
  booking: Booking; room?: Room; type?: RoomType; today: string; onEdit: () => void; onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefresh();
  const [pending, start] = useTransition();
  const [checkingIn, setCheckingIn] = useState(false);
  const isHall = type?.kind === "hall";
  const units = daysBetween(b.check_in, b.check_out);
  const locale = useLocale();

  const doCheckOut = () =>
    start(async () => {
      const res = await checkOutBooking(b.id);
      if (!res.ok) toast.error("Could not check out", res.error);
      else { toast.success("Checked out", `Room ${room?.number} marked for cleaning`); refresh(); onClose(); }
    });

  const viewId = () =>
    start(async () => {
      const res = await getIdPhotoUrl(b.id);
      if (res.ok && res.data) window.open(res.data, "_blank", "noopener");
      else if (!res.ok) toast.error("Could not open ID photo", res.error);
    });

  return (
    <Drawer title={`${b.guest_name}`} subtitle={`${b.code} · ${STATUS_LABEL[b.status]}`} onClose={onClose}>
      <dl className={s.facts}>
        <dt>{isHall ? "Hall" : "Room"}</dt><dd>{room?.number ?? "—"} · {type?.name ?? ""}</dd>
        <dt>{isHall ? "Days" : "Stay"}</dt>
        <dd>
          {fmtDay(b.check_in, { weekday: "short", day: "numeric", month: "short" })} →{" "}
          {isHall
            ? fmtDay(addDays(b.check_out, -1), { weekday: "short", day: "numeric", month: "short" })
            : fmtDay(b.check_out, { weekday: "short", day: "numeric", month: "short" })}{" "}
          ({units} {isHall ? "day" : "night"}{units > 1 ? "s" : ""})
        </dd>
        <dt>{isHall ? "People" : "Guests"}</dt><dd>{b.guests}</dd>
        <dt>Phone</dt><dd><a href={`tel:${b.guest_phone}`}>{b.guest_phone}</a></dd>
        <dt>ID number</dt><dd>{b.guest_id_number ?? "—"}</dd>
        {b.nationality && (<><dt>Nationality</dt><dd>{b.nationality}</dd></>)}
        {b.notes && (<><dt>Notes</dt><dd>{b.notes}</dd></>)}
        <dt>Created by</dt><dd>{b.created_by ?? b.source}</dd>
      </dl>

      {checkingIn ? (
        <CheckInForm booking={b} idOptional={isHall} onDone={() => { refresh(); onClose(); }} onCancel={() => setCheckingIn(false)} />
      ) : (
        <div className={s.actions}>
          {b.status === "reserved" && (
            <button type="button" className={shared.headerBtn} onClick={() => setCheckingIn(true)}><LogIn size={16} /> Check in</button>
          )}
          {b.status === "checked_in" && (
            <button type="button" className={shared.headerBtn} disabled={pending} onClick={doCheckOut}><LogOut size={16} /> Check out</button>
          )}
          {["reserved", "checked_in"].includes(b.status) && (
            <button type="button" className={shared.actionBtn} onClick={onEdit}><Pencil size={13} /> Edit / move</button>
          )}
          {b.guest_id_photo && (
            <button type="button" className={shared.actionBtn} disabled={pending} onClick={viewId}><IdCard size={13} /> View ID photo</button>
          )}
          {b.status === "reserved" && <CancelButton id={b.id} label="Cancel" onDone={onClose} />}
          {b.status === "reserved" && b.check_in <= today && (
            <CancelButton id={b.id} label="No-show" noShow onDone={onClose} />
          )}
        </div>
      )}

      <FolioPanel bookingId={b.id} locale={locale} onChanged={refresh} />
    </Drawer>
  );
}

function CheckInForm({ booking, idOptional, onDone, onCancel }: { booking: Booking; idOptional: boolean; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [idNumber, setIdNumber] = useState(booking.guest_id_number ?? "");
  const [nationality, setNationality] = useState(booking.nationality ?? "");
  const [photo, setPhoto] = useState<File | null>(null);

  const submit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", booking.id);
      fd.set("idNumber", idNumber);
      fd.set("nationality", nationality);
      if (photo) {
        // Keep uploads small (server actions accept ~1 MB)
        const blob = await resizeImage(photo, 1400, 0.8);
        fd.set("photo", new File([blob], "id.webp", { type: blob.type || "image/webp" }));
      }
      const res = await checkInBooking(fd);
      if (!res.ok) toast.error("Could not check in", res.error);
      else { toast.success("Checked in", booking.guest_name); onDone(); }
    });

  return (
    <div className={s.formBox}>
      <div className={shared.inputGroup}>
        <label className={shared.label}>ID / passport number{idOptional ? " (optional for events)" : " *"}</label>
        <input className={shared.input} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} autoFocus />
      </div>
      <div className={shared.inputGroup}>
        <label className={shared.label}>Nationality</label>
        <input className={shared.input} value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="Ethiopian" />
      </div>
      <div className={shared.inputGroup}>
        <label className={shared.label}>Photo of ID (optional)</label>
        <input className={shared.input} type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </div>
      <div className={s.actions}>
        <button type="button" className={shared.headerBtn} disabled={pending || (!idOptional && !idNumber.trim())} onClick={submit}>
          {pending ? <Loader2 size={16} className={s.spin} /> : <LogIn size={16} />} Confirm check-in
        </button>
        <button type="button" className={shared.actionBtn} onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}

// ── New / edit booking ───────────────────────────────────────

function BookingForm({ booking, presetRoomId, presetDate, typeById, roomById, rates, today, retainerPercent: pct = 0, onClose }: Props & {
  booking?: Booking;
  presetRoomId?: string;
  presetDate?: string;
  typeById: Map<string, RoomType>;
  roomById: Map<string, Room>;
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefresh();
  const presetRoom = presetRoomId ? roomById.get(presetRoomId) : booking?.room_id ? roomById.get(booking.room_id) : undefined;
  const presetType = presetRoom ? typeById.get(presetRoom.room_type_id) : booking?.room_type_id ? typeById.get(booking.room_type_id) : undefined;

  const [kind, setKind] = useState<"room" | "hall">(presetType?.kind ?? "room");
  const [checkIn, setCheckIn] = useState(booking?.check_in ?? presetDate ?? today);
  // Halls are edited as an inclusive "last day"; rooms as the check-out date
  const initialOut = booking?.check_out ?? addDays(presetDate ?? today, 1);
  const [endDate, setEndDate] = useState(kind === "hall" ? addDays(initialOut, -1) : initialOut);
  const [guests, setGuests] = useState(booking?.guests ?? 1);
  const [roomId, setRoomId] = useState(booking?.room_id ?? presetRoomId ?? "");
  const [guestName, setGuestName] = useState(booking?.guest_name ?? "");
  const [guestPhone, setGuestPhone] = useState(booking?.guest_phone ?? "");
  const [guestIdNumber, setGuestIdNumber] = useState(booking?.guest_id_number ?? "");
  const [nationality, setNationality] = useState(booking?.nationality ?? "");
  // Money taken while booking (new bookings only; later payments go on the bill)
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "telebirr" | "cbe">("cash");
  const [payReference, setPayReference] = useState("");
  const [notes, setNotes] = useState(booking?.notes ?? "");

  const [rawOptions, setOptions] = useState<RoomSuggestion[] | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const [saving, startSave] = useTransition();

  const checkOut = kind === "hall" ? addDays(endDate, 1) : endDate;
  const datesOk = checkIn && endDate && checkOut > checkIn;

  // Live room search whenever dates / party size change
  useEffect(() => {
    if (!datesOk) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await findRooms(checkIn, checkOut, guests, booking?.id);
      if (!live) return;
      if (!res.ok) { setSearchErr(res.error); setOptions([]); return; }
      setSearchErr("");
      setOptions((res.data ?? []).filter((o) => o.kind === kind));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [checkIn, checkOut, guests, kind, datesOk, booking?.id]);

  const options = datesOk ? rawOptions : [];
  // Drop the selection if it is no longer free
  const selected = options?.find((o) => o.roomId === roomId);
  const selectedRoom = roomById.get(roomId);
  const selectedType = selectedRoom ? typeById.get(selectedRoom.room_type_id) : undefined;
  const quote = selectedType && datesOk
    ? quoteStay(selectedType, rates.filter((r) => r.room_type_id === selectedType.id), checkIn, checkOut, guests)
    : null;
  const best = options?.[0];

  const save = () =>
    startSave(async () => {
      const input: BookingInput = {
        roomId, checkIn, checkOut, guests, guestName, guestPhone, guestIdNumber, nationality, notes,
        payNow: !booking && Number(payAmount) > 0
          ? { amount: Number(payAmount), method: payMethod, reference: payReference }
          : undefined,
      };
      const res = booking ? await updateBooking(booking.id, input) : await createBooking(input);
      if (!res.ok) { toast.error("Could not save", res.error); return; }
      const warning = !booking && res.data && "warning" in res.data ? res.data.warning : undefined;
      if (warning) toast.error("Payment not recorded", warning);
      toast.success(booking ? "Booking updated" : "Booking created", guestName);
      refresh();
      onClose();
    });

  const isHall = kind === "hall";
  const unit = isHall ? "day" : "night";

  return (
    <Drawer
      title={booking ? (booking.status === "requested" ? "Assign room" : "Edit booking") : "New booking"}
      subtitle={booking?.code}
      onClose={onClose}
    >
      {!booking && (
        <div className={s.tabs}>
          <button type="button" className={`${s.tab} ${!isHall ? s.tabOn : ""}`} onClick={() => { setKind("room"); setEndDate(addDays(checkIn, 1)); setRoomId(""); }}>Room</button>
          <button type="button" className={`${s.tab} ${isHall ? s.tabOn : ""}`} onClick={() => { setKind("hall"); setEndDate(checkIn); setRoomId(""); }}>Meeting hall</button>
        </div>
      )}

      <div className={s.row2}>
        <div className={shared.inputGroup}>
          <label className={shared.label}>{isHall ? "First day" : "Check-in"}</label>
          <input type="date" className={shared.input} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </div>
        <div className={shared.inputGroup}>
          <label className={shared.label}>{isHall ? "Last day" : "Check-out"}</label>
          <input type="date" className={shared.input} value={endDate} min={isHall ? checkIn : addDays(checkIn, 1)} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className={shared.inputGroup}>
        <label className={shared.label}>{isHall ? "Number of people" : "Guests (each guest pays one bed in shared rooms)"}</label>
        <input type="number" min={1} className={shared.input} value={guests} onChange={(e) => setGuests(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
      </div>

      <div className={shared.inputGroup}>
        <label className={shared.label}>
          {isHall ? "Hall" : "Room"} {options === null ? "" : `— ${options.length} free`}
          {best && !isHall && <span className={s.hint}> · best fit: {best.number}</span>}
        </label>
        {searchErr && <div className={shared.feedbackError}>{searchErr}</div>}
        <select className={shared.select} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">Select…</option>
          {(options ?? []).map((o) => (
            <option key={o.roomId} value={o.roomId}>
              {o.number} · {o.typeName}{o.kind === "room" ? ` · ${o.beds} bed${o.beds > 1 ? "s" : ""}` : ""} · {birr(o.total)}
            </option>
          ))}
        </select>
        {roomId && options && !selected && (
          <div className={shared.feedbackError}>This {isHall ? "hall" : "room"} is not free for these dates/guests — pick another.</div>
        )}
      </div>

      {quote && (
        <div className={s.quote}>
          {quote.units} {unit}{quote.units > 1 ? "s" : ""}{quote.multiplier > 1 ? ` × ${quote.multiplier} guests` : ""} = <strong>{birr(quote.total)}</strong>
        </div>
      )}

      <div className={s.row2}>
        <div className={shared.inputGroup}>
          <label className={shared.label}>{isHall ? "Contact name *" : "Guest name *"}</label>
          <input className={shared.input} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        </div>
        <div className={shared.inputGroup}>
          <label className={shared.label}>Phone *</label>
          <input className={shared.input} type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
        </div>
      </div>
      <div className={s.row2}>
        <div className={shared.inputGroup}>
          <label className={shared.label}>ID / passport no. (required at check-in)</label>
          <input className={shared.input} value={guestIdNumber} onChange={(e) => setGuestIdNumber(e.target.value)} />
        </div>
        <div className={shared.inputGroup}>
          <label className={shared.label}>Nationality</label>
          <input className={shared.input} value={nationality} onChange={(e) => setNationality(e.target.value)} />
        </div>
      </div>

      {!booking && (
        <>
          {quote && pct > 0 && (
            <div className={s.retainerDue}>
              Retainer {pct}%: {birr(retainerAmount(quote.total, pct))} (optional — the booking is kept either way)
            </div>
          )}
          <div className={s.row3}>
            <div className={shared.inputGroup}>
              <label className={shared.label}>Payment now (optional)</label>
              <input className={shared.input} type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                placeholder={quote && pct > 0 ? String(retainerAmount(quote.total, pct)) : "0"} />
            </div>
            <div className={shared.inputGroup}>
              <label className={shared.label}>Paid by</label>
              <select className={shared.select} value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
                <option value="cash">Cash</option>
                <option value="telebirr">Telebirr</option>
                <option value="cbe">CBE Birr</option>
              </select>
            </div>
            <div className={shared.inputGroup}>
              <label className={shared.label}>Reference{payMethod !== "cash" ? " *" : ""}</label>
              <input className={shared.input} value={payReference} onChange={(e) => setPayReference(e.target.value)} />
            </div>
          </div>
        </>
      )}
      <div className={shared.inputGroup}>
        <label className={shared.label}>Notes</label>
        <textarea className={shared.textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className={s.actions}>
        <button
          type="button"
          className={shared.headerBtn}
          disabled={saving || !datesOk || !roomId || !selected || !guestName.trim() || !guestPhone.trim()}
          onClick={save}
        >
          {saving ? <Loader2 size={16} className={s.spin} /> : <CalendarDays size={16} />}
          {booking ? "Save changes" : "Create booking"}
        </button>
        <button type="button" className={shared.actionBtn} onClick={onClose}>Cancel</button>
      </div>
    </Drawer>
  );
}
