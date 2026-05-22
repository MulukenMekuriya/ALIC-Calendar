/**
 * Ministries content config
 * -------------------------
 * Single source of truth for the Ministries page.
 *
 * Editing rules:
 *  - Every public string lives here as { en, am }. Amharic ('am') is optional —
 *    if missing, the page renders English in both languages.
 *  - `published: false` hides a ministry from the page entirely. Set it true
 *    only after the listed [VERIFY] items have been confirmed with leadership.
 *  - Do NOT invent leader names, emails, photos, or testimonial quotes.
 *    Leave them null/empty — the layout handles missing fields.
 *
 * Verification status reflects ALIC's prompt of record (April 2026).
 * See MINISTRIES.md at the repo root for the full pre-launch checklist.
 */

export type CampusKey = "md" | "va";

export interface Bilingual {
  en: string;
  am?: string;
}

export type MinistryCategory =
  | "worship"
  | "lifestage"
  | "community"
  | "outreach";

export interface MinistryLeader {
  // All fields nullable — populate as leadership confirms.
  name: string | null;
  role: string | null;
  email: string | null;
  photo: string | null;
}

export interface Ministry {
  key: string;
  /** Hide from the rendered page until verified. */
  published: boolean;
  /** Show in the top "Featured Ministries" section. */
  featured: boolean;
  category: MinistryCategory;
  name: Bilingual;
  /** 1-sentence "who it's for" line in plain language. */
  forWhom: Bilingual;
  /** 2–3 sentence description. */
  description: Bilingual;
  meets: Bilingual | null;
  location: Bilingual | null;
  campuses: CampusKey[];
  /** "Learn More" / "Join Us" / "Visit Site" — varies by ministry. */
  ctaLabel: Bilingual;
  /** Internal route or external URL. */
  ctaHref: string;
  /** Optional path under /public — leave empty until real photos arrive. */
  photo: string | null;
  leader: MinistryLeader;
  /** Free-text checklist surfaced in the README and admin docs. */
  needsBeforeLaunch: string[];
}

/* ─────────────────────────────────────────────────────────
   MINISTRIES
   ─────────────────────────────────────────────────────── */

