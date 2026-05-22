import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import ArrowIcon from "../components/ArrowIcon";
import { supabase } from "@/integrations/supabase/client";
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

const CAMPUS_LABELS: Record<string, string> = {
  md: "Maryland — Silver Spring",
  va: "Virginia — Alexandria",
  online: "Either / online",
};

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function ConnectForm() {
  const [role, setRole] = useState("new");
  const [campus, setCampus] = useState("");
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    note: "",
  });
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status.kind === "submitting") return;

    const name = values.name.trim();
    const email = values.email.trim();
    if (!name || !email) {
      setStatus({
        kind: "error",
        message: "Please share your first name and email so we can follow up.",
      });
      return;
    }

    setStatus({ kind: "submitting" });

    const roleLabel =
      CONNECT_ROLES.find((r) => r.v === role)?.l ?? role;
    const campusLabel = campus ? CAMPUS_LABELS[campus] ?? campus : "";

    try {
      const { error } = await supabase.functions.invoke(
        "send-connect-message",
        {
          body: {
            role,
            roleLabel,
            name,
            email,
            phone: values.phone.trim(),
            campus,
            campusLabel,
            note: values.note.trim(),
          },
        }
      );

      if (error) throw error;

      setStatus({ kind: "success" });
      setValues({ name: "", email: "", phone: "", note: "" });
      setCampus("");
      setRole("new");
    } catch (err) {
      console.error("Failed to send connect message:", err);
      setStatus({
        kind: "error",
        message:
          "Sorry — we couldn't send your message. Please try again, or email hello@addislidet.org.",
      });
    }
  };

  const submitting = status.kind === "submitting";

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

            <button
              type="submit"
              className="cf-submit"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "Sending…" : "Send message"} <ArrowIcon />
            </button>

            {status.kind === "success" && (
              <p
                role="status"
                style={{
                  marginTop: 16,
                  color: "var(--ink-muted, #9ca3af)",
                  fontSize: 14,
                }}
              >
                Thanks — your message is on the way. A pastor or ministry lead
                will follow up within two business days.
              </p>
            )}
            {status.kind === "error" && (
              <p
                role="alert"
                style={{
                  marginTop: 16,
                  color: "#fca5a5",
                  fontSize: 14,
                }}
              >
                {status.message}
              </p>
            )}
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
