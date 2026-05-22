import { useRef } from "react";
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
          About US · ስለ እኛ
        </div>
        <h1 className="ab-hero__title">
          <span>One family,</span>
          <span>
            <em>two homes</em>.
          </span>
          <span>Across the DMV.</span>
        </h1>
        <div className="ab-hero__grid">
          <div className="ab-hero__lede">
            <p>
              Addis Lidet Church began as a small gathering in Washington, DC,
              in 2008. In 2009, the church moved to Silver Spring, Maryland,
              where it grew steadily in membership and ministry over the next
              decade. Through seasons of growth and challenge, God's
              faithfulness and provision remained central to the church's
              journey.
            </p>
            <p>
              In 2014, weekday worship and prayer gatherings in Arlington,
              Virginia, became the foundation for what is now the Addis Lidet
              Church Virginia location. What began with two home cells has since
              expanded into a growing network of small groups across Virginia
              and Maryland.
            </p>
            <p>
              Today, Addis Lidet Church serves more than 1,000 congregants
              across its Silver Spring, Maryland, and Alexandria, Virginia,
              locations.
            </p>
          </div>
          <aside>
            <PhotoSlot
              label="Addis Lidet — congregation photograph"
              src="/ALIC Congregation photo.jpg"
              className="ab-hero__side"
              paper
              style={{ aspectRatio: "4/5" }}
            />
            <div className="ab-hero__cap">Addis Lidet · DMV</div>
          </aside>
        </div>
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
              To see <em>Jesus Christ's</em> Disciples.
            </p>
          </div>
          <div className="vm__card">
            <div className="vm__num">II</div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              Mission · ተልዕኮ
            </div>
            <p className="vm__body">
              Teaching, Living, and Proclaiming the Word of God empowered by the
              Holy Spirit.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Articles of Faith ── */
const ARTICLES_OF_FAITH: { ref: string; title: string; body: string[] }[] = [
  {
    ref: "1.1",
    title: "God the Father",
    body: [
      "We believe in God the Father—eternal, infinite, perfect, revealing Himself through the Holy Spirit, almighty, omnipresent, omniscient, unchanging, and the Creator of all things visible and invisible.",
    ],
  },
  {
    ref: "1.2",
    title: "Jesus Christ",
    body: [
      "We believe He is the Son of God the Father from eternity, born of the Virgin Mary by the Holy Spirit, fully God and fully man. He suffered, died on the cross for our sins, was buried, rose bodily on the third day, appeared to men, and ascended in glory to heaven. He sits at the right hand of the Father interceding for us and will return in great glory and authority.",
    ],
  },
  {
    ref: "1.3",
    title: "The Holy Spirit",
    body: [
      "We believe He is fully God, the Comforter, Teacher, and Guide to truth. He moved the spiritual fathers, prophets, and apostles. He indwells believers, distributes spiritual gifts and power to build the Church, and convicts the world of sin, righteousness, and judgment.",
      "We believe believers are baptized in the power of the Holy Spirit. According to Acts 2, we believe believers today should be filled with the Spirit and speak in tongues as a command from Christ.",
      "We believe spiritual gifts are available to believers today just as in the Apostolic age.",
    ],
  },
  {
    ref: "1.4",
    title: "The Trinity",
    body: [
      "We believe God is three in Person and work, but one in divine nature and deity.",
    ],
  },
  {
    ref: "2",
    title: "New Creation (Salvation)",
    body: [
      'We believe man was created without sin but fell through Adam\'s voluntary sin. However, anyone who repents and accepts Jesus as Savior is a "new creation" born of the Spirit and the Word.',
    ],
  },
  {
    ref: "3",
    title: "Water Baptism",
    body: [
      'We believe in immersion in water in the name of the Father, Son, and Holy Spirit. It is a symbolic act confirming one is dead to sin and alive to righteousness. The Church practices "Believer\'s Baptism" (adult baptism).',
    ],
  },
  {
    ref: "4",
    title: "Holy Communion",
    body: [
      "We believe the bread and wine are a holy ordinance to remember the Lord's suffering and death until He comes.",
    ],
  },
  {
    ref: "5",
    title: "Holiness",
    body: [
      "We believe Christians are called to live a life of sanctification, bearing spiritual fruit and glorifying Christ through a life set apart from sin.",
    ],
  },
  {
    ref: "6",
    title: "The Second Coming of Christ",
    body: [
      "We believe the Lord will return in glory; the dead in Christ will rise first, and the living will be caught up to meet Him.",
    ],
  },
  {
    ref: "7",
    title: "Judgment",
    body: [
      "We believe the righteous will live with the Lord forever, while the ungodly will suffer eternal punishment in hell, separated from God.",
    ],
  },
  {
    ref: "8",
    title: "The Church",
    body: [
      "We believe the Church is the Body of Christ, commissioned to represent God's Kingdom and fulfill the Great Commission.",
    ],
  },
  {
    ref: "9",
    title: "The Bible",
    body: [
      "We believe the 66 books of the Bible are the inerrant Word of God, the ultimate authority for salvation, righteous living, and doctrine.",
    ],
  },
  {
    ref: "10",
    title: "Christian Marriage",
    body: [
      "We believe marriage is a sacred union established by God exclusively between one man and one woman.",
    ],
  },
];

