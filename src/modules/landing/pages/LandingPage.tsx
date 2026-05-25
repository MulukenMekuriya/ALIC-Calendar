import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import PhotoSlot from "../components/PhotoSlot";
import ArrowIcon from "../components/ArrowIcon";
import { useReveal } from "../components/useReveal";
import { useSlideshow } from "../components/useSlideshow";
import { useI18n } from "../components/useI18n";
import "../landing.css";

/* ── Hero ── */
function Hero() {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.play().catch(() => {});
    }
  }, []);

  return (
    <section className="hero">
      <div className="hero__video-wrap">
        <video
          ref={videoRef}
          className="hero__video"
          src="/addis lidet video.mp4"
          poster="/md-campus.jpg"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
        <div className="hero__vignette" />
        <div className="hero__warm ambient-pan" />
        <div className="hero__grain" />
      </div>

      <div className="container hero__inner">
        <h1 className="hero__title">
          <span className="mask hero__title-welcome" data-delay="2">
            <span>{t("hero.title.1")}</span>
          </span>
          <span className="mask hero__title-name" data-delay="3">
            <span>{t("hero.title.2a")}</span>
          </span>
          <span className="mask hero__title-name" data-delay="4">
            <span>{t("hero.title.2b")}</span>
          </span>
        </h1>

        <p className="hero__lede reveal" data-delay="5">
          {t("hero.lede")}
        </p>

        <div className="hero__ctas reveal" data-delay="5">
          <Link to="/connect#form" className="btn btn--gold btn--lg">
            {t("hero.cta")} <ArrowIcon />
          </Link>
          <a
            href="#watch"
            className="hero__watch"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("watch")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="hero__watch-icon">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <polygon points="8,5 19,12 8,19" fill="currentColor" />
              </svg>
            </span>
            {t("hero.watch")}
          </a>
        </div>
      </div>

      <div className="hero__tibeb">
        <div className="tibeb" />
      </div>
      <div className="hero__scroll">
        <span className="hero__scroll-line" />
      </div>
    </section>
  );
}

/* ── Sunday Gatherings ── */
const sundayModules = import.meta.glob<string>(
  "/public/sunday-worship/*.{jpg,jpeg,png,webp}",
  { eager: true, import: "default", query: "?url" },
);
const SUNDAY_PHOTOS = Object.values(sundayModules);

const childrenModules = import.meta.glob<string>(
  "/public/children/*.{jpg,jpeg,png,webp}",
  { eager: true, import: "default", query: "?url" },
);
const CHILDREN_PHOTOS = Object.values(childrenModules);

const yaModules = import.meta.glob<string>(
  "/public/young-adults/*.{jpg,jpeg,png,webp}",
  { eager: true, import: "default", query: "?url" },
);
const YA_PHOTOS = Object.values(yaModules);

