import { useState } from "react";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import "../landing.css";

const ArrowIcon = () => (
  <svg className="arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PATHWAY_STEPS = [
  { n: "01", day: "DAY 01",    t: "Come once",        icon: "☾", b: "Visit a Sunday service. Nothing required. Come in jeans, bring your kids, sit in the back — we'd love to meet you." },
  { n: "02", day: "WEEK 01",   t: "Newcomer coffee",  icon: "☕", b: "Every first Sunday, 12:30pm. Meet the pastors and a few other new faces over coffee and injera." },
  { n: "03", day: "WEEK 02–05",t: "Discovery Class",  icon: "✦",  b: "A four-week journey through what we believe, why we gather, and how this church works. No pressure to 'join' anything." },
  { n: "04", day: "WEEK 06+",  t: "Join a life group", icon: "◉", b: "A weeknight gathering — fewer than 12 people, food, scripture, honesty. This is where friendship lives." },
  { n: "05", day: "ONGOING",   t: "Find your place",  icon: "✧",  b: "Every member serves. Discover the ministry your gifts were made for — worship, kids, hospitality, outreach." },
];

const MINISTRY_GROUPS = [
  { cat: "Family", items: [
    { t: "Kids (0–11)",        b: "A safe, joyful place where children learn the big story of the Bible.",      schedule: "Sundays · both campuses" },
    { t: "Youth (12–17)",      b: "A tribe of middle & high schoolers growing in faith and friendship.",        schedule: "Fridays · 7pm" },
    { t: "Young Adults (18–35)",b: "College, career, and everything in between. Big questions welcome.",        schedule: "Saturdays · 7pm" },
    { t: "Women",              b: "Bible study, mentorship, retreats — a sisterhood across generations.",       schedule: "Tuesdays · 10am" },
    { t: "Men",                b: "Gathering to sharpen each other with scripture, prayer, and plain speech.",  schedule: "Saturdays · 7am" },
    { t: "Marriages",          b: "Tools, mentors, and community for every season of marriage.",                schedule: "Quarterly workshops" },
  ]},
  { cat: "Grow", items: [
    { t: "Life Groups",    b: "Weekly gatherings of 8–12 people, meeting in homes across DMV.",                schedule: "Multiple nights" },
    { t: "Discovery Class",b: "New here? Start with our four-week welcome + foundations class.",              schedule: "First Sunday" },
    { t: "Bible School",   b: "A 9-month intensive in biblical foundations, theology, and formation.",        schedule: "Sept–May" },
    { t: "Prayer Ministry",b: "Friday overnight prayer + prayer teams at every service.",                    schedule: "Fridays · overnight" },
  ]},
  { cat: "Serve", items: [
    { t: "Worship Arts",   b: "Vocalists, musicians, sound, lights, and production teams.",                   schedule: "Weekly rehearsal" },
    { t: "Hospitality",    b: "Greeters, ushers, coffee, set-up, and first-impression teams.",               schedule: "Rotating Sundays" },
    { t: "Tech & Media",   b: "Livestream, video, photography, and design for the church.",                  schedule: "Weekly" },
    { t: "Local Outreach", b: "Serving Montgomery & Fairfax neighbors through our partners.",                schedule: "Monthly projects" },
    { t: "Global Mission", b: "Short- and long-term trips to our partner churches overseas.",                 schedule: "Yearly trips" },
    { t: "Benevolence",    b: "Walking with families through financial & life crises.",                       schedule: "As needed" },
  ]},
];

const CONTACT_ROWS = [
  { t: "Silver Spring",  v: "hello@addislidet.org",      p: "(301) 555-0148" },
  { t: "Alexandria",     v: "alexandria@addislidet.org",  p: "(703) 555-0219" },
  { t: "Prayer line",    v: "prayer@addislidet.org",      p: "Answered within the hour" },
];

