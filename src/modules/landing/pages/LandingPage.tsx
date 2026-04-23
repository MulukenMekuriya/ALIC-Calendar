import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import PhotoSlot from "../components/PhotoSlot";
import { useReveal } from "../components/useReveal";
import "../landing.css";

const ArrowSVG = () => (
  <svg className="arrow" viewBox="0 0 14 14" fill="none" width="14" height="14">
    <path
      d="M1 7h12M8 2l5 5-5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* ── Hero ── */
function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Ensure video plays even if autoplay is initially blocked
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
        <div className="hero__eyebrow reveal">
          <span className="eyebrow">
            <span
              style={{
                fontFamily: "var(--font-geez)",
                color: "var(--gold)",
                letterSpacing: 0,
              }}
            >
              አዲስ ልደት
            </span>
            <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
            Addis Lidet Int'l Church
          </span>
        </div>

        <h1 className="hero__title">
          <span className="mask" data-delay="1">
            <span>A new birth.</span>
          </span>
          <span className="mask hero__title-italic" data-delay="2">
            <span>
              <em>A new life.</em>
            </span>
          </span>
        </h1>

        <p className="hero__lede reveal" data-delay="3">
          Two campuses. One family. Worshipping since 2008.
        </p>

        <div className="hero__ctas reveal" data-delay="4">
          <Link to="/connect" className="btn btn--gold btn--lg">
            Plan your visit <ArrowSVG />
          </Link>
          <Link to="/sermons" className="hero__watch">
            <span className="hero__watch-icon">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <polygon points="8,5 19,12 8,19" fill="currentColor" />
              </svg>
            </span>
            Watch the latest
          </Link>
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

/* ── Live Ticker ── */
function LiveTicker() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const daysToSun = (7 - now.getDay()) % 7;
  const nextSun = new Date(now);
  nextSun.setDate(
    now.getDate() + (daysToSun === 0 && now.getHours() >= 18 ? 7 : daysToSun),
  );
  const sundayLabel =
    daysToSun === 0
      ? "This Sunday"
      : daysToSun === 1
        ? "Tomorrow"
        : nextSun.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          });

  return (
    <section className="sunday">
      <div className="container">
        <div className="sunday__rail reveal">
          <div className="sunday__lbl">
            <span className="sunday__dot" />
            {sundayLabel}
          </div>

          <div className="sunday__cols">
            <div className="sunday__col">
              <div className="sunday__campus">
                <span className="sunday__num">01</span>
                <span className="sunday__name">Maryland · Silver Spring</span>
              </div>
              <div className="sunday__times">
                <div className="sunday__time">
                  <span className="sunday__time-hr">10:00 am</span>
                  <span className="sunday__time-desc">Morning Prayer</span>
                </div>
                <div className="sunday__time">
                  <span className="sunday__time-hr">11:00 am</span>
                  <span className="sunday__time-desc">Sunday Worship</span>
                </div>
                <div className="sunday__time">
                  <span className="sunday__time-hr">6:30 pm</span>
                  <span className="sunday__time-desc">
                    <span className="sunday__badge">Young Adult</span>
                    Young Adult Service
                  </span>
                </div>
              </div>
            </div>

            <div className="sunday__divider" />

            <div className="sunday__col">
              <div className="sunday__campus">
                <span className="sunday__num">02</span>
                <span className="sunday__name">Virginia · Alexandria</span>
              </div>
              <div className="sunday__times">
                <div className="sunday__time">
                  <span className="sunday__time-hr">9:30 am</span>
                  <span className="sunday__time-desc">Morning Prayer</span>
                </div>
                <div className="sunday__time">
                  <span className="sunday__time-hr">10:30 am</span>
                  <span className="sunday__time-desc">Sunday Worship</span>
                </div>
              </div>
            </div>
          </div>

          <Link to="/locations" className="sunday__link">
            All times & directions <ArrowSVG />
          </Link>
        </div>
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

const kidsModules = import.meta.glob<string>(
  "/public/kids/*.{jpg,jpeg,png,webp}",
  { eager: true, import: "default", query: "?url" },
);
const KIDS_PHOTOS = Object.values(kidsModules);

function SundayGatherings() {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [kidsIdx, setKidsIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setPhotoIdx((i) => (i + 1) % SUNDAY_PHOTOS.length),
      4000,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(
      () => setKidsIdx((i) => (i + 1) % KIDS_PHOTOS.length),
      4000,
    );
    return () => clearInterval(t);
  }, []);

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
                className="photo-slot__img sg__slideshow-img"
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
            data-caption="Kids ministry"
          >
            {KIDS_PHOTOS.map((src, i) => (
              <img
                key={src}
                src={src}
                alt="Kids ministry"
                className="photo-slot__img sg__slideshow-img"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: i === kidsIdx ? 1 : 0,
                  transition: "opacity 1s ease",
                }}
              />
            ))}
          </div>
          <PhotoSlot
            caption="Fellowship"
            tag="Photo"
            className="sg__photo sg__photo--3"
          />
        </div>

        <div className="sg__text">
          <span className="eyebrow eyebrow--dark">On Sunday · እሁድ</span>
          <h2 className="mask" data-delay="1">
            <span>
              Sunday <em>gatherings.</em>
            </span>
          </h2>
          <p className="sg__body reveal" data-delay="2">
            Sunday is our family table. We sing in the language our parents sang
            in, we open Scripture in the language our kids think in, and we make
            room for both generations to hear the Spirit together. Everyone is
            welcome — visitor, skeptic, longtime believer, brand-new seeker.
          </p>

          <div className="sg__times reveal" data-delay="3">
            <div className="sg__time-row">
              <div className="sg__time-campus">Maryland · Silver Spring</div>
              <div className="sg__time-list">
                <div>
                  <strong>10:00 AM</strong> &nbsp;— Morning Prayer
                </div>
                <div>
                  <strong>11:00 AM</strong> &nbsp;— Sunday Worship
                </div>
                <div>
                  <strong>4:00 PM</strong> &nbsp;— TrueVine (English)
                </div>
                <div>
                  <strong>6:30 PM</strong> &nbsp;— Young Adult
                </div>
              </div>
            </div>
            <div className="sg__time-row">
              <div className="sg__time-campus">Virginia · Alexandria</div>
              <div className="sg__time-list">
                <div>
                  <strong>9:30 AM</strong> &nbsp;— Morning Prayer
                </div>
                <div>
                  <strong>10:30 AM</strong> &nbsp;— Sunday Worship
                </div>
              </div>
            </div>
          </div>

          <div className="sg__cta reveal" data-delay="4">
            <Link to="/connect" className="btn-dark-pill">
              Plan your visit <ArrowSVG />
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
      "Sat 7:00pm — Young Adults",
    ],
    caption: "04 · Eisenhower Ave · new 2026",
    photo: "/va-campus.jpg",
    badge: "New · 2026",
  },
];

