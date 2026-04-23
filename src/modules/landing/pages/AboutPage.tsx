import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import PhotoSlot from "../components/PhotoSlot";
import ArrowIcon from "../components/ArrowIcon";
import "../landing.css";

/* ── Hero ── */
function AboutHero() {
  return (
    <section className="ab-hero">
      <div className="container-wide">
        <div className="eyebrow" style={{ marginBottom: 36 }}>
          About · ስለ እኛ
        </div>
        <h1 className="ab-hero__title">
          <span>A small apartment</span>
          <span>
            in <em>Washington, DC</em>.
          </span>
          <span>September, 2008.</span>
        </h1>
        <div className="ab-hero__grid">
          <div className="ab-hero__lede">
            <p>
              That's where Addis Lidet — <em>"new birth"</em> — began. A handful
              of believers around a coffee table, praying for a church that
              would carry the gospel to Ethiopians across the diaspora, and home
              again.
            </p>
            <p>
              Seventeen years on, we worship in two cities across the DMV and
              serve alongside partners on three continents. The family has
              grown. The welcome has not changed.
            </p>
          </div>
          <aside>
            <PhotoSlot
              label="Founding families — photograph"
              className="ab-hero__side"
              paper
              style={{ aspectRatio: "4/5" }}
            />
            <div className="ab-hero__cap">Founding families · 2008</div>
          </aside>
        </div>
      </div>
    </section>
  );
}

/* ── Timeline ── */
const MILESTONES = [
  {
    year: "2008",
    city: "Washington, DC",
    t: "The beginning",
    b: "A small DC apartment, a coffee table, and a few families around the word — asking the Lord for a church for the diaspora.",
  },
  {
    year: "2009",
    city: "Silver Spring",
    t: "First home",
    b: "The church moves to 1010 Ripley St, Silver Spring, MD 20910 — a home it would occupy for over a decade. Sunday worship and midweek prayer take root.",
  },
  {
    year: "2014",
    city: "Springfield, VA",
    t: "A second campus",
    b: "Weekday worship and prayer begin in Arlington, Virginia, targeting members in two home cells in Alexandria. Today those seeds have grown into seven home cells across Virginia.",
  },
  {
    year: "2020",
    city: "Online",
    t: "The streams go live",
    b: "When the world went quiet, the broadcasts began. Silver Spring, Virginia, and Young Adults build channels reaching from Addis to Adelaide.",
  },
  {
    year: "2021",
    city: "Silver Spring",
    t: "Our own building",
    b: "In June 2021 Addis Lidet acquires its own worship space — 11961 Tech Rd, Silver Spring, MD 20904. After thirteen years of renting, the Maryland family finally has a home of its own.",
  },
  {
    year: "2022",
    city: "Ethiopia",
    t: "ALIC Mission",
    b: "Formalizing what began at the founding: church plants, discipleship materials, and gospel partnerships in Ethiopia and beyond.",
  },
  {
    year: "2024",
    city: "DMV",
    t: "ALIC Bible School",
    b: "A discipleship program for the whole family — theology, mission, and formation in English and Amharic.",
  },
  {
    year: "2026",
    city: "Alexandria, VA",
    t: "New Virginia building",
    b: "The VA campus acquires its first building — 2730 Eisenhower Ave, Alexandria, VA 22314. A permanent home for the family across the Potomac.",
  },
  {
    year: "Today",
    city: "—",
    t: "One family, many places",
    b: "~30+ home cells in Maryland, 10+ in Virginia, and a congregation that keeps arriving and keeps staying.",
  },
];