const CONNECT_ROLES = [
  { v: "new",    l: "I'm new — tell me more" },
  { v: "visit",  l: "I'm planning my first visit" },
  { v: "group",  l: "Join a life group" },
  { v: "serve",  l: "I want to serve" },
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
            Faith was never meant to be lived alone. Whatever season you're in — first-time visitor, returning believer, skeptic-but-curious — there's a group, a ministry, or a conversation waiting for you.
          </p>
          <div className="cn-hero__actions">
            <a href="#pathway" className="btn btn--primary btn--lg">Walk the pathway <ArrowIcon /></a>
            <a href="#form" className="btn btn--ghost-cream btn--lg">Say hello first</a>
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
            <div className="eyebrow" style={{ color: "var(--gold)" }}>The pathway</div>
            <h2 className="pw-title">Five steps,<br />at your pace.</h2>
          </div>
          <p className="pw-p">A gentle on-ramp from first visit to fully planted. Nobody walks it alone — an elder or life-group host is assigned to every person who steps on.</p>
        </div>
        <ol className="pw-list">
          {PATHWAY_STEPS.map((s, i) => (
            <li key={i} className="pw-step">
              <div className="pw-step__rail" />
              <div className="pw-step__node"><span>{s.n}</span></div>
              <div className="pw-step__meta">{s.day}</div>
              <div className="pw-step__card">
                <div className="pw-step__glyph">{s.icon}</div>
                <h3>{s.t}</h3>
                <p>{s.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Ministries() {
  const [tab, setTab] = useState(0);

  return (
    <section className="mn-section">
      <div className="container-wide">
        <div className="mn-header">
          <div>
            <div className="eyebrow" style={{ color: "var(--gold)" }}>Ministries</div>
            <h2>Find your people.</h2>
          </div>
          <div className="mn-chips">
            {MINISTRY_GROUPS.map((g, i) => (
              <button
                key={g.cat}
                onClick={() => setTab(i)}
                className={`mn-chip${tab === i ? " mn-chip--on" : " mn-chip--off"}`}
              >
                {g.cat}
              </button>
            ))}
          </div>
        </div>
        <div className="mn-grid">
          {MINISTRY_GROUPS[tab].items.map((m, i) => (
            <article key={i} className="mn-card">
              <div className="mn-card__num">{String(i + 1).padStart(2, "0")}</div>
              <h3>{m.t}</h3>
              <p>{m.b}</p>
              <div className="mn-card__sched">
                <span className="mn-card__dot" />
                {m.schedule}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectForm() {
  const [role, setRole] = useState("new");
  const [campus, setCampus] = useState("");
  const [values, setValues] = useState({ name: "", email: "", phone: "", note: "" });

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
            <div className="eyebrow" style={{ marginBottom: 18, color: "var(--ink-muted)" }}>Say hello</div>
            <h2 className="cf-contact-title">Let's talk.</h2>
            <p className="cf-contact-p">
              We read every message personally. A pastor or ministry lead will follow up within two business days — no mailing list, no spam.
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
            <span className="cf-label-text">I'd like to…</span>
            <div style={{ marginBottom: 28 }}>
              {CONNECT_ROLES.map((r) => (
                <label
                  key={r.v}
                  className={`cf-radio${role === r.v ? " cf-radio--active" : ""}`}
                  onClick={() => setRole(r.v)}
                >
                  <input type="radio" name="role" checked={role === r.v} onChange={() => setRole(r.v)} style={{ display: "none" }} />
                  <span className="cf-radio__dot" />
                  {r.l}
                </label>
              ))}
            </div>

            <div className="cf-field-row">
              <label className="cf-field">
                <span className="cf-label-text">First name</span>
                <input type="text" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Hanna" />
              </label>
              <label className="cf-field">
                <span className="cf-label-text">Email</span>
                <input type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="you@email.com" />
              </label>
            </div>

            <label className="cf-field">
              <span className="cf-label-text">Campus</span>
              <select value={campus} onChange={(e) => setCampus(e.target.value)}>
                <option value="" disabled>Choose one</option>
                <option value="md">Maryland — Silver Spring</option>
                <option value="va">Virginia — Alexandria</option>
                <option value="online">Either / online</option>
              </select>
            </label>

            <label className="cf-field">
              <span className="cf-label-text">Phone (optional)</span>
              <input type="tel" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} placeholder="(___) ___-____" />
            </label>

            <label className="cf-field">
              <span className="cf-label-text">Anything we should know?</span>
              <textarea rows={5} value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} placeholder="Questions, prayer requests, a life group you're curious about…" />
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

const ConnectPage = () => (
  <div className="landing-root">
    <LandingNav />
    <ConnectHero />
    <Pathway />
    <Ministries />
    <ConnectForm />
    <LandingFooter />
  </div>
);

export default ConnectPage;
