import { useState } from "react";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import ArrowIcon from "../components/ArrowIcon";
import "../landing.css";

const FUNDS: Record<string, { label: string; sub: string; color: string }> = {
  general:     { label: "General Fund",         sub: "Where needed most",          color: "var(--gold)" },
  missions:    { label: "ALIC Mission",          sub: "Ethiopia & East Africa",     color: "var(--accent-soft)" },
  building:    { label: "Building Fund",         sub: "Tech Road renovation",       color: "#4caf8a" },
  benevolence: { label: "Benevolence",           sub: "Families in crisis",         color: "var(--cream)" },
  youth:       { label: "Youth & Young Adult",   sub: "Next generation",            color: "var(--gold-bright)" },
};

const OTHER_WAYS = [
  { code: "IN–01",   t: "In person",              b: "Drop your gift in the offering box at either campus during service. No envelope required — our finance team will issue a receipt." },
  { code: "MAIL–02", t: "Mail a check",            b: "Payable to \"Addis Lidet International Church\" · 11961 Tech Rd, Silver Spring, MD 20904." },
  { code: "ACH–03",  t: "ACH / Bank transfer",     b: "For recurring gifts over $500, ACH avoids processing fees entirely. Email finance@addislidet.org for account details." },
  { code: "STK–04",  t: "Stock & appreciated assets",b: "Gifts of stock, mutual funds, or crypto can offer significant tax advantages. We walk you through it step by step." },
  { code: "EST–05",  t: "Estate & legacy",         b: "Include Addis Lidet in your will or trust. Our finance team can share suggested language and confirm our legal name." },
  { code: "MAT–06",  t: "Employer match",          b: "Many companies double their employees' giving. Ask your HR team — we're happy to fill out whatever paperwork they need." },
];

const IMPACT_ROWS = [
  { n: 62, l: "Weekly worship & teaching",  s: "Pastors, staff, sound, translation, childcare, building operations at both campuses.",     color: "var(--accent)" },
  { n: 18, l: "Missions & partnerships",    s: "Partner churches and missionaries in Ethiopia, Kenya, and DRC.",                           color: "var(--gold-bright)" },
  { n: 12, l: "Local compassion",           s: "Benevolence, community meals, partnerships with Montgomery and Fairfax nonprofits.",       color: "#4caf8a" },
  { n: 8,  l: "Leadership development",     s: "Training our next generation of deacons, preachers, worship leaders, and planters.",       color: "var(--ink)" },
];

const PRESET_AMOUNTS = [25, 50, 100, 250, 500, 1000];