function SundayGatherings() {
  const { t } = useI18n();
  const photoIdx = useSlideshow(SUNDAY_PHOTOS.length);
  const childrenIdx = useSlideshow(CHILDREN_PHOTOS.length);
  const yaIdx = useSlideshow(YA_PHOTOS.length);

  return (
    <section className="sg">
      <div className="container sg__inner">
        <div className="sg__photos reveal">
          <div
            className="photo-slot sg__photo sg__photo--1"
            data-caption="Worship · Sunday morning"
          >
            {SUNDAY_PHOTOS.map((src, i) => (
              <img
                key={src}
                src={src}
                alt="Sunday worship"
                className="photo-slot__img sg__slideshow-img" loading="lazy"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: i === photoIdx ? 1 : 0,
                  transition: "opacity 1s ease",
                }}
              />
            ))}
          </div>
          <div
            className="photo-slot sg__photo sg__photo--2"
            data-caption="Children ministry"
          >
            {CHILDREN_PHOTOS.map((src, i) => (
              <img
                key={src}
                src={src}
                alt="Children ministry"
                className="photo-slot__img sg__slideshow-img" loading="lazy"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: i === childrenIdx ? 1 : 0,
                  transition: "opacity 1s ease",
                }}
              />
            ))}
          </div>
          <div
            className="photo-slot sg__photo sg__photo--3"
            data-caption="Young Adults Ministry"
          >
            {YA_PHOTOS.map((src, i) => (
              <img
                key={src}
                src={src}
                alt="Young Adults Ministry"
                className="photo-slot__img sg__slideshow-img" loading="lazy"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: i === yaIdx ? 1 : 0,
                  transition: "opacity 1s ease",
                }}
              />
            ))}
          </div>
        </div>

        <div className="sg__text">
          <span className="eyebrow eyebrow--dark">{t("sg.eyebrow")}</span>
          <p className="sg__body reveal" data-delay="2">
            {t("sg.body")}
          </p>

          <div className="sg__campuses reveal" data-delay="3">
            <article className="sg__campus">
              <header className="sg__campus-head">
                <span className="sg__campus-region">Maryland</span>
                <h3 className="sg__campus-city">Silver Spring</h3>
                <a
                  href="https://maps.apple.com/?q=11961+Tech+Rd+Silver+Spring+MD+20904"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sg__campus-addr"
                >
                  11961 Tech Rd <ArrowIcon />
                </a>
              </header>
              <ul className="sg__schedule">
                <li className="sg__schedule-row sg__schedule-row--primary">
                  <span className="sg__schedule-time">11:00 AM</span>
                  <span className="sg__schedule-label">Sunday Worship</span>
                </li>
                <li className="sg__schedule-row">
                  <span className="sg__schedule-time">10:00 AM</span>
                  <span className="sg__schedule-label">Morning Prayer</span>
                </li>
                <li className="sg__schedule-row">
                  <span className="sg__schedule-time">4:00 PM</span>
                  <span className="sg__schedule-label">TrueVine (English)</span>
                </li>
                <li className="sg__schedule-row">
                  <span className="sg__schedule-time">6:30 PM</span>
                  <span className="sg__schedule-label">Young Adult</span>
                </li>
              </ul>
              <Link to="/locations#md" className="sg__campus-link">
                Campus details <ArrowIcon />
              </Link>
            </article>

            <article className="sg__campus">
              <header className="sg__campus-head">
                <div className="sg__campus-region-row">
                  <span className="sg__campus-region">Virginia</span>
                  <span className="sg__campus-badge">New · 2026</span>
                </div>
                <h3 className="sg__campus-city">Alexandria</h3>
                <a
                  href="https://maps.apple.com/?q=2730+Eisenhower+Ave+Alexandria+VA+22314"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sg__campus-addr"
                >
                  2730 Eisenhower Ave <ArrowIcon />
                </a>
              </header>
              <ul className="sg__schedule">
                <li className="sg__schedule-row sg__schedule-row--primary">
                  <span className="sg__schedule-time">10:30 AM</span>
                  <span className="sg__schedule-label">Sunday Worship</span>
                </li>
                <li className="sg__schedule-row">
                  <span className="sg__schedule-time">9:30 AM</span>
                  <span className="sg__schedule-label">Morning Prayer</span>
                </li>
                <li className="sg__schedule-row">
                  <span className="sg__schedule-time">7:00 PM</span>
                  <span className="sg__schedule-label">Young Adults</span>
                </li>
              </ul>
              <Link to="/locations#va" className="sg__campus-link">
                Campus details <ArrowIcon />
              </Link>
            </article>
          </div>

          <div className="sg__cta reveal" data-delay="4">
            <Link to="/locations" className="btn-dark-pill">
              Plan your visit <ArrowIcon />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Locations ── */
