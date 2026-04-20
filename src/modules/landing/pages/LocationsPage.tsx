import { useState } from "react";
import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import PhotoSlot from "../components/PhotoSlot";
import "../landing.css";

const ArrowIcon = () => (
  <svg className="arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CAMPUSES = [
  {
    id: "md", num: "I", name: "Silver Spring", state: "Maryland",
    addr: "11961 Tech Rd", city: "Silver Spring, MD 20904",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=11961+Tech+Rd+Silver+Spring+MD+20904",
    mapsEmbed: "https://www.google.com/maps?q=11961+Tech+Rd+Silver+Spring+MD+20904&output=embed",
    pastor: "Pastor Mekashaw Shimelash", role: "Lead Pastor",
    yt: "https://www.youtube.com/@addislidetmedia",
    fb: "https://www.facebook.com/AddisLedet/",
    photo: "/md-campus.jpg",
    channelId: "UC0a-B295i9i-wTezQ4G-M3w",
    tagline: "Our founding home — where the family first gathered.",
    since: "Since 2009",
    rhythm: [
      { day: "Sunday",    items: [["Morning Prayer","10:00a–11:00a"],["Sunday Worship","11:00a–1:30p"],["Young Adult","6:30p–9:00p"]] },
      { day: "Wednesday", items: [["Midweek Service","6:30p–9:00p"]] },
      { day: "Thursday",  items: [["Thursday Prayer","10:00a–2:00p"]] },
      { day: "Friday",    items: [["Overnight Prayer","8:30p–12:30a"]] },
    ],
  },
  {
    id: "va", num: "II", name: "Alexandria", state: "Virginia",
    addr: "2730 Eisenhower Ave", city: "Alexandria, VA 22314",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=2730+Eisenhower+Ave+Alexandria+VA+22314",
    mapsEmbed: "https://www.google.com/maps?q=2730+Eisenhower+Ave+Alexandria+VA+22314&output=embed",
    pastor: "Pastor Elias Getaneh", role: "Lead Pastor",
    yt: "https://www.youtube.com/@AddisLidetVirginia",
    fb: "https://www.facebook.com/profile.php?id=100007033008234",
    photo: "/va-campus.jpg",
    channelId: "UC9wD2V5iETIWes24ZJv6OsA",
    tagline: "A new home on Eisenhower Avenue — the family across the Potomac.",
    since: "Since 2014 · New home 2026",
    rhythm: [
      { day: "Sunday",   items: [["Morning Prayer","9:30a–10:30a"],["Sunday Worship","10:30a–1:00p"]] },
      { day: "Tuesday",  items: [["Bible Study","7:00p–9:00p"]] },
      { day: "Friday",   items: [["Prayer Night","7:00p–11:00p"]] },
      { day: "Saturday", items: [["Young Adults","7:00p–9:00p"]] },
    ],
  },
];

