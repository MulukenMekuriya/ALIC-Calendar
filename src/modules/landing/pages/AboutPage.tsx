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

/* ── Hero ── */
function AboutHero() {
  return (
    <section className="ab-hero">
      <div className="container-wide">
        <div className="eyebrow" style={{ marginBottom: 36 }}>About · ስለ እኛ</div>
        <h1 className="ab-hero__title">
          <span>A small apartment</span>
          <span>in <em>Washington, DC</em>.</span>
          <span>September, 2008.</span>
        </h1>
        <div className="ab-hero__grid">
          <div className="ab-hero__lede">
            <p>That's where Addis Lidet — <em>"new birth"</em> — began. A handful of believers around a coffee table, praying for a church that would carry the gospel to Ethiopians across the diaspora, and home again.</p>
            <p>Seventeen years on, we worship in two cities across the DMV and serve alongside partners on three continents. The family has grown. The welcome has not changed.</p>
          </div>
          <aside>
            <PhotoSlot label="Founding families — photograph" className="ab-hero__side" paper style={{ aspectRatio: "4/5" }} />
            <div className="ab-hero__cap">Founding families · 2008</div>
          </aside>
        </div>
      </div>
    </section>
  );
}

/* ── Timeline ── */
const MILESTONES = [
  { year: "2008", city: "Washington, DC", t: "The beginning",       b: "A small DC apartment, a coffee table, and a few families around the word — asking the Lord for a church for the diaspora." },
  { year: "2009", city: "Silver Spring",   t: "First home",          b: "The church moves to its first dedicated space on Ripley St. Sunday worship and midweek prayer take root." },
  { year: "2013", city: "DMV",             t: "Young Adult Ministry",b: "A generation finds its voice — Sunday evenings become a gathering for students, young professionals, and newlyweds far from home." },
  { year: "2017", city: "Springfield",     t: "A second campus",     b: "Virginia families plant a branch in Springfield. Two locations, one church, same gospel — on both sides of the Potomac." },
  { year: "2020", city: "Online",          t: "The streams go live", b: "When the world went quiet, the broadcasts began. Silver Spring, Virginia, and Young Adults build channels reaching from Addis to Adelaide." },
  { year: "2022", city: "Ethiopia",        t: "ALIC Mission",        b: "Formalizing what began at the founding: church plants, discipleship materials, and gospel partnerships in Ethiopia and beyond." },
  { year: "2024", city: "DMV",             t: "ALIC Bible School",   b: "A discipleship program for the whole family — theology, mission, and formation in English and Amharic." },
  { year: "2026", city: "Alexandria",      t: "New Virginia home",   b: "The VA campus buys its first building — 2730 Eisenhower Avenue in Alexandria. A permanent home for the family across the Potomac." },
  { year: "Today",city: "—",              t: "One family, many places", b: "Seven services a week across two campuses. A community of worship carrying the story forward." },
];

