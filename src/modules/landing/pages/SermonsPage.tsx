import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import ArrowIcon from "../components/ArrowIcon";
import "../landing.css";

const CHANNELS = [
  {
    key: "md",
    label: "Silver Spring",
    city: "Maryland",
    handle: "@addislidetmedia",
    channelId: "UC0a-B295i9i-wTezQ4G-M3w",
    url: "https://www.youtube.com/@addislidetmedia",
    days: "Sun · Wed · Fri",
  },
  {
    key: "va",
    label: "Alexandria",
    city: "Virginia",
    handle: "@AddisLidetVirginia",
    channelId: "UC9wD2V5iETIWes24ZJv6OsA",
    url: "https://www.youtube.com/@AddisLidetVirginia",
    days: "Sun · Tue · Fri",
  },
  {
    key: "ya",
    label: "Young Adults",
    city: "DMV",
    handle: "@addislidetyoungadultminist6291",
    channelId: "UCnIYfT518KOxn4KZTZLxwng",
    url: "https://www.youtube.com/@addislidetyoungadultminist6291",
    days: "Fri · Sat · Sun",
  },
];

const SCHEDULE = [
  {
    day: "Sunday",
    items: [
      ["Silver Spring", "Morning Prayer", "10:00a"],
      ["Silver Spring", "Sunday Worship", "11:00a"],
      ["Silver Spring", "Young Adult", "6:30p"],
      ["Alexandria", "Morning Prayer", "9:30a"],
      ["Alexandria", "Sunday Worship", "10:30a"],
    ],
  },
  { day: "Tuesday", items: [["Alexandria", "Midweek Teaching", "7:00p"]] },
  { day: "Wednesday", items: [["Silver Spring", "Midweek Service", "6:30p"]] },
  { day: "Thursday", items: [["Silver Spring", "Thursday Prayer", "10:00a"]] },
  {
    day: "Friday",
    items: [
      ["Alexandria", "Prayer Night", "7:00p"],
      ["Silver Spring", "Overnight Prayer", "8:30p"],
    ],
  },
  { day: "Saturday", items: [["Alexandria", "Young Adult", "7:00p"]] },
];

function SermonsHero({
  active,
  setActive,
}: {
  active: string;
  setActive: (k: string) => void;
}) {
  return (
    <section className="s-hero">
      <div className="container-wide">
        <div className="eyebrow" style={{ marginBottom: 36 }}>
          Watch &amp; listen · Sermon archive
        </div>
        <h1 className="s-hero__title">
          <span>Preaching from</span>
          <span>
            <em>Silver Spring</em>, <em>Alexandria</em>,
          </span>
          <span>and our Young Adults.</span>
        </h1>
        <p className="s-hero__lede">
          Every Sunday service, prayer night, and worship evening — streamed
          live and kept on YouTube for the whole family, wherever you are.
        </p>
        <div className="s-channels">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              className={`s-channel${c.key === active ? " is-active" : ""}`}
              onClick={() => setActive(c.key)}
            >
              <div className="s-channel__top">
                <span className="s-channel__label">{c.label}</span>
                <span className="s-channel__city">{c.city}</span>
              </div>
              <div className="s-channel__meta">
                <span>{c.days}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SermonsStage({ active }: { active: string }) {
  const current = CHANNELS.find((c) => c.key === active)!;

  return (
    <section className="s-stage">
      <div className="container-wide">
        <div className="s-stage__grid">
          <div className="s-player">
            {current.channelId ? (
              <iframe
                key={current.key}
                src={`https://www.youtube.com/embed?listType=playlist&list=${current.channelId.replace("UC", "UU")}&index=1`}
                title={`Addis Lidet latest service — ${current.label}`}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div className="s-player__fallback">
                <div
                  style={{
                    position: "relative",
                    zIndex: 3,
                    padding: 48,
                    textAlign: "center",
                    maxWidth: 440,
                  }}
                >
                  <div
                    className="eyebrow"
                    style={{ color: "var(--cream-muted)", marginBottom: 18 }}
                  >
                    Young Adult Ministry
                  </div>
                  <h3
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontWeight: 300,
                      fontSize: 32,
                      color: "var(--cream)",
                      marginBottom: 16,
                      lineHeight: 1.1,
                    }}
                  >
                    Watch on YouTube
                  </h3>
                  <p
                    style={{
                      color: "var(--cream-dim)",
                      marginBottom: 28,
                      fontSize: 14,
                      lineHeight: 1.55,
                    }}
                  >
                    Live embedding isn't enabled for this channel. All services
                    and worship nights stream live on YouTube.
                  </p>
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--cream btn--sm"
                  >
                    Open channel <ArrowIcon />
                  </a>
                </div>
              </div>
            )}
          </div>

          <aside className="s-meta">
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              Now playing
            </div>
            <h2 className="s-meta__title">{current.label}</h2>
            <div className="s-meta__city">{current.city}</div>

            <dl className="s-spec">
              <div>
                <dt>Handle</dt>
                <dd>{current.handle}</dd>
              </div>
              <div>
                <dt>Live days</dt>
                <dd>{current.days}</dd>
              </div>
            </dl>

            <div className="s-links">
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="btn btn--primary btn--sm"
              >
                Open on YouTube <ArrowIcon />
              </a>
              <a
                href={`${current.url}/videos`}
                target="_blank"
                rel="noreferrer"
                className="s-link"
              >
                → Past services
              </a>
              <a
                href={`${current.url}/playlists`}
                target="_blank"
                rel="noreferrer"
                className="s-link"
              >
                → Sermon series
              </a>
              {current.channelId && (
                <a
                  href={`${current.url}/streams`}
                  target="_blank"
                  rel="noreferrer"
                  className="s-link"
                >
                  → All live broadcasts
                </a>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function ScheduleTable() {
  return (
    <section className="sched">
      <div className="container-wide">
        <header className="sched__head">
          <div>
            <div className="eyebrow">Weekly schedule</div>
            <h2 className="sched__title">
              When services
              <br />
              stream <em>live.</em>
            </h2>
          </div>
          <div className="sched__head-right">
            <p className="sched__lede">
              All times Eastern. Services begin streaming at service start and
              replays post within 24&nbsp;hours.
            </p>
            <Link to="/locations" className="btn btn--ghost btn--sm">
              View all locations
            </Link>
          </div>
        </header>

        <ul className="sched__list">
          {SCHEDULE.map((r, i) => (
            <li key={i} className="sched__row">
              <div className="sched__day">{r.day}</div>
              <div className="sched__items">
                {r.items.map((it, j) => (
                  <div key={j} className="sched__item">
                    <span className="sched__campus">{it[0]}</span>
                    <span className="sched__what">{it[1]}</span>
                    <span className="sched__when">{it[2]}</span>
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

const SermonsPage = () => {
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem("alic.channel") || "md";
    } catch {
      return "md";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("alic.channel", active);
    } catch {}
  }, [active]);

  return (
    <div className="landing-root">
      <LandingNav />
      <main id="main-content">
        <SermonsHero active={active} setActive={setActive} />
        <SermonsStage active={active} />
        <ScheduleTable />
      </main>
      <LandingFooter />
    </div>
  );
};

export default SermonsPage;