export const MINISTRIES: Ministry[] = [
  /* ── FEATURED — order here drives page order ─────────── */
  {
    key: "bible-school",
    published: true,
    featured: false,
    category: "worship",
    name: { en: "ALIC Bible School (ABS)" },
    forWhom: {
      en: "For believers who want to deepen their study of Scripture and theology.",
    },
    description: {
      en: "Driven by a commitment to Christ-centeredness and excellence, we envision a biblically enlightened community that deeply understands and lives out the Word of God. Our mission is to equip the church through Spirit-led, Scripture-rooted theological education that empowers every member to serve with a servanthood-attitude. By remaining mission-focused, we strive to foster a practical faith that honors God and reflects His love in everything we do.",
    },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Visit ALIC Bible School" },
    ctaHref: "https://sites.google.com/alicbibleschool.com/abs",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "Confirm if class schedule should be surfaced here or stay on the Bible School site",
    ],
  },
  {
    key: "welcoming",
    published: true,
    featured: false,
    category: "community",
    name: { en: "Welcoming Team", am: "የእንግዶች መቀበያ ቡድን" },
    forWhom: {
      en: "For first-time visitors and anyone returning — so you feel valued from the moment you arrive.",
    },
    description: {
      en: "Our Welcoming Team creates an atmosphere of warmth and care for everyone joining us for worship. Visiting for the first time? We'd love to meet you, help you get settled, and connect you with our follow-up team to help you find your place in our church family.",
    },
    meets: { en: "Sundays · before and after worship" },
    location: { en: "Both campuses · lobby" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Plan a visit" },
    ctaHref: "/locations",
    photo: "/Welcome Team.png",
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "Welcoming Team lead contact per campus",
      "Amharic translation of forWhom + description",
    ],
  },
  {
    key: "young-adult",
    published: true,
    featured: true,
    category: "lifestage",
    name: { en: "True Vine Young Adult English Service", am: "የጎልማሶች አገልግሎት" },
    forWhom: {
      en: "A multicultural, English-speaking ministry open to people from all backgrounds.",
    },
    description: {
      en: "True Vine Ministry gathers young adults each week for worship, the Word, and community in English. Weekly services are held every Sunday from 4:00 p.m. to 7:00 p.m.",
    },
    meets: {
      en: "Sunday 4:00–7:00 PM · Silver Spring · Sunday evenings 7:00–9:00 PM · Alexandria",
    },
    location: { en: "Both campuses" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Join us" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "Lead pastor / coordinator name + photo + email",
      "A real photo from a recent gathering",
      "Amharic translation of forWhom + description",
    ],
  },
  {
    key: "youth",
    // Published with brief-sourced copy. `meets` is intentionally null until
    // youth meeting times are confirmed.
    published: true,
    featured: true,
    category: "lifestage",
    name: { en: "Youth Ministry", am: "የወጣቶች አገልግሎት" },
    forWhom: {
      en: "A place for youth to grow in faith, build lasting friendships, and serve Jesus together.",
    },
    description: {
      en: "We're a welcoming, Christ-centered community where young people are encouraged to ask questions, discover God's purpose, and live out their faith. Our mission is to lead young people into a growing relationship with Jesus Christ, equip them to live boldly for God, and send them to serve family, church, and the world with courage and compassion.",
    },
    meets: null, // [VERIFY] confirm meeting cadence per campus
    location: { en: "Both campuses" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Youth Ministry meeting times per campus",
      "[VERIFY] Confirm age range (grades 6–12?)",
      "Youth pastor name + email + photo",
      "Real photo from a youth gathering",
      "Amharic translation",
    ],
  },
  {
    key: "childrens",
    // Published with brief-sourced copy. `meets` is intentionally null until
    // Sunday School times and age groupings are confirmed — the page hides
    // the Meets row when meets is null, so nothing fabricated is displayed.
    published: true,
    featured: true,
    category: "lifestage",
    name: { en: "Children's Ministry", am: "የልጆች አገልግሎት" },
    forWhom: {
      en: "Childhood is a season of wonders — from preschool through middle school.",
    },
    description: {
      en: "We believe every moment is an opportunity to see God at work. Our mission is to partner with families to help children know, love, and follow Jesus. Through kindness, patient guidance, and the teaching of God's Word, we strive to plant seeds of faith that will grow for a lifetime. More than just lessons, we aim to be a living example of Christ's grace — showing children His love through our actions, our prayers, and our community.",
    },
    meets: null, // [VERIFY] confirm exact times per age group
    location: { en: "Both campuses · children's wing" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Sunday School meeting times per campus",
      "[VERIFY] Age groups / classroom breakdown (nursery, preschool, elementary?)",
      "Children's Ministry director name + email + photo",
      "Real photo of the children's space",
      "Amharic translation of forWhom + description",
    ],
  },
  {
    key: "home-cells",
    published: true,
    featured: false,
    category: "community",
    name: { en: "Home Cells / Bible Study", am: "የመጽሐፍ ቅዱስ ጥናት" },
    forWhom: {
      en: "For anyone who wants real community and to grow in faith with a small group of believers in their neighborhood.",
    },
    description: {
      en: "Around 42 small groups meet across the DMV: 32 cells in Maryland and 10 in Virginia. Each cell gathers for Bible study, prayer, and life together close to home.",
    },
    meets: { en: "Weekly · in homes across the DMV" },
    location: { en: "32 cells across Maryland · 10 cells across Virginia" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Find a cell near you" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "Cell-leader contact for visitors who want to be placed",
      "A representative photo (real members, no stock)",
      "Amharic translation of forWhom + description",
    ],
  },
  {
    key: "prayer",
    published: true,
    featured: false,
    category: "worship",
    name: { en: "Prayer Ministry", am: "የጸሎት አገልግሎት" },
    forWhom: { en: "For those hungry to seek God in His presence." },
    description: {
      en: "Our intercessors meet across the week: before Sunday services, midday on Thursdays, on Friday nights at both campuses, and once a month overnight. Anyone is welcome to come and learn to pray with us.",
    },
    meets: {
      en: "Sunday morning prayer · Thursday 10:00 AM–2:00 PM (MD) · Friday overnight 8:30 PM–12:30 AM (MD) · Friday 7:00–11:00 PM (VA)",
    },
    location: { en: "Both campuses" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Pray with us" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "Prayer team lead contact",
      "Photo from a prayer gathering",
      "Amharic translation",
    ],
  },
  {
    key: "alic-mission",
    published: true,
    featured: false,
    category: "outreach",
    name: { en: "ALIC Mission", am: "የአዲስ ልደት ተልዕኮ" },
    forWhom: {
      en: "For those moved to serve the whole person: body, mind, and spirit.",
    },
    description: {
      en: "Our mission is to spread the Gospel of Jesus Christ holistically by evangelizing cities and villages with the power of the Kingdom of God. We are dedicated to reaching communities with the least access to the Good News by establishing healthy, mission-oriented churches and equipping missionaries for both spiritual and children's ministry. By creating opportunities for our members to actively participate in outreach, we serve our neighbors through healthcare, education, counseling, and economic empowerment. Through strategic partnerships and faithful stewardship, we strive to transform lives and multiply the impact of the Gospel in every community we reach.",
    },
    meets: { en: "Year-round · project-based" },
    location: { en: "Local and international" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/mission",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "Mission director contact for inquiries",
      "Photo(s) from past mission work",
      "Confirm canonical link (kept the WP path for now)",
      "Amharic translation",
    ],
  },

  /* ── ALL MINISTRIES grid — confirmed ─────────────────── */
  {
    key: "sunday-worship",
    published: true,
    featured: false,
    category: "worship",
    name: { en: "Sunday Worship Service" },
    forWhom: { en: "For everyone: visitor, member, family, friend." },
    description: {
      en: "Our weekly gathering at both campuses for worship, teaching, and the Lord's Table.",
    },
    meets: { en: "Sundays · see Locations for service times" },
    location: { en: "Silver Spring, MD · Alexandria, VA" },
    campuses: ["md", "va"],
    ctaLabel: { en: "See service times" },
    ctaHref: "/locations",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [],
  },
  {
    key: "midweek-service",
    published: true,
    featured: false,
    category: "worship",
    name: { en: "Midweek Service" },
    forWhom: {
      en: "For anyone hungry for teaching, worship, and prayer in the middle of the week.",
    },
    description: {
      en: "A midweek gathering at both campuses for worship and the Word.",
    },
    meets: { en: "Wednesday 6:30–9:00 PM (MD) · Tuesday 7:00–9:00 PM (VA)" },
    location: { en: "Both campuses" },
    campuses: ["md", "va"],
    ctaLabel: { en: "Plan your visit" },
    ctaHref: "/locations",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [],
  },

  /* ── ALL MINISTRIES grid — [VERIFY] holding pattern ──── */
  {
    key: "worship-team",
    published: false, // [VERIFY] all details
    featured: false,
    category: "worship",
    name: { en: "Worship & Praise Team" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm the ministry exists by this name and at which campuses",
      "Audience description ('for whom') from leadership",
      "2–3 sentence description from leadership",
      "Rehearsal / service schedule",
      "Worship director name + email + photo",
      "Amharic name + translation",
    ],
  },
  {
    key: "choir",
    published: false, // [VERIFY] all details
    featured: false,
    category: "worship",
    name: { en: "Choir" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm choir(s) by name (adult / youth / both?)",
      "Audience + description from leadership",
      "Rehearsal cadence + audition policy",
      "Choir director name + email + photo",
      "Amharic name + translation",
    ],
  },
  {
    key: "mens",
    published: false, // [VERIFY]
    featured: false,
    category: "lifestage",
    name: { en: "Men's Ministry" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm the ministry exists and at which campuses",
      "Audience + description from leadership",
      "Meeting cadence / location",
      "Lead contact name + email + photo",
      "Amharic name + translation",
    ],
  },
  {
    key: "womens",
    published: false, // [VERIFY]
    featured: false,
    category: "lifestage",
    name: { en: "Women's Ministry" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm the ministry exists and at which campuses",
      "Audience + description from leadership",
      "Meeting cadence / location",
      "Lead contact name + email + photo",
      "Amharic name + translation",
    ],
  },
  {
    key: "marriage-family",
    published: false, // [VERIFY]
    featured: false,
    category: "lifestage",
    name: { en: "Marriage & Family Ministry" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm the ministry exists",
      "Scope (pre-marital? marriage retreats? counseling?)",
      "Lead contact name + email + photo",
      "Amharic name + translation",
    ],
  },
  {
    key: "hospitality",
    published: false, // [VERIFY]
    featured: false,
    category: "community",
    name: { en: "Ushering & Hospitality" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm structure (one team or campus-specific?)",
      "Sunday rotation expectations",
      "Lead contact name + email + photo",
    ],
  },
  {
    key: "media",
    published: false, // [VERIFY]
    featured: false,
    category: "community",
    name: { en: "Media & Live Stream Team" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm team scope (camera, audio, livestream, social?)",
      "Time commitment expectations",
      "Lead contact name + email + photo",
    ],
  },
  {
    key: "discipleship",
    published: false, // [VERIFY]
    featured: false,
    category: "community",
    name: { en: "New Believers / Discipleship" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm pathway exists by this name",
      "Curriculum or framework used",
      "Onramp for new believers (class? mentor pairing?)",
      "Lead contact name + email + photo",
    ],
  },
  {
    key: "local-outreach",
    published: false, // [VERIFY]
    featured: false,
    category: "outreach",
    name: { en: "Local Outreach" },
    forWhom: { en: "" },
    description: { en: "" },
    meets: null,
    location: null,
    campuses: ["md", "va"],
    ctaLabel: { en: "Learn more" },
    ctaHref: "/connect",
    photo: null,
    leader: { name: null, role: null, email: null, photo: null },
    needsBeforeLaunch: [
      "[VERIFY] Confirm distinction from ALIC Mission (or merge into it)",
      "Active local partnerships",
      "Lead contact name + email + photo",
    ],
  },
];