function Timeline() {
  return (
    <section className="tl-section">
      <div className="container-wide">
        <div className="tl__head">
          <div className="eyebrow">Our story · ታሪካችን</div>
          <h2 className="tl__title">Seventeen years. <em>One faithful God.</em></h2>
        </div>
        <ol className="tl">
          {MILESTONES.map((m, i) => (
            <li key={i} className="tl-item">
              <div className="tl-year">{m.year}</div>
              <div className="tl-body">
                <div className="tl-meta">{m.city}</div>
                <h3 className="tl-t">{m.t}</h3>
                <p className="tl-b">{m.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Vision & Mission ── */
function VisionMission() {
  return (
    <section className="vm">
      <div className="container-wide">
        <div className="vm__grid">
          <div className="vm__card">
            <div className="vm__num">I</div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>Vision · ራዕይ</div>
            <p className="vm__body">
              We envision a church that declares the gospel of <em>Jesus Christ</em>, and nurtures disciples committed to doing the same.
            </p>
            <p className="vm__am">
              የኢየሱስ ክርስቶስን ወንጌል የምታውጅ እና ቁርጥ ያሉ ደቀመዛሙርትን የምታሳድግ ቤተክርስቲያን እናያለን።
            </p>
          </div>
          <div className="vm__card">
            <div className="vm__num">II</div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>Mission · ተልዕኮ</div>
            <ul className="vm__list">
              <li><b>Worship</b> — gathering the family around the presence of Jesus each week.</li>
              <li><b>Word</b> — teaching the full counsel of scripture in English and Amharic.</li>
              <li><b>Witness</b> — carrying the gospel to our cities, our people, and the nations.</li>
              <li><b>Welcome</b> — building a community where no one belongs alone.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Beliefs ── */
const BELIEFS = [
  { n: "I",   t: "Scripture",     b: "The Bible is the inspired, inerrant Word of God — our supreme authority for faith and life." },
  { n: "II",  t: "The Trinity",   b: "One God eternally existing in three persons: Father, Son, and Holy Spirit." },
  { n: "III", t: "Jesus Christ",  b: "Fully God and fully human. Crucified, risen, reigning, and returning." },
  { n: "IV",  t: "Salvation",     b: "By grace alone, through faith alone, in Christ alone — a gift that transforms." },
  { n: "V",   t: "The Holy Spirit",b: "Present to comfort, convict, empower, and form us into the image of Christ." },
  { n: "VI",  t: "The Church",    b: "A family gathered across languages and nations to worship God and make disciples." },
];

function Beliefs() {
  return (
    <section className="beliefs">
      <div className="container-wide">
        <div className="beliefs__head">
          <div className="eyebrow">What we believe</div>
          <h2 className="beliefs__title">Simple. Historic.<br /><em>Unchanging.</em></h2>
        </div>
        <div className="beliefs__grid">
          {BELIEFS.map((b) => (
            <article key={b.n} className="belief">
              <div className="belief__n">{b.n}</div>
              <h3 className="belief__t">{b.t}</h3>
              <p className="belief__b">{b.b}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Leadership ── */
const TEAM = [
  { name: "Pastor Elias Getaneh",  role: "Lead Pastor · Silver Spring",  b: "Shepherding Silver Spring since its earliest days. Preaches weekly in Amharic and English." },
  { name: "Pastor Mekashaw",       role: "Associate Pastor · Silver Spring",b: "Teaching pastor and discipleship lead, anchoring midweek and overnight prayer services." },
  { name: "Pastor Biniam Aboye",   role: "Pastor · Silver Spring, MD",    b: "ALIC Pastoral Office Associate. Supports the pastoral team in shepherding the Silver Spring congregation." },
];

function Leadership() {
  return (
    <section className="lead">
      <div className="container-wide">
        <div className="lead__head">
          <div>
            <div className="eyebrow">Shepherds · እረኞቻችን</div>
            <h2 className="lead__title">The people<br />praying for you.</h2>
          </div>
          <p className="lead__lede">
            Our pastors lead with open doors. Reach out any time — to meet, to pray, or to walk with you through a hard season.
          </p>
        </div>
        <div className="lead__grid">
          {TEAM.map((p) => (
            <article key={p.name}>
              <PhotoSlot label="Portrait" className="leader__photo" paper />
              <div className="leader__body">
                <div className="leader__role">{p.role}</div>
                <h3 className="leader__name">{p.name}</h3>
                <p className="leader__b">{p.b}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Mission Strip ── */
function MissionStrip() {
  return (
    <section className="ms">
      <div className="container-wide">
        <div className="ms__grid">
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>ALIC Mission · አገልግሎት</div>
            <h2 className="ms__title">
              <span>From a DC apartment</span>
              <span><em>to the ends of the earth.</em></span>
            </h2>
            <p className="ms__p">
              ALIC Mission equips church plants in Ethiopia, trains pastors in the diaspora, and sends teams to underserved communities — rooted in the same gospel that founded us in 2008.
            </p>
            <a href="https://addislidetchurch.org/alic-mission/" target="_blank" rel="noreferrer" className="btn btn--primary btn--lg">
              Learn about ALIC Mission <ArrowIcon />
            </a>
          </div>
          <div className="ms__figs">
            {[["12+","Partner churches"],["3","Continents served"],["40+","Pastors trained"],["—","Gospel shared"]].map(([n, l]) => (
              <div key={l} className="ms__fig">
                <div className="ms__n">{n}</div>
                <div className="ms__l">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── CTA ── */
function AboutCTA() {
  return (
    <section className="about-cta">
      <div className="container-wide about-cta__inner">
        <div className="eyebrow" style={{ marginBottom: 20 }}>Next step</div>
        <h2 className="about-cta__title">Meet us this <em>Sunday.</em></h2>
        <div className="about-cta__actions">
          <Link to="/locations" className="btn btn--cream btn--lg">Plan a visit <ArrowIcon /></Link>
          <Link to="/connect"   className="btn btn--ghost-cream btn--lg">Get connected</Link>
        </div>
      </div>
    </section>
  );
}

/* ── Page ── */
const AboutPage = () => (
  <div className="landing-root">
    <LandingNav />
    <AboutHero />
    <Timeline />
    <VisionMission />
    <Beliefs />
    <Leadership />
    <MissionStrip />
    <AboutCTA />
    <LandingFooter />
  </div>
);

export default AboutPage;