function LocHero() {
  return (
    <section className="loc-hero">
      <div className="container-wide">
        <div className="eyebrow" style={{ marginBottom: 36 }}>Locations · አድራሻ</div>
        <h1 className="loc-hero__title">
          <span>Two cities.</span>
          <span>One <em>family.</em></span>
        </h1>
        <div className="loc-hero__foot">
          <p className="loc-hero__lede">
            Whichever campus you call home, the welcome is the same. Plan your visit, find service times, or stream from anywhere.
          </p>
          <nav className="loc-hero__jump">
            {CAMPUSES.map((c) => (
              <a key={c.id} href={`#${c.id}`} className="loc-hero__link">
                <span className="loc-hero__num">{c.num}</span>
                <span>{c.name}, {c.state}</span>
              </a>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}

function CampusStream({ c }: { c: typeof CAMPUSES[number] }) {
  const [live, setLive] = useState(false);
  const latestSrc = `https://www.youtube.com/embed?listType=playlist&list=${c.channelId.replace('UC', 'UU')}&index=1`;
  const liveSrc   = `https://www.youtube.com/embed/live_stream?channel=${c.channelId}`;

  return (
    <div className="cmp__stream">
      <div className="cmp__stream-head">
        <span className="eyebrow">Live &amp; archive · Watch</span>
        <div className="cmp__stream-toggle">
          <button className={`cmp__stream-btn${!live ? ' is-on' : ''}`} onClick={() => setLive(false)}>Latest</button>
          <button className={`cmp__stream-btn${live ? ' is-on' : ''}`}  onClick={() => setLive(true)}>Watch Live</button>
        </div>
      </div>
      <div className="cmp__stream-player">
        <iframe
          key={live ? 'live' : 'latest'}
          src={live ? liveSrc : latestSrc}
          title={`${c.name} — ${live ? 'live stream' : 'latest service'}`}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="cmp__stream-links">
        <a href={c.yt} target="_blank" rel="noreferrer" className="cmp__link">→ Full channel &amp; archive</a>
        <a href={`${c.yt}/playlists`} target="_blank" rel="noreferrer" className="cmp__link">→ Sermon series</a>
      </div>
    </div>
  );
}

function Campus({ c }: { c: typeof CAMPUSES[number] }) {
  return (
    <section id={c.id} className="cmp">
      <div className="container-wide">
        <header className="cmp__head">
          <div className="cmp__num">{c.num}</div>
          <div>
            <div className="eyebrow">{c.since}</div>
            <h2 className="cmp__title">{c.name}, <em>{c.state}</em></h2>
            <p className="cmp__tag">{c.tagline}</p>
          </div>
        </header>
        <div className="cmp__grid">
          {/* Media: sticky photo + map */}
          <div className="cmp__media">
            <PhotoSlot label={`${c.name} campus — photograph`} src={c.photo || undefined} className="cmp__photo" paper />
            <div className="cmp__map">
              <iframe
                src={c.mapsEmbed}
                title={`${c.name} map`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a href={c.mapsUrl} target="_blank" rel="noreferrer" className="cmp__map-cta">
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
                  {c.addr}<br />{c.city}<br />
                  <a href={c.mapsUrl} target="_blank" rel="noreferrer" className="cmp__link">→ Directions</a>
                </dd>
              </div>
              <div>
                <dt>Shepherd</dt>
                <dd>
                  {c.pastor}<br />
                  <span className="cmp__dim">{c.role}</span>
                </dd>
              </div>
              <div>
                <dt>Watch &amp; follow</dt>
                <dd>
                  <a href={c.yt} target="_blank" rel="noreferrer" className="cmp__link">→ YouTube channel</a><br />
                  <a href={c.fb} target="_blank" rel="noreferrer" className="cmp__link">→ Facebook</a>
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
              <a href={c.mapsUrl} target="_blank" rel="noreferrer" className="btn btn--primary btn--lg">
                Get directions <ArrowIcon />
              </a>
              <a href={c.yt} target="_blank" rel="noreferrer" className="btn btn--ghost btn--lg">
                Watch on YouTube
              </a>
            </div>
          </div>
        </div>

        <CampusStream c={c} />
      </div>
    </section>
  );
}

function LocCTA() {
  return (
    <section className="loc-cta">
      <div className="container-wide loc-cta__inner">
        <div className="eyebrow" style={{ marginBottom: 20, color: "var(--cream-muted)" }}>Not local?</div>
        <h2 className="loc-cta__title">Stream with us this <em>Sunday.</em></h2>
        <div className="loc-cta__actions">
          <Link to="/sermons" className="btn btn--cream btn--lg">Watch live</Link>
          <Link to="/connect" className="btn btn--ghost-cream btn--lg">Find your community</Link>
        </div>
      </div>
    </section>
  );
}

const LocationsPage = () => (
  <div className="landing-root">
    <LandingNav />
    <LocHero />
    {CAMPUSES.map((c) => <Campus key={c.id} c={c} />)}
    <LocCTA />
    <LandingFooter />
  </div>
);

export default LocationsPage;