/* ─────────────────────────────────────────────────────────
   CATEGORY HEADERS (bilingual)
   ─────────────────────────────────────────────────────── */

export const CATEGORY_LABELS: Record<MinistryCategory, Bilingual> = {
  worship: { en: "Worship & Spiritual Formation" },
  lifestage: { en: "Life Stage Ministries" },
  community: { en: "Community & Service" },
  outreach: { en: "Outreach" },
};

/* ─────────────────────────────────────────────────────────
   CAMPUSES (rendered in the location footer block)
   ─────────────────────────────────────────────────────── */

export interface CampusInfo {
  key: CampusKey;
  name: Bilingual;
  state: string;
  address: string;
  city: string;
  mapsUrl: string;
  /** Free-form service info; the brief did not lock specific times for both
      campuses, so this stays a pointer to the Locations page rather than
      restating times that may diverge. */
  serviceInfo: Bilingual;
}

export const CAMPUSES: CampusInfo[] = [
  {
    key: "md",
    name: { en: "Silver Spring", am: "ሲልቨር ስፕሪንግ" },
    state: "Maryland",
    address: "11961 Tech Rd",
    city: "Silver Spring, MD 20904",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=11961+Tech+Rd+Silver+Spring+MD+20904",
    serviceInfo: { en: "Sunday worship · Midweek Wed 6:30–9:00 PM" },
  },
  {
    key: "va",
    name: { en: "Alexandria", am: "አሌክሳንድሪያ" },
    state: "Virginia",
    address: "2730 Eisenhower Ave",
    city: "Alexandria, VA 22314",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=2730+Eisenhower+Ave+Alexandria+VA+22314",
    serviceInfo: { en: "Sunday worship · Midweek Tue 7:00–9:00 PM" },
  },
];

/* ─────────────────────────────────────────────────────────
   TESTIMONIALS — placeholders only (do not invent quotes)
   ─────────────────────────────────────────────────────── */

export interface Testimonial {
  /** Set true once a real, attributed quote is collected and approved. */
  published: boolean;
  quote: Bilingual;
  name: string | null;
  role: string | null;
  ministry: string | null;
  photo: string | null;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    published: false,
    quote: {
      en: "TO BE COLLECTED FROM MEMBERS — placeholder card. Do not publish until a real quote is gathered with the member's permission.",
    },
    name: null,
    role: null,
    ministry: null,
    photo: null,
  },
];