const LOCATIONS = [
  {
    key: "md",
    name: "Maryland",
    city: "Silver Spring, MD",
    address: "11961 Tech Rd",
    zip: "Silver Spring, MD 20904",
    pastor: "Pastor Mekashaw Shimelash",
    pastorTitle: "Lead Pastor, MD Campus",
    services: [
      "Sun 10:00am — Morning Prayer",
      "Sun 11:00am — Sunday Worship",
      "Sun 6:30pm — Young Adult",
      "Wed 6:30pm — Midweek Service",
      "Thu 10:00am — Prayer",
      "Fri 8:30pm — Overnight Prayer",
    ],
    caption: "03 · Silver Spring sanctuary",
    photo: "/md-campus.jpg",
    badge: null,
  },
  {
    key: "va",
    name: "Virginia",
    city: "Alexandria, VA",
    address: "2730 Eisenhower Ave",
    zip: "Alexandria, VA 22314",
    pastor: "Pastor Elias Getaneh",
    pastorTitle: "Lead Pastor, VA Campus",
    services: [
      "Sun 9:30am — Morning Prayer",
      "Sun 10:30am — Sunday Worship",
      "Tue 7:00pm — Bible Study",
      "Fri 7:00pm — Prayer Night",
      "Sun 7:00pm — Young Adults",
    ],
    caption: "04 · Eisenhower Ave · new 2026",
    photo: "/va-campus.jpg",
    badge: "New · 2026",
  },
];

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Locations() {
  const { t } = useI18n();
  const locations = useMemo(() => shuffle(LOCATIONS), []);
  return (
    <section className="locs" id="locations">
      <div className="container">
        <div className="locs__head">
          <div className="reveal">
            <span className="eyebrow">{t("locs.eyebrow")}</span>
          </div>
          <h2 className="locs__title mask" data-delay="1">
            <span>
              Find your <em>nearest</em> campus.
            </span>
          </h2>
        </div>

        <div className="locs__grid">
          {locations.map((l, i) => (
            <Link
              key={l.key}
              to="/locations"
              className="loc reveal"
              data-delay={i + 1}
            >
              {l.badge && <div className="loc__badge">{l.badge}</div>}
              <PhotoSlot
                caption={l.caption}
                src={l.photo || undefined}
                tag="Photo"
                className="loc__photo"
              />
              <div className="loc__meta">
                <div className="loc__info">
                  <div className="loc__name">{l.name}</div>
                  <div className="loc__city">{l.city}</div>
                </div>
              </div>
              <div className="loc__addr">
                <div className="loc__addr-1">{l.address}</div>
                <div className="loc__addr-2">{l.zip}</div>
              </div>
              <div className="loc__services">
                {l.services.map((s, j) => (
                  <div key={j} className="loc__service">
                    {s}
                  </div>
                ))}
              </div>
              <div className="loc__cta">
                <span>Plan your visit</span>
                <ArrowIcon />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Watch / Sermons ── */
const WATCH_CHANNELS = [
  {
    key: "md",
    label: "Silver Spring, MD",
    handle: "@addislidetmedia",
    channelId: "UC0a-B295i9i-wTezQ4G-M3w",
    url: "https://www.youtube.com/@addislidetmedia",
  },
  {
    key: "va",
    label: "Alexandria, VA",
    handle: "@AddisLidetVirginia",
    channelId: "UC9wD2V5iETIWes24ZJv6OsA",
    url: "https://www.youtube.com/@AddisLidetVirginia",
  },
];

function Watch() {
  const { t } = useI18n();
  return (
    <section className="watch" id="watch">
      <div className="container">
        <div className="watch__head">
          <div className="reveal">
            <span className="eyebrow eyebrow--gold">{t("watch.eyebrow")}</span>
          </div>
          <h2 className="watch__title mask" data-delay="1">
            <span>
              Watch <em>live</em> transmission.
            </span>
          </h2>
        </div>

        <div className="watch__channels reveal" data-delay="2">
          {WATCH_CHANNELS.map((ch) => (
            <div key={ch.key} className="watch__channel">
              <div className="watch__channel-meta">
                <span className="watch__channel-label">{ch.label}</span>
                <a
                  href={ch.url}
                  target="_blank"
                  rel="noreferrer"
                  className="watch__channel-handle"
                >
                  {ch.handle} ↗
                </a>
              </div>
              <div className="watch__embed">
                <iframe
                  src={`https://www.youtube.com/embed?listType=playlist&list=${ch.channelId.replace("UC", "UU")}&index=1`}
                  title={`Addis Lidet latest service — ${ch.label}`}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
              <div className="watch__channel-links">
                <a
                  href={ch.url}
                  target="_blank"
                  rel="noreferrer"
                  className="watch__channel-link"
                >
                  → Full archive
                </a>
                <a
                  href={`${ch.url}/streams`}
                  target="_blank"
                  rel="noreferrer"
                  className="watch__channel-link"
                >
                  → Live streams
                </a>
                <a
                  href={`${ch.url}/playlists`}
                  target="_blank"
                  rel="noreferrer"
                  className="watch__channel-link"
                >
                  → Sermon series
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="watch__foot reveal" data-delay="3">
          <Link to="/locations" className="btn btn--ghost btn--lg">
            {t("watch.fullLibrary")} <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Page ── */
export default function LandingPage() {
  useReveal();

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#0a0b0a";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  return (
    <div className="landing-root">
      <LandingNav />
      <main id="main-content">
      <Hero />
      <SundayGatherings />
      <Locations />
      <Watch />
      </main>
      <LandingFooter />
    </div>
  );
}
