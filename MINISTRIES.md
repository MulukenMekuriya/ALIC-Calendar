# Ministries page — pre-launch checklist

This file lists every piece of information that needs to be collected from
ALIC leadership before the Ministries page can be considered ready for
public launch. Nothing on this list has been fabricated in the prototype —
all unverified items are either left empty or hidden behind a
`published: false` flag in `src/modules/landing/content/ministries.ts`.

When an item is confirmed, edit the corresponding entry in
`ministries.ts`, set `published: true`, and remove it from this checklist.

---

## 1. Ministries currently published (live on the page)

These render today. They need authoritative leader contact info before they
go to the public site, but their copy and meeting times come from the
official prompt of record and the existing addislidetchurch.org content.

### Home Cells / Bible Study (የመጽሐፍ ቅዱስ ጥናት) — featured
- [ ] Lead contact name + email + photo for visitors who want to be placed in a cell
- [ ] A representative photograph of a real cell meeting (no stock)
- [ ] Amharic translation of `forWhom` and `description`

### Young Adult Ministry (የጎልማሶች አገልግሎት) — featured
- [ ] Lead pastor / coordinator name + photo + email
- [ ] A photograph from a recent gathering
- [ ] Amharic translation of `forWhom` and `description`

### Prayer Ministry (የጸሎት አገልግሎት) — featured
- [ ] Prayer team lead contact (name + email + photo)
- [ ] Photograph from a prayer gathering
- [ ] Amharic translation

### ALIC Mission (የአዲስ ልደት ተልዕኮ) — featured
- [ ] Mission director contact for inquiries
- [ ] Photograph(s) from past mission work
- [ ] Confirm canonical link — currently points to
      `https://addislidetchurch.org/alic-mission/`. Confirm whether it
      should remain on the WordPress site or migrate into the React app.
- [ ] Amharic translation

### Sunday Worship Service
- [ ] No outstanding info — this entry just points to `/locations` for times.

### Midweek Service
- [ ] Confirm Wed 6:30–9:00 PM (MD) and Tue 7:00–9:00 PM (VA) are still
      current as of the next site refresh.

### ALIC Bible School
- [ ] Confirm if the class schedule should be surfaced inline on the
      Ministries page or stay exclusively on the Bible School site.

---

## 2. Ministries reserved as featured but not yet publishable

These have featured slots designed for them, but their copy is incomplete.
They are currently hidden (`published: false`). They will surface in the
"Featured Ministries" section the moment the [VERIFY] items are confirmed.

### Children's Ministry (የልጆች አገልግሎት) — featured slot
- [ ] **[VERIFY]** Sunday School meeting times per campus
- [ ] **[VERIFY]** Age groupings / classroom breakdown (nursery, preschool,
      elementary, etc.)
- [ ] Director name + email + photo
- [ ] Real photo of the children's space
- [ ] Amharic translation of `forWhom` + `description`

### Youth Ministry (የወጣቶች አገልግሎት) — featured slot
- [ ] **[VERIFY]** Meeting times and cadence per campus
- [ ] **[VERIFY]** Confirm age range (grades 6–12 assumed)
- [ ] Youth pastor name + email + photo
- [ ] Real photograph from a youth gathering
- [ ] Amharic translation

---

## 3. Ministries listed in the categorized grid as placeholders

These are referenced in the brief but have no confirmed copy. They are
hidden (`published: false`). Each needs leadership to confirm whether the
ministry exists by this name, supply description and meeting info, and
provide a contact.

### Worship & Praise Team
- [ ] [VERIFY] Confirm the ministry exists by this name and at which campuses
- [ ] Audience description ("for whom") from leadership
- [ ] 2–3 sentence description from leadership
- [ ] Rehearsal / service schedule
- [ ] Worship director name + email + photo
- [ ] Amharic name + translation

### Choir
- [ ] [VERIFY] Confirm choir(s) by name (adult / youth / both?)
- [ ] Audience + description from leadership
- [ ] Rehearsal cadence + audition policy
- [ ] Choir director name + email + photo
- [ ] Amharic name + translation

