import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import PhotoSlot from "../components/PhotoSlot";
import ArrowIcon from "../components/ArrowIcon";
import "../landing.css";

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function useHashScroll() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    requestAnimationFrame(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [hash]);
}

const CAMPUSES = [
  {
    id: "md",
    name: "Silver Spring",
    state: "Maryland",
    addr: "11961 Tech Rd",
    city: "Silver Spring, MD 20904",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=11961+Tech+Rd+Silver+Spring+MD+20904",
    mapsEmbed:
      "https://www.google.com/maps?q=11961+Tech+Rd+Silver+Spring+MD+20904&output=embed",
    pastor: "Pastor Mekashaw Shimelash",
    role: "Lead Pastor",
    yt: "https://www.youtube.com/@addislidetmedia",
    fb: "https://www.facebook.com/AddisLedet/",
    photo: "/md-campus.jpg",
    channelId: "UC0a-B295i9i-wTezQ4G-M3w",
    yaYt: "https://www.youtube.com/@addislidetyoungadultminist6291",
    yaChannelId: "UCnIYfT518KOxn4KZTZLxwng",
    tagline: "Our founding home — where the family first gathered.",
    since: "Since 2009",
    rhythm: [
      {
        day: "Sunday",
        items: [
          ["Morning Prayer", "10:00a–11:00a"],
          ["Sunday Worship", "11:00a–1:30p"],
          ["Young Adult", "6:30p–9:00p"],
        ],
      },
      { day: "Wednesday", items: [["Midweek Service", "6:30p–9:00p"]] },
      { day: "Thursday", items: [["Thursday Prayer", "10:00a–2:00p"]] },
      { day: "Friday", items: [["Overnight Prayer", "8:30p–12:30a"]] },
    ],
  },
  {
    id: "va",
    name: "Alexandria",
    state: "Virginia",
    addr: "2730 Eisenhower Ave",
    city: "Alexandria, VA 22314",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=2730+Eisenhower+Ave+Alexandria+VA+22314",
    mapsEmbed:
      "https://www.google.com/maps?q=2730+Eisenhower+Ave+Alexandria+VA+22314&output=embed",
    pastor: "Pastor Elias Getaneh",
    role: "Lead Pastor",
    yt: "https://www.youtube.com/@AddisLidetVirginia",
    fb: "https://www.facebook.com/profile.php?id=100007033008234",
    photo: "/va-campus.jpg",
    channelId: "UC9wD2V5iETIWes24ZJv6OsA",
    tagline: "A new home on Eisenhower Avenue — the family across the Potomac.",
    since: "Since 2014 · New home 2026",
    rhythm: [
      {
        day: "Sunday",
        items: [
          ["Morning Prayer", "9:30a–10:30a"],
          ["Sunday Worship", "10:30a–1:00p"],
          ["Young Adults", "7:00p–9:00p"],
        ],
      },
      { day: "Tuesday", items: [["Midweek Service", "7:00p–9:00p"]] },
      { day: "Friday", items: [["Prayer Night", "7:00p–11:00p"]] },
    ],
  },
];