function GiveHero() {
  return (
    <section className="gv-hero">
      <div className="container-wide gv-hero__inner">
        <div className="gv-hero__rule">
          <span>I.</span>
          <span>AN ACT OF WORSHIP</span>
          <span>—</span>
          <span>2 COR. 9:7</span>
        </div>
        <h1 className="gv-hero__title">
          <span>Give as</span>
          <em>you have</em>
          <span>decided in</span>
          <u>your heart.</u>
        </h1>
        <div className="gv-hero__footer">
          <p className="gv-hero__lede">
            A gift is a sentence in a long family story. Yours helps us keep the doors open, the lights on Sunday, and the gospel moving — in Silver Spring, Alexandria, and every place our missionaries carry it.
          </p>
          <div className="gv-hero__chips">
            <span className="gv-chip">TAX-DEDUCTIBLE</span>
            <span className="gv-chip">501(c)(3)</span>
            <span className="gv-chip">EIN 26-3519442</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function OfferingPlate() {
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [freq, setFreq] = useState("once");
  const [fund, setFund] = useState("general");

  const effective = custom ? parseFloat(custom) || 0 : amount;
  const multiplier: Record<string, number> = { once: 1, weekly: 52, monthly: 12 };
  const annual = effective * multiplier[freq];
  const year = new Date().getFullYear();

  return (
    <section className="op-section">
      <div className="container-wide">
        <div className="op-layout">
          {/* Left: liturgical column */}
          <aside>
            <div className="op-aside__sig">II.</div>
            <div className="op-aside__label">THE OFFERING</div>
            <h2 className="op-aside__h">Place your gift<br />on the plate.</h2>
            <p className="op-aside__p">
              Secured by tithe.ly. Receipts sent immediately. Recurring gifts can be paused or edited anytime from your member portal.
            </p>
            <div className="op-verse">
              <div className="op-verse__body">
                Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.
              </div>
              <div className="op-verse__cite">— 2 CORINTHIANS 9:7</div>
            </div>
          </aside>

          {/* Right: plate / envelope */}
          <div className="op-plate">
            <div className="op-plate__top">
              <div>
                <div className="op-plate__eyebrow">Gift slip · 01-{year}</div>
                <div className="op-plate__title">Offering</div>
              </div>
              <div className="op-plate__seal" aria-hidden="true">
                <div className="op-plate__seal-text">ADDIS LIDET<br />INT'L CHURCH</div>
                <div className="op-plate__seal-mark">A</div>
              </div>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="op-form">
              {/* Frequency */}
              <div className="op-row">
                <label className="op-row__label">Frequency</label>
                <div className="op-freq">
                  {[{ v: "once", l: "One-time" }, { v: "weekly", l: "Weekly" }, { v: "monthly", l: "Monthly" }].map((o) => (
                    <button key={o.v} type="button" className={`op-freq__btn${freq === o.v ? " is-on" : ""}`} onClick={() => setFreq(o.v)}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fund */}
              <div className="op-row">
                <label className="op-row__label">Designate</label>
                <div className="op-funds">
                  {Object.entries(FUNDS).map(([k, f]) => (
                    <button
                      key={k} type="button"
                      className={`op-fund${fund === k ? " is-on" : ""}`}
                      style={{ "--fund-color": f.color } as React.CSSProperties}
                      onClick={() => setFund(k)}
                    >
                      <span className="op-fund__dot" style={{ background: f.color }} />
                      <span className="op-fund__label">{f.label}</span>
                      <span className="op-fund__sub">{f.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="op-row">
                <label className="op-row__label">Amount</label>
                <div className="op-amts">
                  {PRESET_AMOUNTS.map((a) => (
                    <button key={a} type="button"
                      className={`op-amt${amount === a && !custom ? " is-on" : ""}`}
                      onClick={() => { setAmount(a); setCustom(""); }}
                    >
                      <span className="op-amt__cur">$</span>{a}
                    </button>
                  ))}
                </div>
                <div className="op-custom">
                  <span className="op-custom__prefix">$</span>
                  <input
                    type="text" inputMode="decimal"
                    placeholder="Enter a different amount"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="op-summary">
                <div className="op-summary__row">
                  <span>Gift</span>
                  <span>${effective.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="op-summary__row">
                  <span>Frequency</span>
                  <span style={{ textTransform: "capitalize" }}>{freq}</span>
                </div>
                <div className="op-summary__row">
                  <span>Fund</span>
                  <span>{FUNDS[fund].label}</span>
                </div>
                {freq !== "once" && effective > 0 && (
                  <div className="op-summary__total">
                    <span>Annual impact</span>
                    <span>${annual.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <button type="submit" className="op-submit" disabled={effective <= 0}>
                <span>Place {freq === "once" ? "this gift" : `recurring ${freq} gift`}</span>
                <ArrowIcon />
              </button>

              <div className="op-foot">
                <span>TITHE.LY · STRIPE · SSL</span>
                <span>RECEIPT WITHIN MINUTES</span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function OtherWays() {
  return (
    <section className="ow-section">
      <div className="container-wide">
        <div className="ow-header">
          <div>
            <div className="op-aside__sig" style={{ color: "var(--accent)" }}>III.</div>
            <div className="op-aside__label">OTHER WAYS</div>
            <h2>Not a donate button?<br />Still an act of worship.</h2>
          </div>
          <p>Online is easiest — but stock, ACH, and mailed checks are welcome too. Every gift is tax-deductible.</p>
        </div>
        <div className="ow-ledger">
          <div className="ow-ledger__head">
            <span>REF</span>
            <span>METHOD</span>
            <span>NOTES</span>
            <span />
          </div>
          {OTHER_WAYS.map((r, i) => (
            <div key={i} className="ow-ledger__row">
              <span className="ow-code">{r.code}</span>
              <span className="ow-method">{r.t}</span>
              <span className="ow-notes">{r.b}</span>
              <span className="ow-arrow">→</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Impact() {
  return (
    <section className="im-section">
      <div className="container-wide">
        <div className="im-top">
          <div>
            <div className="op-aside__label" style={{ color: "var(--ink-muted)" }}>IV. FY 2025 BUDGET · ALLOCATION</div>
            <h2 className="im-title">A family,<br />not a fundraiser.</h2>
          </div>
          <p className="im-p">
            Your gift is stewarded transparently. Every dollar passes through two-signature approvals; every year's numbers are published and open to any member.
          </p>
        </div>

        {/* Proportional bar */}
        <div className="im-bar" aria-hidden="true">
          {IMPACT_ROWS.map((r, i) => (
            <div key={i} className="im-bar__seg" style={{ flex: r.n, background: r.color }}>
              <span>{r.n}%</span>
            </div>
          ))}
        </div>

        <div className="im-grid">
          {IMPACT_ROWS.map((r, i) => (
            <div key={i} className="im-cell">
              <div className="im-cell__swatch" style={{ background: r.color }} />
              <div className="im-cell__pct">{r.n}<small>%</small></div>
              <div className="im-cell__t">{r.l}</div>
              <div className="im-cell__s">{r.s}</div>
            </div>
          ))}
        </div>

        <div className="im-foot">
          <span>FULL ANNUAL REPORT · published each March · ask any elder for a copy</span>
          <a href="#" className="im-foot__link">Download FY24 report ↓</a>
        </div>
      </div>
    </section>
  );
}

const GivePage = () => (
  <div className="landing-root">
    <LandingNav />
    <main id="main-content">
      <GiveHero />
      <OfferingPlate />
      <OtherWays />
      <Impact />
    </main>
    <LandingFooter />
  </div>
);

export default GivePage;
