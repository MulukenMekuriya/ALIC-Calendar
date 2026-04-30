import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import ArrowIcon from "../components/ArrowIcon";
import "../landing.css";

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

const PATHWAY_STEPS = [
  {
    n: "01",
    day: "DAY 01",
    t: "Come and be welcomed",
    am: "ኑ እና ሞቅ ያለ አቀባበል ይደረግላችሁ",
    icon: "☾",
    b: "Visit a Sunday service and let us greet you. Our ushers will meet you at the door, and after worship we'd love to introduce you to our pastors and share a cup of coffee. Bring your family — children are a blessing, not a distraction.",
  },
  {
    n: "02",
    day: "WEEK 01",
    t: "Share a meal with us",
    am: "ቡና አብረን እንጠጣ",
    icon: "☕",
    b: "Every first Sunday after service, we host new families for buna, injera, and conversation with the pastoral team. Come hungry, leave known. This is where you stop being a visitor and become ye'bet sew (የቤት ሰው) — family.",
  },
  {
    n: "03",
    day: "WEEK 02–05",
    t: "Foundations Class",
    am: "የእምነት መሠረት",
    icon: "✦",
    b: "A four-week class with the pastors covering what we believe, how we worship, and what it means to walk as a disciple in this community. Open to new believers, returning believers, and anyone seeking to know Christ more deeply.",
  },
  {
    n: "04",
    day: "WEEK 06+",
    t: "Join a home cell",
    am: "የመጽሐፍ ቅዱስ ጥናት",
    icon: "◉",
    b: "Our 42 home cells across Maryland and Virginia meet weekly in homes for worship, scripture, prayer, and a shared meal. This is where life happens — births celebrated, burdens carried, marriages strengthened, faith deepened. Ask us which cell is closest to you.",
  },
  {
    n: "05",
    day: "ONGOING",
    t: "Serve and be sent",
    am: "አገልግል",
    icon: "✧",
    b: "Every member is called to serve — in worship, with the children, welcoming guests, in prayer, or on mission. Tell us your gifts and we'll help you find where God is calling you. From this house, we go out to the city, to Ethiopia, and to the nations.",
  },
];

const CONTACT_ROWS = [
  { t: "Silver Spring", v: "hello@addislidet.org", p: "(301) 555-0148" },
  { t: "Alexandria", v: "alexandria@addislidet.org", p: "(703) 555-0219" },
  {
    t: "Prayer line",
    v: "prayer@addislidet.org",
    p: "Answered within the hour",
  },
];

const CONNECT_ROLES = [
  { v: "new", l: "I'm new — tell me more" },
  { v: "visit", l: "I'm planning my first visit" },
  { v: "group", l: "Join a life group" },
  { v: "serve", l: "I want to serve" },
  { v: "prayer", l: "Request prayer" },
];

