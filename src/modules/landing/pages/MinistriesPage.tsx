import { useMemo } from "react";
import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import PhotoSlot from "../components/PhotoSlot";
import ArrowIcon from "../components/ArrowIcon";
import { useI18n } from "../components/useI18n";
import {
  MINISTRIES,
  CATEGORY_LABELS,
  CAMPUSES,
  TESTIMONIALS,
  type Bilingual,
  type Ministry,
  type MinistryCategory,
} from "../content/ministries";
import "../landing.css";

/* ─────────────────────────────────────────────────────────
   i18n helpers — bilingual fields { en, am? } with fallback
   ─────────────────────────────────────────────────────── */

type Lang = "en" | "am";

function pick(field: Bilingual | null | undefined, lang: Lang): string {
  if (!field) return "";
  if (lang === "am" && field.am) return field.am;
  return field.en ?? "";
}

/* ─────────────────────────────────────────────────────────
   Hero
   ─────────────────────────────────────────────────────── */

function Hero({ lang }: { lang: Lang }) {
  return (
    <section className="min-hero">
      <div className="container-wide">
        <div className="eyebrow" style={{ marginBottom: 36 }}>
          {lang === "am" ? "አገልግሎቶች" : "Ministries · አገልግሎቶች"}
        </div>
        <h1 className="min-hero__title">
          {lang === "am" ? (
            <>
              <span>በአዲስ ልደት</span>
              <span>
                <em>ቦታህን</em> አግኝ
              </span>
            </>
          ) : (
            <>
              <span>Find your place</span>
              <span>
                at <em>Addis Lidet.</em>
              </span>
            </>
          )}
        </h1>
        <p className="min-hero__lede">
          {lang === "am"
            ? "ለእያንዳንዱ ዕድሜ፣ ለእያንዳንዱ የሕይወት ምዕራፍ፣ ለእያንዳንዱ ስጦታ። በዚህ ቤተክርስቲያን ውስጥ ቤተሰብ አለ። በክርስቶስ ውስጥ አብረን ለማገልገል እንመጣለን።"
            : "There's a ministry for every age, every stage of life, and every gift. We believe in serving together as a family in Christ, and there's a place here for you."}
        </p>
        <div className="min-hero__ctas">
          <a href="#connect" className="btn btn--gold btn--lg">
            {lang === "am" ? "ተገናኝ" : "Get Connected"} <ArrowIcon />
          </a>
          <Link to="/locations" className="btn btn--ghost btn--lg">
            {lang === "am"
              ? "በዚህ እሁድ ጎብኙን"
              : "Visit Us This Sunday"}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Featured ministries (large cards)
   ─────────────────────────────────────────────────────── */

function FeaturedCard({
  m,
  index,
  lang,
}: {
  m: Ministry;
  index: number;
  lang: Lang;
}) {
  const reverse = index % 2 === 1;
  const isExternal = /^https?:/i.test(m.ctaHref);
  return (
    <article className={`min-card${reverse ? " min-card--rev" : ""}`}>
      <div className="min-card__media">
        <PhotoSlot
          label={`${pick(m.name, "en")} — placeholder for real church photo`}
          src={m.photo ?? undefined}
          className="min-card__photo"
          paper
        />
        <span className="min-card__num">0{index + 1}</span>
      </div>

      <div className="min-card__body">
        <header className="min-card__head">
          {m.name.am && lang === "en" && (
            <div className="min-card__amh">{m.name.am}</div>
          )}
          <h2 className="min-card__name">{pick(m.name, lang)}</h2>
          <p className="min-card__for">{pick(m.forWhom, lang)}</p>
        </header>

        <p className="min-card__desc">{pick(m.description, lang)}</p>

        <dl className="min-card__meta">
          {m.meets && (
            <div>
              <dt>{lang === "am" ? "ጊዜ" : "Meets"}</dt>
              <dd>{pick(m.meets, lang)}</dd>
            </div>
          )}
          {m.location && (
            <div>
              <dt>{lang === "am" ? "ቦታ" : "Location"}</dt>
              <dd>{pick(m.location, lang)}</dd>
            </div>
          )}
        </dl>

        {(m.leader.name || m.leader.email) && (
          <div className="min-card__leader">
            <div className="min-card__leader-info">
              <div className="min-card__leader-eyebrow">
                {lang === "am" ? "ለማነጋገር" : "Your contact"}
              </div>
              {m.leader.name && (
                <div className="min-card__leader-name">{m.leader.name}</div>
              )}
              {m.leader.role && (
                <div className="min-card__leader-role">{m.leader.role}</div>
              )}
              {m.leader.email && (
                <a
                  href={`mailto:${m.leader.email}`}
                  className="min-card__leader-email"
                >
                  {m.leader.email}
                </a>
              )}
            </div>
          </div>
        )}

        <div className="min-card__cta-row">
          {isExternal ? (
            <a
              href={m.ctaHref}
              target="_blank"
              rel="noreferrer"
              className="btn btn--gold btn--lg"
            >
              {pick(m.ctaLabel, lang)} <ArrowIcon />
            </a>
          ) : (
            <Link to={m.ctaHref} className="btn btn--gold btn--lg">
              {pick(m.ctaLabel, lang)} <ArrowIcon />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function FeaturedSection({
  ministries,
  lang,
}: {
  ministries: Ministry[];
  lang: Lang;
}) {
  if (ministries.length === 0) return null;
  return (
    <section className="min-feats">
      <div className="container-wide">
        <header className="min-feats__head">
          <div>
            <div className="eyebrow eyebrow--gold">
              {lang === "am" ? "የተመረጡ አገልግሎቶች" : "Featured Ministries"}
            </div>
            <h2 className="min-feats__title">
              {lang === "am" ? (
                <>
                  ቤተሰቡን <em>የሚገልጡ</em> ቦታዎች።
                </>
              ) : (
                <>
                  Where the family <em>gathers.</em>
                </>
              )}
            </h2>
          </div>
          <p className="min-feats__lede">
            {lang === "am"
              ? "ለአዲስ ጎብኚዎች መጀመሪያ የምንመለከታቸው አገልግሎቶች።"
              : "If you're new and wondering where to start, these are the ministries we'd point you to first."}
          </p>
        </header>

        <div className="min-feats__list">
          {ministries.map((m, i) => (
            <FeaturedCard key={m.key} m={m} index={i} lang={lang} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Categorized grid (the rest)
   ─────────────────────────────────────────────────────── */

function MiniCard({ m, lang }: { m: Ministry; lang: Lang }) {
  const isExternal = /^https?:/i.test(m.ctaHref);
  return (
    <article className="min-mini">
      <div className="min-mini__head">
        {m.name.am && lang === "en" && (
          <div className="min-mini__amh">{m.name.am}</div>
        )}
        <h3 className="min-mini__name">{pick(m.name, lang)}</h3>
      </div>
      {pick(m.forWhom, lang) && (
        <p className="min-mini__for">{pick(m.forWhom, lang)}</p>
      )}
      {pick(m.description, lang) && (
        <p className="min-mini__desc">{pick(m.description, lang)}</p>
      )}
      {(m.meets || m.location) && (
        <dl className="min-mini__meta">
          {m.meets && (
            <div>
              <dt>{lang === "am" ? "ጊዜ" : "Meets"}</dt>
              <dd>{pick(m.meets, lang)}</dd>
            </div>
          )}
          {m.location && (
            <div>
              <dt>{lang === "am" ? "ቦታ" : "Location"}</dt>
              <dd>{pick(m.location, lang)}</dd>
            </div>
          )}
        </dl>
      )}
      {isExternal ? (
        <a
          href={m.ctaHref}
          target="_blank"
          rel="noreferrer"
          className="min-mini__cta"
        >
          {pick(m.ctaLabel, lang)} →
        </a>
      ) : (
        <Link to={m.ctaHref} className="min-mini__cta">
          {pick(m.ctaLabel, lang)} →
        </Link>
      )}
    </article>
  );
}

function CategorizedGrid({
  ministries,
  lang,
}: {
  ministries: Ministry[];
  lang: Lang;
}) {
  const order: MinistryCategory[] = [
    "worship",
    "lifestage",
    "community",
    "outreach",
  ];
  const grouped = order
    .map((cat) => ({
      cat,
      items: ministries.filter((m) => m.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  if (grouped.length === 0) return null;

  return (
    <section className="min-cats">
      <div className="container-wide">
        <header className="min-cats__head">
          <div>
            <div className="eyebrow eyebrow--dark">
              {lang === "am" ? "ሁሉም አገልግሎቶች" : "All Ministries"}
            </div>
            <h2 className="min-cats__title">
              {lang === "am" ? (
                <>
                  በምድብ <em>አስስ።</em>
                </>
              ) : (
                <>
                  Browse by <em>category.</em>
                </>
              )}
            </h2>
          </div>
          <p className="min-cats__lede">
            {lang === "am"
              ? "በሕይወት ምዕራፍ እና ፍላጎት የተደራጁ።"
              : "Organized by life stage and area of service so you can find your fit fast."}
          </p>
        </header>

        <div className="min-cats__list">
          {grouped.map(({ cat, items }) => (
            <div key={cat} className="min-cat">
              <header className="min-cat__head">
                <h3 className="min-cat__label">
                  {pick(CATEGORY_LABELS[cat], lang)}
                </h3>
              </header>
              <div className="min-cat__grid">
                {items.map((m) => (
                  <MiniCard key={m.key} m={m} lang={lang} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Testimonials — only render published; otherwise show
   a single dev-visible placeholder banner
   ─────────────────────────────────────────────────────── */

function Testimonials({ lang }: { lang: Lang }) {
  const live = TESTIMONIALS.filter((t) => t.published);
  if (live.length === 0) {
    // Render nothing on the public page until a real quote is collected.
    // (Switch this branch on if leadership wants a "stories coming soon"
    // teaser visible. For now, keep the page honest.)
    return null;
  }
  return (
    <section className="min-quotes">
      <div className="container-wide">
        <div className="eyebrow eyebrow--gold" style={{ marginBottom: 16 }}>
          {lang === "am" ? "ከቤተሰቡ" : "From the family"}
        </div>
        <h2 className="min-quotes__title">
          {lang === "am" ? (
            <>
              አባላት <em>እንዲህ ይላሉ።</em>
            </>
          ) : (
            <>
              What members <em>actually say.</em>
            </>
          )}
        </h2>

        <div className="min-quotes__grid">
          {live.map((t, i) => (
            <figure key={i} className="min-quote">
              <span className="min-quote__mark">"</span>
              <blockquote>
                <p>{pick(t.quote, lang)}</p>
              </blockquote>
              <figcaption>
                {t.photo && (
                  <div className="min-quote__avatar">
                    <PhotoSlot
                      label={`${t.name ?? "Member"} portrait`}
                      src={t.photo}
                      className="min-quote__avatar-img"
                      paper
                    />
                  </div>
                )}
                <div className="min-quote__who">
                  {t.name && <div className="min-quote__name">{t.name}</div>}
                  {t.role && <div className="min-quote__role">{t.role}</div>}
                  {t.ministry && (
                    <div className="min-quote__min">on {t.ministry}</div>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   "New Here? Let's Talk." form
   ─────────────────────────────────────────────────────── */

function ConnectForm({
  ministries,
  lang,
}: {
  ministries: Ministry[];
  lang: Lang;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Submission wiring is the dev team's call (mailto, form service, or
    // backend endpoint). For the prototype, defer to /connect.
    window.location.href = "/connect";
  };

  return (
    <section id="connect" className="min-connect">
      <div className="container-wide">
        <div className="min-connect__inner">
          <div className="min-connect__intro">
            <div className="eyebrow eyebrow--gold" style={{ marginBottom: 16 }}>
              {lang === "am" ? "በአዲስ ነህ?" : "Not sure where to start?"}
            </div>
            <h2 className="min-connect__title">
              {lang === "am" ? (
                <>
                  አዲስ ነህ? <em>እንነጋገር።</em>
                </>
              ) : (
                <>
                  New here? <em>Let's talk.</em>
                </>
              )}
            </h2>
            <p className="min-connect__lede">
              {lang === "am"
                ? "ብዙ ጎብኚዎች ከድረ-ገጽ ላይ አገልግሎት አይመርጡም። በሰው ጋር በመነጋገር ይመርጣሉ። ስለ አንተ ትንሽ ንገረን፣ አንድ የእረኞች ቡድን አባል በ48 ሰዓት ውስጥ ያገኝሃል።"
                : "Most people don't pick a ministry from a website. They pick because someone invited them. Tell us a little about yourself and a pastor or ministry leader will reach out within 48 hours."}
            </p>
          </div>

          <form className="min-form" onSubmit={handleSubmit}>
            <div className="min-form__row">
              <label className="min-form__field">
                <span>{lang === "am" ? "ስም" : "Name"} *</span>
                <input type="text" name="name" required />
              </label>
              <label className="min-form__field">
                <span>{lang === "am" ? "ኢሜል" : "Email"} *</span>
                <input type="email" name="email" required />
              </label>
            </div>

            <div className="min-form__row">
              <label className="min-form__field">
                <span>
                  {lang === "am" ? "ስልክ (አማራጭ)" : "Phone (optional)"}
                </span>
                <input type="tel" name="phone" />
              </label>
              <label className="min-form__field">
                <span>
                  {lang === "am" ? "ቅርብ ቅርንጫፍ" : "Preferred location"}
                </span>
                <select name="campus" defaultValue="">
                  <option value="" disabled>
                    {lang === "am" ? "ምረጥ…" : "Choose one…"}
                  </option>
                  <option value="md">Silver Spring, MD</option>
                  <option value="va">Alexandria, VA</option>
                  <option value="either">
                    {lang === "am" ? "ምንም አይደለም" : "No preference"}
                  </option>
                </select>
              </label>
            </div>

            <div className="min-form__row">
              <label className="min-form__field">
                <span>{lang === "am" ? "የዕድሜ ክልል" : "Age group"}</span>
                <select name="age" defaultValue="">
                  <option value="" disabled>
                    {lang === "am" ? "ምረጥ…" : "Choose one…"}
                  </option>
                  <option value="kids">
                    {lang === "am" ? "ልጆች" : "Kids (under 12)"}
                  </option>
                  <option value="youth">
                    {lang === "am" ? "ታዳጊ ወጣቶች" : "Youth (12–17)"}
                  </option>
                  <option value="young-adult">
                    {lang === "am" ? "ወጣት ጎልማሶች (18–35)" : "Young adult (18–35)"}
                  </option>
                  <option value="adult">
                    {lang === "am" ? "ጎልማሳ (36+)" : "Adult (36+)"}
                  </option>
                </select>
              </label>
              <label className="min-form__field">
                <span>
                  {lang === "am"
                    ? "የምትፈልገው አገልግሎት"
                    : "What are you interested in?"}
                </span>
                <select name="interest" defaultValue="">
                  <option value="" disabled>
                    {lang === "am" ? "ምረጥ…" : "Choose one…"}
                  </option>
                  <option value="not-sure">
                    {lang === "am" ? "እርግጠኛ አይደለሁም" : "I'm not sure yet"}
                  </option>
                  {ministries.map((m) => (
                    <option key={m.key} value={m.key}>
                      {pick(m.name, lang)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="min-form__actions">
              <button type="submit" className="btn btn--gold btn--lg">
                {lang === "am" ? "መልዕክት ላክ" : "Send message"} <ArrowIcon />
              </button>
              <Link to="/connect" className="min-form__alt">
                {lang === "am"
                  ? "ወይም በቀጥታ ለእረኛ ጻፍ →"
                  : "Or talk to a pastor directly →"}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Location footer block
   ─────────────────────────────────────────────────────── */

function LocationFooter({ lang }: { lang: Lang }) {
  return (
    <section className="min-locs">
      <div className="container-wide">
        <header className="min-locs__head">
          <div>
            <div className="eyebrow eyebrow--gold">
              {lang === "am" ? "ጉብኝ" : "Visit a campus"}
            </div>
            <h2 className="min-locs__title">
              {lang === "am" ? (
                <>
                  ሁለት ቤቶች። <em>አንድ ቤተሰብ።</em>
                </>
              ) : (
                <>
                  Two homes. <em>One family.</em>
                </>
              )}
            </h2>
          </div>
        </header>
        <div className="min-locs__grid">
          {CAMPUSES.map((c) => (
            <article key={c.key} className="min-loc">
              <h3 className="min-loc__name">
                {pick(c.name, lang)}, {c.state}
              </h3>
              <p className="min-loc__addr">
                {c.address}
                <br />
                {c.city}
              </p>
              <p className="min-loc__svc">{pick(c.serviceInfo, lang)}</p>
              <div className="min-loc__actions">
                <a
                  href={c.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn--ghost btn--sm"
                >
                  {lang === "am" ? "አቅጣጫ" : "Get directions"}
                </a>
                <Link to="/locations" className="min-loc__link">
                  {lang === "am"
                    ? "የአገልግሎት ጊዜዎች →"
                    : "Service times →"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Page
   ─────────────────────────────────────────────────────── */

const MinistriesPage = () => {
  const { lang } = useI18n();

  const visible = useMemo(() => MINISTRIES.filter((m) => m.published), []);
  const featured = useMemo(() => visible.filter((m) => m.featured), [visible]);
  const rest = useMemo(() => visible.filter((m) => !m.featured), [visible]);

  return (
    <div className="landing-root">
      <LandingNav />
      <main id="main-content">
        <Hero lang={lang} />
        <FeaturedSection ministries={featured} lang={lang} />
        <Testimonials lang={lang} />
        <CategorizedGrid ministries={rest} lang={lang} />
        <ConnectForm ministries={visible} lang={lang} />
        <LocationFooter lang={lang} />
      </main>
      <LandingFooter />
    </div>
  );
};

export default MinistriesPage;