### Men's Ministry
- [ ] [VERIFY] Confirm the ministry exists and at which campuses
- [ ] Audience + description
- [ ] Meeting cadence / location
- [ ] Lead contact name + email + photo
- [ ] Amharic name + translation

### Women's Ministry
- [ ] [VERIFY] Confirm the ministry exists and at which campuses
- [ ] Audience + description
- [ ] Meeting cadence / location
- [ ] Lead contact name + email + photo
- [ ] Amharic name + translation

### Marriage & Family Ministry
- [ ] [VERIFY] Confirm the ministry exists
- [ ] Scope (pre-marital? marriage retreats? counseling?)
- [ ] Lead contact name + email + photo
- [ ] Amharic name + translation

### Ushering & Hospitality
- [ ] [VERIFY] Confirm structure (one team or campus-specific?)
- [ ] Sunday rotation expectations
- [ ] Lead contact name + email + photo

### Media & Live Stream Team
- [ ] [VERIFY] Confirm team scope (camera, audio, livestream, social?)
- [ ] Time commitment expectations
- [ ] Lead contact name + email + photo

### New Believers / Discipleship
- [ ] [VERIFY] Confirm pathway exists by this name
- [ ] Curriculum or framework used
- [ ] Onramp for new believers (class? mentor pairing?)
- [ ] Lead contact name + email + photo

### Local Outreach
- [ ] [VERIFY] Confirm distinction from ALIC Mission (or merge into it)
- [ ] Active local partnerships
- [ ] Lead contact name + email + photo

---

## 4. Member testimonials

`TESTIMONIALS` in `ministries.ts` contains a single placeholder marked
`published: false`. The Testimonials section is **not rendered** on the
page until at least one real, attributed quote is added with the
member's permission.

- [ ] Collect 2–3 short quotes from members about ministries that have
      impacted their life
- [ ] For each: real name, role/role-in-church, ministry, and a portrait photo
- [ ] Set `published: true` once approved by the member and leadership

---

## 5. Form submission wiring

The "New Here? Let's Talk." form currently redirects to `/connect` on
submit. Decide where submissions should actually go:

- [ ] WordPress contact form plugin endpoint?
- [ ] A no-code service (Formspree, Tally, Google Forms)?
- [ ] A new backend endpoint in the React app (Supabase)?

Once decided, replace the `handleSubmit` body in
`src/modules/landing/pages/MinistriesPage.tsx` (`ConnectForm` component).

---

## 6. Photography brief

Every featured ministry has a photo placeholder labelled with explicit alt
text directing the photographer to use *real church photos, no stock*.
Recommended shoot list:

- A Home Cell mid-conversation (people, food, an open Bible)
- A Sunday morning Young Adult gathering
- A prayer service — wide shot of the room
- A mission/outreach team in the field
- A Children's Ministry classroom
- A Youth gathering (consent / model release for any minors)

Aspect ratio target: 4/5 portrait (the featured photo slot). Secondary
crops: 4/3 landscape.

---

## 7. Bilingual coverage

The hero, section headers, form labels, and confirmed-ministry titles have
Amharic translations. Most ministry **descriptions** still need Amharic
versions. Each `Bilingual` field in `ministries.ts` accepts an optional
`am` value — populate it and the page will render Amharic for that field
when language is set to Amharic.

- [ ] Translate `forWhom` for each published ministry
- [ ] Translate `description` for each published ministry
- [ ] Translate `meets` for each published ministry
- [ ] Translate `location` and `ctaLabel` for each published ministry
- [ ] Translate category labels (`CATEGORY_LABELS` in `ministries.ts`)

---

## File map

- `src/modules/landing/content/ministries.ts` — content config (edit here)
- `src/modules/landing/pages/MinistriesPage.tsx` — page layout (no copy)
- `src/modules/landing/landing.css` — styles (search `MINISTRIES PAGE`)
- This file (`MINISTRIES.md`) — pre-launch checklist
