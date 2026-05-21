import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import "../landing.css";

type Way = { code: string; t: string; b: string; href?: string };

const OTHER_WAYS: Way[] = [
  { code: "PP–01",   t: "PayPal",                  b: "Donate with debit or credit card via PayPal · @addislidetchurch", href: "https://www.paypal.com/paypalme/addislidetchurch?country.x=US&locale.x=en_US" },
  { code: "ZEL–02",  t: "Zelle",                   b: "Send directly from your bank app · (240) 505-5310" },
  { code: "VEN–03",  t: "Venmo",                   b: "Quick mobile giving · @Addis-Lidet", href: "https://account.venmo.com/u/Addis-Lidet" },
  { code: "TXT–04",  t: "Text to give",            b: "Text your dollar amount to +1 (888) 494-6651 · first-time givers will be prompted to register a card." },
  { code: "CHK–05",  t: "Mail a check",            b: "Payable to \"Addis Lidet Int. Church\" · 11961 Tech Rd, Silver Spring, MD 20906." },
  { code: "IN–06",   t: "In person",               b: "Drop your gift in the offering box at either campus during service. No envelope required — our finance team will issue a receipt." },
];

function GiveHero() {
  return (
    <section className="gv-hero">
      <div className="container-wide gv-hero__inner">
        <div className="gv-hero__rule">
          <span>I.</span>
          <span>GIVE</span>
        </div>
        <h1 className="gv-hero__title">
          <span>Give</span>
          <em>Online.</em>
        </h1>
        <div className="gv-hero__footer">
          <p className="gv-hero__lede">
            Your generosity helps us continue serving our church family,
            supporting missions, and reaching communities with the gospel.
            Thank you for partnering with us through giving.
          </p>
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
            <div className="op-aside__sig" style={{ color: "var(--accent)" }}>II.</div>
            <div className="op-aside__label">OTHER WAYS</div>
            <h2>Other ways to give.</h2>
          </div>
          <p>PayPal, Zelle, Venmo, text, check, or in person — pick whatever is easiest. Every gift is tax-deductible.</p>
        </div>
        <div className="ow-ledger">
          <div className="ow-ledger__head">
            <span>REF</span>
            <span>METHOD</span>
            <span>NOTES</span>
            <span />
          </div>
          {OTHER_WAYS.map((r, i) => {
            const inner = (
              <>
                <span className="ow-code">{r.code}</span>
                <span className="ow-method">{r.t}</span>
                <span className="ow-notes">{r.b}</span>
                <span className="ow-arrow">→</span>
              </>
            );
            return r.href ? (
              <a
                key={i}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="ow-ledger__row ow-ledger__row--link"
              >
                {inner}
              </a>
            ) : (
              <div key={i} className="ow-ledger__row">{inner}</div>
            );
          })}
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
      <OtherWays />
    </main>
    <LandingFooter />
  </div>
);

export default GivePage;