function Locations() {
  return (
    <section className="locs" id="locations">
      <div className="container">
        <div className="locs__head">
          <div className="reveal">
            <span className="eyebrow">Two homes · ሁለት ቤቶች</span>
          </div>
          <h2 className="locs__title mask" data-delay="1">
            <span>
              Find your <em>nearest</em> campus.
            </span>
          </h2>
        </div>

        <div className="locs__grid">
          {LOCATIONS.map((l, i) => (
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
              <div className="loc__pastor">
                <div className="loc__pastor-avatar photo-slot photo-slot--tight">
                  <div className="photo-slot__frame" />
                </div>
                <div>
                  <div className="loc__pastor-name">{l.pastor}</div>
                  <div className="loc__pastor-title">{l.pastorTitle}</div>
                </div>
              </div>
              <div className="loc__cta">
                <span>Get directions</span>
                <ArrowSVG />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Story Strip ── */
const STORY = [
  {
    year: "2008",
    tag: "Genesis",
    title: "A small group in Washington, DC.",
    body: "Our story began in September 2008 as a small group gathering in Washington, DC — a handful of Ethiopian families meeting to pray, sing, and open Scripture in their first language.",
    caption: "01 · The first gathering, DC · 2008",
    subject: "Apartment living room · first prayer meeting",
    tint: "era-08",
  },
  {
    year: "2009",
    tag: "Ripley St",
    title: "1010 Ripley St, Silver Spring.",
    body: "We moved to 1010 Ripley St, Silver Spring, MD 20910 — a home we would stay in for over a decade. Through ups and downs, God's mercy and provision carried us.",
    caption: "02 · 1010 Ripley St, Silver Spring",
    subject: "Exterior · Ripley St sanctuary",
    tint: "era-09",
  },
  {
    year: "2014",
    tag: "Alexandria",
    title: "A second campus in Virginia.",
    body: "Weekday worship and prayer began in Arlington, VA — a humble start for members in two home cells in Alexandria. That seed has since grown into seven home cells across Virginia.",
    caption: "03 · Weekday prayer, Arlington",
    subject: "Home cell gathering · Arlington",
    tint: "era-14",
  },
  {
    year: "2021",
    tag: "Our own home",
    title: "11961 Tech Rd, Silver Spring.",
    body: "In June 2021 we purchased our own building — 11961 Tech Rd, Silver Spring, MD 20904. After thirteen years of renting, the Maryland family finally had a home of its own.",
    caption: "04 · Tech Rd building, 2021",
    subject: "Keys handover · Tech Rd",
    tint: "era-21",
  },
  {
    year: "2026",
    tag: "Today",
    title: "New home in Alexandria, VA.",
    body: "The Virginia campus moved into its own building — 2730 Eisenhower Ave, Alexandria, VA 22314. About 30 home cells in Maryland, 10 in Virginia, and a family that keeps growing.",
    caption: "05 · 2730 Eisenhower Ave, Alexandria · 2026",
    subject: "New sanctuary · Eisenhower Ave",
    tint: "era-26",
  },
];

function StoryStrip() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    function onScroll() {
      if (!ref.current) return;
      const items = ref.current.querySelectorAll(".story__item");
      const mid = window.innerHeight / 2;
      let bestIdx = 0,
        bestDist = Infinity;
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const c = r.top + r.height / 2;
        const d = Math.abs(c - mid);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      setActive(bestIdx);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="story" id="story" ref={ref}>
      <div className="container-tight">
        <div className="story__head reveal">
          <span className="eyebrow">Our story · ታሪካችን</span>
          <h2 className="story__title">
            From a <em>small group</em>
            <br /> to a family of thousands.
          </h2>
        </div>
      </div>

      <div className="story__body">
        <div className="story__photo-col">
          <div className="story__photo-stack">
            {STORY.map((s, i) => (
              <div
                key={i}
                className={`story__photo photo-slot story__photo--${s.tint} ${i === active ? "is-active" : ""}`}
                data-caption={s.caption}
                style={{
                  opacity: i === active ? 1 : 0,
                  zIndex: i === active ? 2 : 1,
                }}
              >
                <div className="photo-slot__tag">
                  {s.year} · {s.subject}
                </div>
                <div className="photo-slot__frame" />
                <div className="story__photo-subject">
                  <span className="story__photo-subject-k">Photo</span>
                  <span className="story__photo-subject-v">{s.subject}</span>
                </div>
                <div className="story__photo-overlay" />
              </div>
            ))}
            <div className="story__year-badge">
              <span className="story__year-badge-num">
                {STORY[active].year}
              </span>
              <span className="story__year-badge-tag">{STORY[active].tag}</span>
            </div>
          </div>
        </div>

        <div className="story__text-col">
          {STORY.map((s, i) => (
            <div
              key={i}
              className={`story__item ${i === active ? "is-active" : ""}`}
            >
              <div className="story__item-meta">
                <span className="story__item-year">{s.year}</span>
                <span className="story__item-bar" />
                <span className="story__item-tag">{s.tag}</span>
              </div>
              <h3 className="story__item-title">{s.title}</h3>
              <p className="story__item-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pastors ── */
function Pastors() {
  return (
    <section className="pastors">
      <div className="container">
        <div className="pastors__head reveal">
          <span className="eyebrow">Our pastors · አገልጋዮች</span>
          <h2 className="pastors__title mask" data-delay="1">
            <span>
              Shepherds for <em>both</em> homes.
            </span>
          </h2>
        </div>

        <div className="pastors__grid">
          <div className="pastor reveal" data-delay="1">
            <PhotoSlot
              caption="Pastor Mekashaw · MD"
              src="/pastor_mekashaw.jpg"
              className="pastor__photo"
            />
            <div className="pastor__meta">
              <div className="pastor__num">01 / MD</div>
              <h3 className="pastor__name">Pastor Mekashaw</h3>
              <div className="pastor__role">Lead Pastor · Maryland Campus</div>
              <p className="pastor__body">
                Pastor Mekashaw has led the Silver Spring family for over a
                decade, preaching in both Amharic and English and shepherding
                the TrueVine English gathering.
              </p>
            </div>
          </div>

          <div className="pastor reveal" data-delay="2">
            <PhotoSlot
              caption="Pastor Elias Getaneh · VA"
              src="/pastor_elias.jpg"
              className="pastor__photo"
            />
            <div className="pastor__meta">
              <div className="pastor__num">02 / VA</div>
              <h3 className="pastor__name">Pastor Elias Getaneh</h3>
              <div className="pastor__role">Lead Pastor · Virginia Campus</div>
              <p className="pastor__body">
                Pastor Elias leads our Alexandria congregation as we settle into
                our new home on Eisenhower Ave — a larger space for a
                congregation that keeps arriving and keeps staying.
              </p>
            </div>
          </div>
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
  return (
    <section className="watch" id="watch">
      <div className="container">
        <div className="watch__head">
          <div className="reveal">
            <span className="eyebrow eyebrow--gold">Watch</span>
          </div>
          <h2 className="watch__title mask" data-delay="1">
            <span>
              Every Sunday, <em>live</em>.<br />
              Every other day, <em>on demand.</em>
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
                  title={`Addis Lidet — ${ch.label}`}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
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
          <Link to="/sermons" className="btn btn--ghost btn--lg">
            Full sermon library <ArrowSVG />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Connect / Plan Visit ── */
function Connect() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Thank you — we will reach out shortly.");
  };

  return (
    <section className="connect" id="plan-visit">
      <div className="connect__bg">
        <div className="connect__orb connect__orb--1 drift-slow" />
        <div
          className="connect__orb connect__orb--2 drift-slow"
          style={{ animationDelay: "-10s" }}
        />
      </div>

      <div className="container">
        <div className="connect__grid">
          <div className="connect__lead">
            <div className="reveal">
              <span className="eyebrow eyebrow--gold">Plan your visit</span>
            </div>
            <h2 className="connect__title mask" data-delay="1">
              <span>Come as you are.</span>
            </h2>
            <h2
              className="connect__title connect__title--2 mask"
              data-delay="2"
            >
              <span>
                <em>Stay as family.</em>
              </span>
            </h2>
            <p className="connect__lede reveal" data-delay="3">
              Whether it's your first Sunday or your fiftieth, there's a seat, a
              cup of coffee, and a hand to shake. Let us know you're coming and
              we'll make sure someone finds you at the door.
            </p>
          </div>

          <form
            className="connect__form reveal"
            data-delay="2"
            onSubmit={handleSubmit}
          >
            <div className="connect__form-head">
              <span className="eyebrow eyebrow--plain eyebrow--gold">
                Let us know
              </span>
              <span className="connect__form-num">01 / 04</span>
            </div>

            <div className="connect__field">
              <label>Your name</label>
              <input type="text" placeholder="Abebe Bikila" />
            </div>

            <div className="connect__field-row">
              <div className="connect__field">
                <label>Email</label>
                <input type="email" placeholder="you@example.com" />
              </div>
              <div className="connect__field">
                <label>Campus</label>
                <select defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  <option>Maryland — Silver Spring</option>
                  <option>Virginia — Alexandria</option>
                  <option>Either / online</option>
                </select>
              </div>
            </div>

            <div className="connect__field">
              <label>When are you thinking of visiting?</label>
              <div className="connect__chips">
                {[
                  "This Sunday",
                  "Next Sunday",
                  "Within a month",
                  "Just exploring",
                ].map((c) => (
                  <label key={c} className="connect__chip">
                    <input type="radio" name="when" />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--gold btn--lg connect__submit"
            >
              Save my seat <ArrowSVG />
            </button>

            <p className="connect__fine">
              Prefer to just show up? That's welcome too.{" "}
              <Link to="/locations"> See service times →</Link>
            </p>
          </form>
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
      <Hero />
      <SundayGatherings />
      <Locations />
      <LiveTicker />
      <StoryStrip />
      <Pastors />
      <Watch />
      <Connect />
      <LandingFooter />
    </div>
  );
}