function ArticlesOfFaith() {
  const listRef = useRef<HTMLOListElement>(null);
  const scrollByCard = (dir: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 354, behavior: "smooth" });
  };
  return (
    <section className="sof">
      <div className="container-wide">
        <div className="sof__head">
          <div className="eyebrow">እምነታችን</div>
          <h2 className="sof__title">
            Articles of <em>Faith.</em>
          </h2>
          <p className="sof__lede">
            We base our beliefs on the infallible Word of God, the Bible.
          </p>
        </div>
      </div>
      <div className="sof-track">
        <div className="sof-rail" />
        <button
          type="button"
          className="sof-nav sof-nav--prev"
          aria-label="Scroll left"
          onClick={() => scrollByCard(-1)}
        >
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M8 1 3 6l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="sof-nav sof-nav--next"
          aria-label="Scroll right"
          onClick={() => scrollByCard(1)}
        >
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4 1 9 6l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ol className="sof-list" ref={listRef}>
          {ARTICLES_OF_FAITH.map((s) => (
            <li key={s.ref} className="sof-item">
              <div className="sof-node">
                <span className="sof-dot" />
                <span className="sof-ref">{s.ref}</span>
              </div>
              <div className="sof-card">
                <h3 className="sof-t">{s.title}</h3>
                {s.body.map((p, i) => (
                  <p key={i} className="sof-b">
                    {p}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="sof-hint">
        <span>Scroll for more</span>
        <svg viewBox="0 0 18 8" fill="none">
          <path
            d="M0 4h16M12 1l4 3-4 3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </section>
  );
}

/* ── Forward Vision 2026–2030 ── */
function ForwardVision() {
  return (
    <section className="fv">
      <div className="container-wide">
        <div className="fv__head">
          <div className="eyebrow">Looking ahead</div>
          <h2 className="fv__title">
            Moving Forward with Purpose:
            <br />
            Our <em>2026–2030</em> Vision.
          </h2>
        </div>
        <div className="fv__body">
          <p>
            At Addis Lidet International Church, we are entering a season of
            intentional, Spirit-led growth focused on deepening our faith and
            strengthening our community from the inside out. Over the next five
            years, we are dedicated to transforming church attendance into true
            discipleship through thriving home cell networks, robust family
            empowerment, and dynamic next-generation ministries that equip our
            children and youth for life-long faith and discipleship.
          </p>
          <p>
            This roadmap drives us to expand our reach and allocate resources
            accordingly to support these ministries. With the help and guidance
            of the Holy Spirit, we are prayerfully committed to serving His
            Kingdom with dedication and commitment.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Leadership ── */
const TEAM = [
  {
    name: "Pastor Mekashaw Shimelash",
    role: "Senior Pastor",
    src: "/Pr. Mekashaw.JPEG",
  },
  {
    name: "Pastor Elias Getaneh",
    role: "Pastor",
    src: "/Pastor Elu.jpeg",
  },
  {
    name: "Pastor Biniam Aboye",
    role: "Pastor",
    src: "/Pr. Bini.JPEG",
  },
  {
    name: "Teacher Worede Zinabu",
    role: "Teacher",
    src: "/Wade.jpeg",
  },
];

function Leadership() {
  return (
    <section className="lead">
      <div className="container-wide">
        <div className="lead__head">
          <div>
            <h2 className="lead__title">Fulltime Ministers</h2>
          </div>
        </div>
        <div className="lead__grid">
          {TEAM.map((p) => (
            <article key={p.name}>
              <PhotoSlot label={p.name} src={p.src} className="leader__photo" />
              <div className="leader__body">
                <div className="leader__role">{p.role}</div>
                <h3 className="leader__name">{p.name}</h3>
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
              ALIC Global Mission
            </div>
            <h2 className="ms__title">
              <span>ALIC Global</span>
              <span>
                <em>Mission.</em>
              </span>
            </h2>
            <p className="ms__p">
              ALIC Global Mission supports church planting, discipleship, and
              community outreach across Ethiopia and Sub-Saharan Africa, rooted
              in the same gospel that has guided our church.
            </p>
            <Link to="/mission" className="btn btn--primary btn--lg">
              Learn about ALIC Global Mission <ArrowIcon />
            </Link>
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
        <div
          className="eyebrow"
          style={{ marginBottom: 20, color: "var(--text-on-paper-dim)" }}
        >
          Next step
        </div>
        <h2 className="about-cta__title">
          Join <em>US.</em>
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
      <Leadership />
      <VisionMission />
      <ArticlesOfFaith />
      <ForwardVision />
      <MissionStrip />
      <AboutCTA />
    </main>
    <LandingFooter />
  </div>
);

export default AboutPage;
