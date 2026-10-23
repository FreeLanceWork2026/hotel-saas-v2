import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BedDouble, Users, Phone } from "lucide-react";
import styles from "./Rooms.module.css";
import RequestForm from "./RequestForm";
import { getFeatures } from "@/lib/featuresServer";
import { loadBlockingBookings, loadHotelSetup } from "@/lib/bookingServer";
import { getSiteSettings } from "@/app/[locale]/admin/settings/actions";
import {
  addDays, availableRooms, hotelToday, isIsoDate, quoteStay, suggestRooms, type RoomType,
} from "@/lib/booking";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rooms" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function RoomsPage({ params, searchParams }: Props) {
  const [{ locale }, q] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "rooms" });
  const am = locale === "am";

  const today = hotelToday();
  const checkIn = q.checkIn && isIsoDate(q.checkIn) && q.checkIn >= today ? q.checkIn : today;
  const checkOut = q.checkOut && isIsoDate(q.checkOut) ? q.checkOut : addDays(checkIn, 1);
  const guests = Math.min(300, Math.max(1, Math.floor(Number(q.guests) || 1)));
  const datesOk = checkOut > checkIn;

  const [setup, features, settings] = await Promise.all([
    loadHotelSetup({ activeOnly: true }),
    getFeatures(),
    getSiteSettings(),
  ]);
  const bookings = setup.ready && datesOk ? await loadBlockingBookings(checkIn, checkOut) : [];
  const typeMap = new Map(setup.types.map((x) => [x.id, x]));
  const free = datesOk ? availableRooms(setup.rooms, bookings, checkIn, checkOut) : [];

  const card = (type: RoomType) => {
    const fits = suggestRooms(free.filter((r) => r.room_type_id === type.id), typeMap, guests);
    const quote = quoteStay(type, setup.rates.filter((r) => r.room_type_id === type.id), checkIn, checkOut, guests);
    const unit = type.kind === "hall" ? t("perDay") : type.pricing === "per_guest" ? t("perGuestNight") : t("perNight");
    const name = (am && type.name_am) || type.name;
    const desc = (am && type.description_am) || type.description;

    return (
      <article key={type.id} className={styles.card}>
        {type.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={type.image_url} alt={name} className={styles.photo} loading="lazy" />
        )}
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{name}</h3>
          {desc && <p className={styles.desc}>{desc}</p>}
          <div className={styles.meta}>
            {type.bed_width_m && <span><BedDouble size={15} /> {t("bed", { width: type.bed_width_m })}</span>}
            {type.kind === "hall" && type.capacity_max && (
              <span><Users size={15} /> {t("people", { min: type.capacity_min ?? 1, max: type.capacity_max })}</span>
            )}
          </div>
          <div className={styles.price}>
            {type.base_price.toLocaleString()} <small>ETB {unit}</small>
          </div>
          {datesOk && (
            fits.length > 0 ? (
              <div className={styles.available}>
                <span className={styles.badgeOk}>{t("available", { count: fits.length })}</span>
                <span className={styles.total}>{t("total", { amount: quote.total.toLocaleString() })}</span>
              </div>
            ) : (
              <div className={styles.badgeNo}>{t("soldOut")}</div>
            )
          )}
          {features.guest_self_booking && datesOk && fits.length > 0 && (
            <RequestForm roomTypeId={type.id} checkIn={checkIn} checkOut={checkOut} guests={guests} />
          )}
        </div>
      </article>
    );
  };

  const roomTypes = setup.types.filter((x) => x.kind === "room");
  const halls = setup.types.filter((x) => x.kind === "hall");

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>
      </header>

      <form className={styles.search} method="get">
        <label>
          <span>{t("checkIn")}</span>
          <input type="date" name="checkIn" defaultValue={checkIn} min={today} required />
        </label>
        <label>
          <span>{t("checkOut")}</span>
          <input type="date" name="checkOut" defaultValue={checkOut} min={addDays(today, 1)} required />
        </label>
        <label>
          <span>{t("guests")}</span>
          <input type="number" name="guests" defaultValue={guests} min={1} max={300} required />
        </label>
        <button type="submit" className="btn btn-primary">{t("search")}</button>
      </form>
      {!datesOk && <p className={styles.error}>{t("invalidDates")}</p>}

      {!setup.ready ? (
        <p className={styles.note}>{t("unavailable")}</p>
      ) : (
        <>
          {roomTypes.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>{t("roomsHeading")}</h2>
              <div className={styles.grid}>{roomTypes.map(card)}</div>
            </section>
          )}
          {halls.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>{t("hallsHeading")}</h2>
              <p className={styles.note}>{t("hallDays")}</p>
              <div className={styles.grid}>{halls.map(card)}</div>
            </section>
          )}
        </>
      )}

      {!features.guest_self_booking && settings.phone && (
        <div className={styles.callout}>
          <Phone size={18} />
          <span>{t("callToBook")}</span>
          <a href={`tel:${settings.phone.replace(/\s+/g, "")}`}>{settings.phone}</a>
        </div>
      )}
    </div>
  );
}
