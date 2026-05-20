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

const LOCATIONS = [
  {
    id: "md",
    name: "Silver Spring",
    state: "Maryland",
    addr: "11961 Tech Rd",
    city: "Silver Spring, MD 20904",
    email: "hello@addislidet.org",
    phone: "(301) 555-0148",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=11961+Tech+Rd+Silver+Spring+MD+20904",
  },
  {
    id: "va",
    name: "Alexandria",
    state: "Virginia",
    addr: "2730 Eisenhower Ave",
    city: "Alexandria, VA 22314",
    email: "alexandria@addislidet.org",
    phone: "(703) 555-0219",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=2730+Eisenhower+Ave+Alexandria+VA+22314",
  },
];

const CONNECT_ROLES = [
  { v: "new", l: "I'm new — tell me more" },
  { v: "visit", l: "I'm planning my first visit" },
  { v: "group", l: "Join a life group" },
  { v: "serve", l: "I want to serve" },
  { v: "prayer", l: "Request prayer" },
];

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
    <section id="form" className="cf-section cf-section--full">
      <div className="container-wide">
        <div className="cf-grid">
          {/* Left column — locations */}
          <div>
            <div
              className="eyebrow"
              style={{ marginBottom: 18, color: "var(--ink-muted)" }}
            >
              Get in touch
            </div>
            <h2 className="cf-contact-title">Let's talk.</h2>
            <p className="cf-contact-p">
              We read every message personally. A pastor or ministry lead will
              follow up within two business days — no mailing list, no spam.
            </p>

            <div className="cf-locations">
              {LOCATIONS.map((loc) => (
                <div key={loc.id} className="cf-location">
                  <div className="cf-location__head">
                    <div className="cf-location__name">{loc.name}</div>
                    <div className="cf-location__state">{loc.state}</div>
                  </div>
                  <div className="cf-location__addr">
                    {loc.addr}
                    <br />
                    {loc.city}
                  </div>
                  <div className="cf-location__contact">
                    <div>{loc.email}</div>
                    <div className="cf-contact-sub">{loc.phone}</div>
                  </div>
                  <a
                    href={loc.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cf-location__cta"
                  >
                    Get directions →
                  </a>
                </div>
              ))}
            </div>
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
        <ConnectForm />
      </main>
      <LandingFooter />
    </div>
  );
};

export default ConnectPage;
