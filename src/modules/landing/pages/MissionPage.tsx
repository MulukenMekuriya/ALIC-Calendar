import { Link } from "react-router-dom";
import LandingNav from "../components/LandingNav";
import LandingFooter from "../components/LandingFooter";
import ArrowIcon from "../components/ArrowIcon";
import { useI18n } from "../components/useI18n";
import "../landing.css";

type Lang = "en" | "am";

/* ─────────────────────────────────────────────────────────
   Hero
   ─────────────────────────────────────────────────────── */

function Hero({ lang }: { lang: Lang }) {
  return (
    <section className="gm-hero">
      <div className="container-wide gm-hero__inner">
        <div className="eyebrow" style={{ marginBottom: 36 }}>
          {lang === "am"
            ? "ዓለም አቀፍ ተልዕኮ · Global Mission"
            : "Global Mission · ዓለም አቀፍ ተልዕኮ"}
        </div>
        <h1 className="gm-hero__title">
          {lang === "am" ? (
            <>
              <span>አዲስ ልደት</span>
              <span>
                <em>ዓለም አቀፍ</em> ተልዕኮ።
              </span>
            </>
          ) : (
            <>
              <span>Addis Lidet</span>
              <span>
                <em>Global</em> Mission.
              </span>
            </>
          )}
        </h1>
        <div className="gm-hero__footer">
          <p className="gm-hero__lede">
            {lang === "am"
              ? "ከገጠር መንደሮች እስከ ከተማ ማኅበረሰቦች ድረስ የወንጌል ኃይል ልብን ያንበረከካል፣ ቤተሰቦችን ይመልሳል፣ ቤተክርስቲያንን ያሳድጋል።"
              : "From rural villages to urban communities, the power of the Gospel continues to reach hearts, restore families, and grow the Church."}
          </p>
          <div className="gm-hero__verse">
            <p>
              {lang === "am"
                ? "“በወንጌል አላፍርም፤ ለሚያምን ሁሉ ለማዳን የእግዚአብሔር ኃይል ነውና።”"
                : "“For I am not ashamed of the gospel, because it is the power of God that brings salvation to everyone who believes.”"}
            </p>
            <cite>Romans 1:16</cite>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Impact strip — headline numbers
   ─────────────────────────────────────────────────────── */

const IMPACT_STATS: { n: string; label: { en: string; am: string } }[] = [
  {
    n: "29,000+",
    label: {
      en: "Reached with the Gospel",
      am: "በወንጌል የተደረሱ",
    },
  },
  {
    n: "1,700+",
    label: {
      en: "New believers discipled in Christ",
      am: "በክርስቶስ የተቀበሉ አዲስ አማኞች",
    },
  },
  {
    n: "40+",
    label: {
      en: "Children supported in education",
      am: "በትምህርት የተደገፉ ልጆች",
    },
  },
  {
    n: "50+",
    label: {
      en: "Faith pioneers & elders honored",
      am: "የተከበሩ የእምነት መሪዎችና ሽማግሌዎች",
    },
  },
  {
    n: "2,000+",
    label: {
      en: "Children & mothers received emergency support",
      am: "የአስቸኳይ ድጋፍ ያገኙ ልጆችና እናቶች",
    },
  },
];

function ImpactStrip({ lang }: { lang: Lang }) {
  return (
    <section className="gm-stats">
      <div className="container-wide">
        <header className="gm-stats__head">
          <div className="eyebrow eyebrow--gold">
            {lang === "am" ? "የዓመቱ ፍሬዎች" : "A year in numbers"}
          </div>
          <h2 className="gm-stats__title">
            {lang === "am" ? (
              <>
                ድጋፍዎ <em>ያደረገው።</em>
              </>
            ) : (
              <>
                What your partnership <em>made possible.</em>
              </>
            )}
          </h2>
        </header>
        <div className="gm-stats__grid">
          {IMPACT_STATS.map((s, i) => (
            <article key={s.n} className="gm-stat">
              <div className="gm-stat__num">{s.n}</div>
              <div className="gm-stat__label">
                {lang === "am" ? s.label.am : s.label.en}
              </div>
              <div className="gm-stat__ref">0{i + 1}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Pastor's Message
   ─────────────────────────────────────────────────────── */

function PastorMessage({ lang }: { lang: Lang }) {
  return (
    <section className="gm-letter">
      <div className="container-wide">
        <div className="gm-letter__grid">
          <aside className="gm-letter__side">
            <div className="eyebrow eyebrow--gold">
              {lang === "am" ? "የእረኛው መልዕክት" : "Pastor's message"}
            </div>
            <div className="gm-letter__sign">
              <div className="gm-letter__sign-name">Pastor Mekashaw Shimelash</div>
              <div className="gm-letter__sign-role">Addis Lidet Global Mission</div>
            </div>
          </aside>
          <div className="gm-letter__body">
            <h2 className="gm-letter__title">
              {lang === "am" ? (
                <>
                  የክርስቶስ <em>አጋሮች።</em>
                </>
              ) : (
                <>
                  Dear partners <em>in Christ.</em>
                </>
              )}
            </h2>
            <p>
              {lang === "am"
                ? "ባለፈው ዓመት እያንዳንዱን እርምጃ ስናስታውስ፣ ጌታ በአዲስ ልደት ዓለም አቀፍ ተልዕኮ በኩል ያደረገውን ሁሉ በታላቅ ምስጋና እንቀበላለን። ከገጠር መንደሮች እስከ ከተማ ማኅበረሰቦች ድረስ የወንጌል ኃይል ልብን ሲነካ፣ ቤተሰብን ሲመልስ፣ ቤተክርስቲያንን ሲያሳድግ ቀጥሏል።"
                : "As we reflect on this past year, we are filled with deep gratitude for what the Lord has done through Addis Lidet Global Mission. From rural villages to urban communities, the power of the Gospel continues to reach hearts, restore families, and grow the Church."}
            </p>
            <p>
              {lang === "am"
                ? "በታማኝ ድጋፍዎ አዲስ የተልዕኮ ጣቢያዎችን ከፍተናል፣ ብቅ ያሉ መሪዎችን አሰልጥነናል፣ ለመቶዎች የሰብአዊ እርዳታና መንፈሳዊ ድጋፍ አቅርበናል። ግን ከቁጥሮቹ ባሻገር ያሉት የተለወጡ ሕይወቶች ናቸው። በኢየሱስ ክርስቶስ ተስፋ፣ ፈውስ፣ እና የወደፊት ሕይወት ያገኙ ሰዎች።"
                : "Through your faithful support, we launched new mission sites, trained emerging leaders, and provided humanitarian aid and spiritual support to hundreds. But beyond the numbers are the lives changed. People who have found hope, healing, and a future through Jesus Christ."}
            </p>
            <p>
              {lang === "am"
                ? "ሐዋርያው ጳውሎስ በድፍረት እንዳለው፣ “በወንጌል አላፍርም፤ ለሚያምን ሁሉ ለማዳን የእግዚአብሔር ኃይል ነውና” (ሮሜ 1:16)። ይህ ሪፖርት ለዚያ ኃይል እና ለእርስዎ አጋርነት ምስክር ነው። በመንግሥቱ ሥራ ጸልየው፣ ሰጥተው፣ ከእኛ ጋር ስለቆሙ እናመሰግናለን። አንድ ላይ ለመንግሥታት ብርሃን እያመጣን ነው።"
                : "As the Apostle Paul boldly declared: “For I am not ashamed of the gospel, because it is the power of God that brings salvation to everyone who believes” (Romans 1:16). This report is a testimony to that power, and to your partnership in it. Thank you for praying, giving, and standing with us in this Kingdom work. Together, we are bringing light to the nations."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Impact Stories
   ─────────────────────────────────────────────────────── */

type Story = {
  id: string;
  ref: string;
  eyebrow: { en: string; am: string };
  title: { en: string; am: string };
  body: { en: string[]; am: string[] };
  quote?: { en: string; am: string };
  attribution?: { en: string; am: string };
  note?: { en: string; am: string };
};

const STORIES: Story[] = [
  {
    id: "selam",
    ref: "I",
    eyebrow: { en: "From Ethiopia", am: "ከኢትዮጵያ" },
    title: {
      en: "From Risk to Redemption: Selam's Story",
      am: "ከአደጋ ወደ ቤዛነት፣ የሰላም ታሪክ",
    },
    body: {
      en: [
        "Selam, a young mother in Mekelle, was trapped in a life of survival. After being abandoned and left to care for her child alone, she took on risky and abusive work in bars and night clubs just to provide food and shelter. Life felt hopeless, until she encountered the love of Christ through the outreach of Addis Lidet Global Mission.",
        "Through discipleship, encouragement, and business training provided by the mission, Selam found both faith and a future. With startup support, she began a small-scale business that now sustains her household with dignity. Today, Selam not only cares for her children in safety, but shares her testimony with other women facing similar struggles.",
      ],
      am: [
        "ሰላም በመቀሌ የምትኖር ወጣት እናት ስትሆን፣ በሕልውና ትግል ውስጥ ተይዛ ነበር። ብቻዋን ልጇን እንድታሳድግ ስትተዋት፣ ለምግብና ለመጠለያ ብቻ ስትል በመጠጥ ቤትና በናይት ክለቦች አደገኛና ጨቋኝ ሥራዎችን መሥራት ጀመረች። ሕይወት ተስፋ የለሽ ሆኖ ነበር። ከዚያም የክርስቶስን ፍቅር በአዲስ ልደት ዓለም አቀፍ ተልዕኮ በኩል አጋጠማት።",
        "በደቀ መዝሙርነት፣ በማበረታታት፣ እና በተልዕኮው በተሰጠ የንግድ ሥልጠና፣ ሰላም እምነትንም የወደፊትንም አገኘች። የጅምር ድጋፍ በማግኘት፣ አሁን ቤተሰቧን በክብር የምታኖር ትንሽ ንግድ ጀመረች። ዛሬ፣ ሰላም ልጆቿን በደህንነት ስታሳድግ ብቻ ሳትሆን፣ ተመሳሳይ ትግሎች ለሚገጥሟቸው ሌሎች ሴቶችም ምስክርነቷን ታካፍላለች።",
      ],
    },
    quote: {
      en: "I never imagined I could raise my children with peace and dignity. God changed my story.",
      am: "ልጆቼን በሰላምና በክብር ማሳደግ እችላለሁ ብዬ ፈጽሞ አላሰብኩም። እግዚአብሔር ታሪኬን ለወጠው።",
    },
    attribution: { en: "Selam", am: "ሰላም" },
    note: {
      en: "The storyteller's name has been changed to protect their identity.",
      am: "የተናጋሪውን ማንነት ለመጠበቅ ስሟ ተቀይሯል።",
    },
  },
  {
    id: "pioneers",
    ref: "II",
    eyebrow: { en: "Bahir Dar & Awassa", am: "ባሕር ዳር እና አዋሳ" },
    title: {
      en: "Honoring the Faithful: Gospel Pioneers",
      am: "ታማኞችን ማክበር፣ የወንጌል ቀዳሚዎች",
    },
    body: {
      en: [
        "In Bahir Dar and Awassa, elderly believers, many of whom were the first to carry the Gospel into northern and southern Ethiopia, are now living in quiet, often forgotten corners of society. These pioneers once risked persecution and poverty to plant churches, preach in remote areas, and disciple the next generation. Today, Addis Lidet Global Mission honors their legacy.",
        "Quarterly financial support provides not only physical relief but spiritual encouragement. The mission reminds them: their sacrifice still bears fruit, and they are not forgotten.",
      ],
      am: [
        "በባሕር ዳርና በአዋሳ፣ የመጀመሪያ ወንጌልን ወደ ሰሜንና ደቡብ ኢትዮጵያ ይዘው ከገቡት መካከል ብዙዎቹ የሆኑ የዕድሜ ባለፀጋ አማኞች፣ አሁን በጸጥታ፣ ብዙ ጊዜ በተዘነጉ የኅብረተሰብ ጥግዎች ይኖራሉ። እነዚህ ቀዳሚዎች በአንድ ወቅት ስደትንና ድህነትን አደጋ ላይ በመጣል ቤተክርስቲያኖችን ሰብክተዋል፣ በሩቅ አካባቢዎች ወንጌልን ሰብከዋል፣ የቀጣዩንም ትውልድ አስተምረዋል። ዛሬ፣ አዲስ ልደት ዓለም አቀፍ ተልዕኮ ቅርሳቸውን ያከብራል።",
        "በየሩብ ዓመቱ የሚሰጥ የገንዘብ ድጋፍ የአካል እፎይታ ብቻ ሳይሆን መንፈሳዊ ማበረታታትም ይሰጣል። ተልዕኮው ያስታውሳቸዋል፡ መሥዋዕታቸው አሁንም ፍሬ እያፈራ ነው፣ አልተረሱምም።",
      ],
    },
    quote: {
      en: "You can see their eyes light up when we pray with them. They know their legacy lives on.",
      am: "አብረን ስንጸልይ ዓይኖቻቸው ሲበሩ ታያላችሁ። ቅርሳቸው እንደቀጠለ ያውቃሉ።",
    },
    attribution: { en: "Mission Partner, Bahir Dar", am: "የተልዕኮ አጋር፣ ባሕር ዳር" },
  },
  {
    id: "menja",
    ref: "III",
    eyebrow: {
      en: "Equipping the marginalized",
      am: "የተገለሉትን ማብቃት",
    },
    title: {
      en: "Menja Mission Training",
      am: "የመንጃ ተልዕኮ ስልጠና",
    },
    body: {
      en: [
        "The Menja community, one of the most marginalized groups in Ethiopia, has long been overlooked in mission efforts. Cultural discrimination and lack of trained ministers have left many spiritually unreached and socially isolated.",
        "In 2025, Addis Lidet Global Mission, in partnership with Horn of Africa Mission, launched a satellite training center dedicated to raising up Menja leaders for Gospel work. Currently, 25 missionaries are being trained to serve in three surrounding woredas. This initiative is not only planting the Gospel but restoring dignity to a community long left on the margins.",
      ],
      am: [
        "የመንጃ ማኅበረሰብ በኢትዮጵያ ካሉት እጅግ የተገለሉ ቡድኖች አንዱ ሲሆን፣ በተልዕኮ ጥረቶች ውስጥ ለረጅም ጊዜ ችላ ተብሎ ቆይቷል። የባህል መድልዎና የተሠለጠኑ አገልጋዮች እጥረት ብዙዎችን በመንፈሳዊ ሕይወታቸው ሳይደርሱና ከኅብረተሰብ ተነጥለው እንዲቆዩ አድርጓቸዋል።",
        "በ2025፣ አዲስ ልደት ዓለም አቀፍ ተልዕኮ ከሆርን ኦፍ አፍሪካ ሚሽን ጋር በመተባበር፣ የመንጃ መሪዎችን ለወንጌል ሥራ ለማብቃት የሳተላይት ስልጠና ማዕከል ከፍቷል። በአሁኑ ሰዓት 25 ሚስዮናውያን በሦስት የአካባቢ ወረዳዎች እንዲያገለግሉ ስልጠና እያገኙ ነው። ይህ ተነሳሽነት ወንጌልን መትከል ብቻ ሳይሆን ለረጅም ጊዜ በዳር ለቆየ ማኅበረሰብ ክብርን መልሷል።",
      ],
    },
  },
  {
    id: "mekelle-children",
    ref: "IV",
    eyebrow: { en: "Mekelle", am: "መቀሌ" },
    title: {
      en: "Hope for Children in a City Scarred by Conflict",
      am: "በግጭት ለተጎዳች ከተማ ልጆች ተስፋ",
    },
    body: {
      en: [
        "The scars of war in northern Ethiopia run deep, especially for children. In Mekelle, many families were displaced or left in poverty following years of armed conflict. Children bore the brunt of the trauma, often forced to drop out of school or go without basic needs.",
        "In September 2025, Addis Lidet Global Mission launched a new child sponsorship program. With the help of generous supporters, 40 children are now enrolled in school, receiving tuition coverage, school supplies, and holistic support. For many, it's their first time back in a classroom since the war.",
      ],
      am: [
        "በሰሜን ኢትዮጵያ ያለው የጦርነት ጠባሳ ጥልቅ ነው፣ በተለይ ለልጆች። በመቀሌ፣ ለብዙ ዓመታት የቆየው የትጥቅ ግጭት ብዙ ቤተሰቦችን አፈናቅሏል ወይም በድህነት ውስጥ ጥሏል። ልጆች የስቃዩን ሸክም ተሸክመዋል፣ ብዙ ጊዜ ከትምህርት እንዲቋረጡ ወይም መሠረታዊ ፍላጎቶቻቸውን ሳያገኙ እንዲቆዩ ተገድደዋል።",
        "በሴፕቴምበር 2025፣ አዲስ ልደት ዓለም አቀፍ ተልዕኮ አዲስ የሕፃናት ስፖንሰርሺፕ ፕሮግራም ጀመረ። በልገሰው ደጋፊዎች ድጋፍ፣ 40 ልጆች አሁን በትምህርት ቤት ተመዝግበው፣ የትምህርት ክፍያ፣ የትምህርት ቁሳቁስ፣ እና አጠቃላይ ድጋፍ እያገኙ ናቸው። ለብዙዎቹ፣ ከጦርነቱ በኋላ ለመጀመሪያ ጊዜ ወደ ክፍል መመለሳቸው ነው።",
      ],
    },
    quote: {
      en: "Education is not just a path to learning. It's a path to healing.",
      am: "ትምህርት የመማር መንገድ ብቻ አይደለም። የመፈወስ መንገድም ነው።",
    },
    attribution: { en: "Mission Worker, Mekelle", am: "የተልዕኮ ሠራተኛ፣ መቀሌ" },
  },
];

function StoryCard({ s, lang }: { s: Story; lang: Lang }) {
  return (
    <article className="gm-story">
      <div className="gm-story__rule">
        <span className="gm-story__ref">{s.ref}.</span>
        <span className="gm-story__eyebrow">
          {lang === "am" ? s.eyebrow.am : s.eyebrow.en}
        </span>
      </div>
      <h3 className="gm-story__title">
        {lang === "am" ? s.title.am : s.title.en}
      </h3>
      <div className="gm-story__body">
        {(lang === "am" ? s.body.am : s.body.en).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {s.quote && (
        <figure className="gm-story__quote">
          <span className="gm-story__quote-mark">"</span>
          <blockquote>
            <p>{lang === "am" ? s.quote.am : s.quote.en}</p>
          </blockquote>
          {s.attribution && (
            <figcaption>
              {lang === "am" ? s.attribution.am : s.attribution.en}
            </figcaption>
          )}
        </figure>
      )}
      {s.note && (
        <p className="gm-story__note">
          {lang === "am" ? s.note.am : s.note.en}
        </p>
      )}
    </article>
  );
}

function ImpactStories({ lang }: { lang: Lang }) {
  return (
    <section className="gm-stories">
      <div className="container-wide">
        <header className="gm-stories__head">
          <div>
            <div className="eyebrow eyebrow--dark">
              {lang === "am" ? "የተጽዕኖ ታሪኮች" : "Impact stories"}
            </div>
            <h2 className="gm-stories__title">
              {lang === "am" ? (
                <>
                  ከኢትዮጵያ <em>ታሪኮች።</em>
                </>
              ) : (
                <>
                  Stories from <em>Ethiopia.</em>
                </>
              )}
            </h2>
          </div>
          <p className="gm-stories__lede">
            {lang === "am"
              ? "ከቁጥሮች ጀርባ የቆሙ ሕይወቶች፣ በወንጌል ኃይል የተለወጡ።"
              : "Behind every number is a life: restored, equipped, or honored by the power of the Gospel."}
          </p>
        </header>
        <div className="gm-stories__list">
          {STORIES.map((s) => (
            <StoryCard key={s.id} s={s} lang={lang} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Partner CTA
   ─────────────────────────────────────────────────────── */

function Partner({ lang }: { lang: Lang }) {
  return (
    <section className="gm-partner">
      <div className="container-wide">
        <div className="gm-partner__inner">
          <div className="eyebrow eyebrow--gold" style={{ marginBottom: 18 }}>
            {lang === "am" ? "በመንግሥቱ ሥራ ይሳተፉ" : "Partner with us"}
          </div>
          <h2 className="gm-partner__title">
            {lang === "am" ? (
              <>
                አብረን ወንጌልን <em>እናስፋፋ።</em>
              </>
            ) : (
              <>
                Let's advance the <em>Gospel together.</em>
              </>
            )}
          </h2>
          <p className="gm-partner__verse">
            {lang === "am"
              ? "“ምሥራችን የሚያበስሩ እግሮች እንዴት ያማሩ ናቸው!” ሮሜ 10:15"
              : "“How beautiful are the feet of those who bring good news!” Romans 10:15"}
          </p>
          <p className="gm-partner__lede">
            {lang === "am"
              ? "ድጋፍዎ ሳይደረሱ ያሉ ማኅበረሰቦችን ለመድረስ፣ ተጋላጭ ቤተሰቦችን ለመደገፍ፣ እና በመላው ኢትዮጵያ የወንጌል ሠራተኞችን ለማብቃት ይረዳናል።"
              : "Your support helps us reach unreached communities, support vulnerable families, and raise up Gospel workers across Ethiopia."}
          </p>

          <dl className="gm-partner__contact">
            <div>
              <dt>{lang === "am" ? "ስልክ" : "Phone"}</dt>
              <dd>
                <a href="tel:+13015885362">+1 (301) 588-5362</a>
              </dd>
            </div>
          </dl>

          <div className="gm-partner__actions">
            <Link to="/give" className="btn btn--gold btn--lg">
              {lang === "am" ? "አሁን ይዋጡ" : "Give to the mission"}{" "}
              <ArrowIcon />
            </Link>
            <Link to="/connect" className="btn btn--ghost btn--lg">
              {lang === "am" ? "ከእኛ ጋር ይገናኙ" : "Get in touch"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Page
   ─────────────────────────────────────────────────────── */

const MissionPage = () => {
  const { lang } = useI18n();
  return (
    <div className="landing-root">
      <LandingNav />
      <main id="main-content">
        <Hero lang={lang} />
        <ImpactStrip lang={lang} />
        <PastorMessage lang={lang} />
        <ImpactStories lang={lang} />
        <Partner lang={lang} />
      </main>
      <LandingFooter />
    </div>
  );
};

export default MissionPage;