function Timeline() {
  return (
    <section className="tl-section">
      <div className="container-wide">
        <div className="tl__head">
          <div className="eyebrow">Our story · ታሪካችን</div>
          <h2 className="tl__title">
            Seventeen years. <em>One faithful God.</em>
          </h2>
        </div>
      </div>
      <div className="tl-track">
        <div className="tl-rail" />
        <ol className="tl">
          {MILESTONES.map((m, i) => (
            <li key={i} className="tl-item">
              <div className="tl-node">
                <span className="tl-dot" />
                <span className="tl-year">{m.year}</span>
              </div>
              <div className="tl-card">
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
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              Vision · ራዕይ
            </div>
            <p className="vm__body">
              We envision a church that declares the gospel of{" "}
              <em>Jesus Christ</em>, and nurtures disciples committed to doing
              the same.
            </p>
            <p className="vm__am">
              የኢየሱስ ክርስቶስን ወንጌል የምታውጅ እና ቁርጥ ያሉ ደቀመዛሙርትን የምታሳድግ ቤተክርስቲያን እናያለን።
            </p>
          </div>
          <div className="vm__card">
            <div className="vm__num">II</div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              Mission · ተልዕኮ
            </div>
            <ul className="vm__list">
              <li>
                <b>Worship</b> — gathering the family around the presence of
                Jesus each week.
              </li>
              <li>
                <b>Word</b> — teaching the full counsel of scripture in English
                and Amharic.
              </li>
              <li>
                <b>Witness</b> — carrying the gospel to our cities, our people,
                and the nations.
              </li>
              <li>
                <b>Welcome</b> — building a community where no one belongs
                alone.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Statement of Faith ── */
const FAITH_STATEMENTS = [
  {
    ref: "1.1",
    title: "God",
    body: [
      "There is one God (Deut. 6:4), Creator of all things (Rev. 4:11), who is infinitely perfect (Matt. 5:48), existing eternally in three persons: Father, Son, and Holy Spirit (Matt. 28:19).",
    ],
  },
  {
    ref: "1.2",
    title: "Jesus Christ",
    body: [
      "Jesus Christ is the true God and true man (Phil. 2:6-11). He was sent by the Father (John 20:21), conceived by the Holy Spirit, and born of the virgin, Mary (Luke 1:34-38). He died on the cross, the Just for the unjust (1 Pet. 3:18), as a substitutionary sacrifice (Heb. 2:9), and all who believe in Him are justified on the ground of His shed blood (Rom. 5:9). He rose from the dead according to the Scriptures (1 Cor. 15:3-4). He is now at the right hand of the Majesty on high as our great High Priest (Heb. 8:1). He will come again to establish His Kingdom of righteousness and peace (Isa. 9:6-7).",
    ],
  },
  {
    ref: "1.3",
    title: "The Holy Spirit",
    body: [
      "The Holy Spirit is a divine person (John 14:16-18), sent to indwell, guide, teach, gift, empower, and bear His fruit in every believer (John 16:13; 1 Cor. 12:4, 11; Acts 1:8; Gal. 5:22-23). He convicts the world of sin, of righteousness, and of judgment (John 16:7-11).",
    ],
  },
  {
    ref: "1.4",
    title: "The Bible",
    body: [
      "The Old and New Testaments, inerrant as originally given, were verbally inspired by God and are a complete revelation of His will for our salvation. They constitute the divine and only rule of Christian faith and practice (2 Pet. 1:20-21; 2 Tim. 3:15-17).",
    ],
  },
  {
    ref: "1.5",
    title: "Humanity and Sin",
    body: [
      "Man and woman, created in the image and likeness of God (Gen. 1:27), fell through disobedience, incurring both physical and spiritual death (Rom. 6:23). Therefore, everyone is born with a sinful nature (Rom. 5:12), is separated from the life of God (Eph. 4:18), and can be saved only through the atoning work of the Lord Jesus Christ (Rom. 3:25).",
    ],
  },
  {
    ref: "1.6",
    title: "Salvation",
    body: [
      "Salvation has been provided through Jesus Christ for all people (1 John 2:2). Those who repent and believe in Him are justified by grace through faith (Rom. 3:21-24), born again of the Holy Spirit (Titus 3:4-7), delivered from the dominion of darkness, transferred into the Kingdom of God\u2019s Son (Col. 1:13), granted the gift of eternal life, and adopted as the children of God (Rom. 8:14-16; John 1:12).",
    ],
  },
  {
    ref: "1.7",
    title: "Sanctification",
    body: [
      "It is the will of God that each believer should be filled with the Holy Spirit and speaking with tongues and prophecies (Acts 10:45-46, 19:6), be sanctified wholly (1 Thess. 5:23), being separated from sin and the world and fully dedicated to the will of God, thereby receiving power for holy living and effective service (Acts 1:8). This is both a crisis and a progressive experience wrought in the life of the believer subsequent to conversion (Rom. 6:1\u201314).",
    ],
  },
  {
    ref: "1.8",
    title: "Healing",
    body: [
      "Provision is made in the redemptive work of the Lord Jesus Christ for the healing of the whole person (Isa. 53:4-5; Matt. 8:16-17). Prayer for the sick and anointing with oil are taught in the Scriptures (James 5:13-16) as privileges for the Church in this present age (Acts 4:30).",
    ],
  },
  {
    ref: "1.9",
    title: "The Church",
    body: [
      "The Church consists of all those who believe in the Lord Jesus Christ, are redeemed through His blood, and are born again by the Holy Spirit. Christ is the Head of His Body (Eph. 1:22-23, Col. 1:18), the Church, which has been commissioned by Him to go into all the world making disciples of all peoples (Matt. 24:14, 28:19-20).",
      "The local church is a body of believers in Christ (Eph. 5:30) who are called to love (1 Thess. 3:12) and joined together for the worship of God, edification through the Word of God, prayer, fellowship, proclamation of the gospel through word and deed (Luke 4:18-19), and observance of the ordinances of Baptism and the Lord\u2019s Supper (Acts 2:41-47).",
    ],
  },
  {
    ref: "1.10",
    title: "The Resurrection",
    body: [
      "There will be a bodily resurrection of all people (Acts 24:15). Our Lord Jesus Christ will judge with perfect justice (Acts 17:31, John 5:28-30) as the unrepentant and unbelieving are raised to the conscious anguish of eternal separation from God (Rev. 20:15, 21:8, 2 Thess. 1:9), and repentant believers are raised (John 6:40) to the unending joy of eternal life with God (Ps. 16:11, Rev. 21:1-4).",
    ],
  },
  {
    ref: "1.11",
    title: "The Return of Jesus",
    body: [
      "The Second Coming of the Lord Jesus Christ is imminent (Heb. 10:37) and will be personal, visible, and premillennial (Luke 21:27). This is the believer\u2019s blessed hope and is a vital truth which is an incentive to holy living and faithful service (Titus 2:11\u201314).",
    ],
  },
];

function StatementOfFaith() {
  return (
    <section className="sof">
      <div className="container-wide">
        <div className="sof__head">
          <div className="eyebrow">{"\u12A5\u121D\u1290\u1273\u127D\u1295"}</div>
          <h2 className="sof__title">
            Statement of <em>Faith.</em>
          </h2>
          <p className="sof__lede">
            We base our beliefs on the infallible Word of God, the Bible.
          </p>
        </div>
        <div className="sof__grid">
          {FAITH_STATEMENTS.map((s) => (
            <article key={s.ref} className="sof__item">
              <div className="sof__ref">{s.ref}</div>
              <h3 className="sof__item-title">{s.title}</h3>
              {s.body.map((p, i) => (
                <p key={i} className="sof__item-body">
                  {p}
                </p>
              ))}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Beliefs ── */
const BELIEFS = [
  { n: "I",    t: "Triune God",          b: "One God eternally existing in three persons: Father, Son, and Holy Spirit." },
  { n: "II",   t: "Salvation",           b: "By grace alone, through faith alone, in Christ alone — a gift that transforms." },
  { n: "III",  t: "Water Baptism",       b: "Believers' baptism by immersion — an outward sign of an inward change." },
  { n: "IV",   t: "Holy Communion",      b: "The Lord's Supper, observed in remembrance of Christ's sacrifice until He comes again." },
  { n: "V",    t: "Sanctification",      b: "The ongoing work of the Holy Spirit, setting believers apart for God's purpose." },
  { n: "VI",   t: "The Second Coming",   b: "Jesus Christ will return visibly and bodily to judge the living and the dead." },
  { n: "VII",  t: "God's Judgment",      b: "All will stand before God — the righteous to eternal life, the unrighteous to eternal separation." },
  { n: "VIII", t: "Church",              b: "A family gathered across languages and nations to worship God and make disciples." },
  { n: "IX",   t: "Bible",              b: "The Bible is the inspired, inerrant Word of God — our supreme authority for faith and life." },
  { n: "X",    t: "Christian Marriage",  b: "A covenant between one man and one woman, reflecting Christ's love for the Church." },
];

function Beliefs() {
  return (
    <section className="beliefs">
      <div className="container-wide">
        <div className="beliefs__head">
          <div className="eyebrow">What we believe</div>
          <h2 className="beliefs__title">
            <em>Doctrine.</em>
          </h2>
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
  {
    name: "Pastor Mekashaw Shimelash",
    role: "Lead Pastor",
    b: "ALIC's lead shepherd and founding voice. Oversees both campuses, preaches weekly, and stewards the vision God placed in a DC apartment in 2008.",
  },
  {
    name: "Pastor Elias Getaneh",
    role: "Lead Pastor · Alexandria, VA",
    b: "Plants and shepherds the Virginia congregation — seven home cells and a church that has grown from two families in Arlington to a campus of its own.",
  },
  {
    name: "Pastor Biniam Aboye",
    role: "Pastor · Silver Spring, MD",
    b: "ALIC Pastoral Office Associate. Walks closely with the Silver Spring congregation, supporting teaching, care, and day-to-day ministry.",
  },
];

function Leadership() {
  return (
    <section className="lead">
      <div className="container-wide">
        <div className="lead__head">
          <div>
            <div className="eyebrow">Shepherds · እረኞቻችን</div>
            <h2 className="lead__title">
              The people
              <br />
              praying for you.
            </h2>
          </div>
          <p className="lead__lede">
            Our pastors lead with open doors. Reach out any time — to meet, to
            pray, or to walk with you through a hard season.
          </p>
        </div>
        <div className="lead__grid">
          {TEAM.map((p) => (
            <article key={p.name}>
              <PhotoSlot
                label={p.name}
                className="leader__photo"
              />
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
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              ALIC Mission · አገልግሎት
            </div>
            <h2 className="ms__title">
              <span>From a DC apartment</span>
              <span>
                <em>to the ends of the earth.</em>
              </span>
            </h2>
            <p className="ms__p">
              ALIC Mission equips church plants in Ethiopia, trains pastors in
              the diaspora, and sends teams to underserved communities — rooted
              in the same gospel that founded us in 2008.
            </p>
            <a
              href="https://addislidetchurch.org/alic-mission/"
              target="_blank"
              rel="noreferrer"
              className="btn btn--primary btn--lg"
            >
              Learn about ALIC Mission <ArrowIcon />
            </a>
          </div>
          <div className="ms__figs">
            {[
              ["12+", "Partner churches"],
              ["3", "Continents served"],
              ["40+", "Pastors trained"],
              ["—", "Gospel shared"],
            ].map(([n, l]) => (
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
        <div className="eyebrow" style={{ marginBottom: 20, color: "var(--text-on-paper-dim)" }}>
          Next step
        </div>
        <h2 className="about-cta__title">
          Meet us this <em>Sunday.</em>
        </h2>
        <div className="about-cta__actions">
          <Link to="/locations" className="btn btn--primary btn--lg">
            Plan a visit <ArrowIcon />
          </Link>
          <Link to="/connect" className="btn btn--ghost btn--lg">
            Get connected
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Page ── */
const AboutPage = () => (
  <div className="landing-root">
    <LandingNav />
    <main id="main-content">
      <AboutHero />
      <Timeline />
      <VisionMission />
      <Beliefs />
      <StatementOfFaith />
      <Leadership />
      <MissionStrip />
      <AboutCTA />
    </main>
    <LandingFooter />
  </div>
);

export default AboutPage;