function ConnectHero() {
  return (
    <section className="cn-hero">
      <div className="container-wide cn-hero__inner">
        <div className="cn-hero__rule">
          <span>WELCOME · 0.0</span>
          <span>·</span>
          <span>YOU'VE FOUND THE DOOR</span>
        </div>
        <h1 className="cn-hero__title">
          <span>Don't just</span>
          <em>attend —</em>
          <u>belong.</u>
        </h1>
        <div className="cn-hero__lower">
          <p className="cn-hero__p">
            Faith was never meant to be lived alone. Whatever season you're in —
            first-time visitor, returning believer, skeptic-but-curious —
            there's a group, a ministry, or a conversation waiting for you.
          </p>
          <div className="cn-hero__actions">
            <a href="#pathway" className="btn btn--primary btn--lg">
              Walk the pathway <ArrowIcon />
            </a>
            <a href="#form" className="btn btn--ghost-cream btn--lg">
              Say hello first
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pathway() {
  return (
    <section id="pathway" className="pw-section">
      <div className="container-wide">
        <div className="pw-header">
          <div>
            <div className="eyebrow" style={{ color: "var(--gold)" }}>
              The pathway · የእምነት ጉዞ
            </div>
            <h2 className="pw-title">
              Five steps,
              <br />
              walking together.
            </h2>
          </div>
          <p className="pw-p">
            At Addis Lidet, no one comes alone and no one stays a stranger. From
            your first Sunday, a brother or sister is walking with you — praying
            for you, sharing meals with you, and helping you find your place in
            God's family.
          </p>
        </div>
      </div>
      <div className="pw-track">
        <div className="pw-rail" />
        <ol className="pw-list">
          {PATHWAY_STEPS.map((s, i) => (
            <li key={i} className="pw-item">
              <div className="pw-node">
                <span className="pw-dot" />
                <span className="pw-num">{s.n}</span>
                <span className="pw-meta">{s.day}</span>
              </div>
              <div className="pw-card">
                <div className="pw-glyph">{s.icon}</div>
                <h3 className="pw-t">{s.t}</h3>
                <div className="pw-am">{s.am}</div>
                <p className="pw-b">{s.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="pw-hint">
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

function ConnectForm() {
  const [role, setRole] = useState("new");
  const [campus, setCampus] = useState("");
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    note: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Thanks! (Demo form — not yet live.)");
  };

  return (
    <section id="form" className="cf-section">
      <div className="container-wide">
        <div className="cf-grid">
          {/* Left column */}
          <div>
            <div
              className="eyebrow"
              style={{ marginBottom: 18, color: "var(--ink-muted)" }}
            >
              Say hello
            </div>
            <h2 className="cf-contact-title">Let's talk.</h2>
            <p className="cf-contact-p">
              We read every message personally. A pastor or ministry lead will
              follow up within two business days — no mailing list, no spam.
            </p>
            {CONTACT_ROWS.map((x, i) => (
              <div key={i} className="cf-contact-row">
                <div className="cf-contact-loc">{x.t}</div>
                <div>
                  <div className="cf-contact-val">{x.v}</div>
                  <div className="cf-contact-sub">{x.p}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Form card */}
          <form onSubmit={handleSubmit} className="cf-form-card">
            <fieldset
              style={{ border: 0, padding: 0, margin: 0, marginBottom: 28 }}
            >
              <legend className="cf-label-text">I'd like to…</legend>
              {CONNECT_ROLES.map((r) => (
                <label
                  key={r.v}
                  className={`cf-radio${role === r.v ? " cf-radio--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.v}
                    checked={role === r.v}
                    onChange={() => setRole(r.v)}
                    className="sr-only"
                  />
                  <span className="cf-radio__dot" aria-hidden="true" />
                  {r.l}
                </label>
              ))}
            </fieldset>

            <div className="cf-field-row">
              <label className="cf-field">
                <span className="cf-label-text">First name</span>
                <input
                  type="text"
                  value={values.name}
                  onChange={(e) =>
                    setValues({ ...values, name: e.target.value })
                  }
                  placeholder="Hanna"
                />
              </label>
              <label className="cf-field">
                <span className="cf-label-text">Email</span>
                <input
                  type="email"
                  value={values.email}
                  onChange={(e) =>
                    setValues({ ...values, email: e.target.value })
                  }
                  placeholder="you@email.com"
                />
              </label>
            </div>

            <label className="cf-field">
              <span className="cf-label-text">Campus</span>
              <select
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
              >
                <option value="" disabled>
                  Choose one
                </option>
                <option value="md">Maryland — Silver Spring</option>
                <option value="va">Virginia — Alexandria</option>
                <option value="online">Either / online</option>
              </select>
            </label>

            <label className="cf-field">
              <span className="cf-label-text">Phone (optional)</span>
              <input
                type="tel"
                value={values.phone}
                onChange={(e) =>
                  setValues({ ...values, phone: e.target.value })
                }
                placeholder="(___) ___-____"
              />
            </label>

            <label className="cf-field">
              <span className="cf-label-text">Anything we should know?</span>
              <textarea
                rows={5}
                value={values.note}
                onChange={(e) => setValues({ ...values, note: e.target.value })}
                placeholder="Questions, prayer requests, a life group you're curious about…"
              />
            </label>

            <button type="submit" className="cf-submit">
              Send message <ArrowIcon />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

const ConnectPage = () => {
  useHashScroll();
  return (
    <div className="landing-root">
      <LandingNav />
      <main id="main-content">
        <ConnectHero />
        <Pathway />
        <ConnectForm />
      </main>
      <LandingFooter />
    </div>
  );
};

export default ConnectPage;