function LocHero() {
  return (
    <section className="loc-hero">
      <div className="container-wide">
        <div className="eyebrow" style={{ marginBottom: 36 }}>
          Locations · አድራሻ
        </div>
        <div className="loc-hero__foot">
          <p className="loc-hero__lede">
            Whichever campus you call home, the welcome is the same. Plan your
            visit, find service times, or stream from anywhere.
          </p>
          <nav className="loc-hero__jump">
            {CAMPUSES.map((c) => (
              <a key={c.id} href={`#${c.id}`} className="loc-hero__link">
                <span>
                  {c.name}, {c.state}
                </span>
              </a>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}

function Campus({ c }: { c: (typeof CAMPUSES)[number] }) {
  return (
    <section id={c.id} className="cmp">
      <div className="container-wide">
        <header className="cmp__head">
          <div>
            <div className="eyebrow">{c.since}</div>
            <h2 className="cmp__title">
              {c.name}, <em>{c.state}</em>
            </h2>
            <p className="cmp__tag">{c.tagline}</p>
          </div>
        </header>
        <div className="cmp__grid">
          {/* Media: sticky photo + map */}
          <div className="cmp__media">
            <PhotoSlot
              label={`${c.name} campus — photograph`}
              src={c.photo || undefined}
              className="cmp__photo"
              paper
            />
            <div className="cmp__map">
              <iframe
                src={c.mapsEmbed}
                title={`${c.name} map`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a
                href={c.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="cmp__map-cta"
              >
                Open in Google Maps →
              </a>
            </div>
          </div>

          {/* Info */}
          <div className="cmp__body">
            <dl className="cmp__info">
              <div>
                <dt>Address</dt>
                <dd>
                  {c.addr}
                  <br />
                  {c.city}
                  <br />
                  <a
                    href={c.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cmp__link"
                  >
                    → Directions
                  </a>
                </dd>
              </div>
              <div>
                <dt>Watch &amp; follow</dt>
                <dd>
                  <a
                    href={c.yt}
                    target="_blank"
                    rel="noreferrer"
                    className="cmp__link"
                  >
                    → YouTube channel
                  </a>
                  <br />
                  <a
                    href={c.fb}
                    target="_blank"
                    rel="noreferrer"
                    className="cmp__link"
                  >
                    → Facebook
                  </a>
                </dd>
              </div>
            </dl>

            <h3 className="cmp__rhythm-title">Weekly rhythm</h3>
            <ul className="cmp__rhythm">
              {c.rhythm.map((r, ri) => (
                <li key={ri}>
                  <div className="cmp__day">{r.day}</div>
                  <div className="cmp__items">
                    {r.items.map((it, ii) => (
                      <div key={ii} className="cmp__item">
                        <span>{it[0]}</span>
                        <span className="cmp__time">{it[1]}</span>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <div className="cmp__actions">
              <a
                href={c.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn--primary btn--lg"
              >
                Get directions <ArrowIcon />
              </a>
              <a
                href={c.yt}
                target="_blank"
                rel="noreferrer"
                className="btn btn--ghost btn--lg"
              >
                Watch on YouTube
              </a>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

const LIVE_EVENTS: {
  day: string;
  items: { campus: string; what: string; when: string; liveUrl: string }[];
}[] = [
  {
    day: "Sunday",
    items: [
      {
        campus: "Silver Spring",
        what: "Sunday Worship",
        when: "11:00a",
        liveUrl: "https://www.youtube.com/@addislidetmedia/streams",
      },
      {
        campus: "Alexandria",
        what: "Sunday Worship",
        when: "10:30a",
        liveUrl: "https://www.youtube.com/@AddisLidetVirginia/streams",
      },
    ],
  },
];

function ScheduleTable() {
  return (
    <section className="sched" id="schedule">
      <div className="container-wide">
        <header className="sched__head">
          <div>
            <div className="eyebrow">Live transmission</div>
            <h2 className="sched__title">
              When services
              <br />
              stream <em>live.</em>
            </h2>
          </div>
        </header>

        <ul className="sched__list">
          {LIVE_EVENTS.map((r, i) => (
            <li key={i} className="sched__row">
              <div className="sched__day">{r.day}</div>
              <div className="sched__items">
                {r.items.map((it, j) => (
                  <div key={j} className="sched__item">
                    <span className="sched__campus">{it.campus}</span>
                    <span className="sched__what">{it.what}</span>
                    <span className="sched__when">{it.when}</span>
                    <a
                      href={it.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="sched__live"
                    >
                      Watch live →
                    </a>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <p className="sched__tz">
          <span className="sched__tz-dot" />
          Eastern Time (ET) · Updated for 2026 schedule
        </p>
      </div>
    </section>
  );
}

const LocationsPage = () => {
  useHashScroll();
  const campuses = useMemo(() => shuffle(CAMPUSES), []);
  return (
    <div className="landing-root">
      <LandingNav />
      <main id="main-content">
        <LocHero />
        {campuses.map((c) => (
          <Campus key={c.id} c={c} />
        ))}
        <ScheduleTable />
      </main>
      <LandingFooter />
    </div>
  );
};

export default LocationsPage;
