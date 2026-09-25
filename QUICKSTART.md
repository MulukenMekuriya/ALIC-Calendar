# Quick Start Guide

Get the Calendar Management Platform running locally in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- A Supabase account (free tier is fine)

## Setup Steps

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd approval-agenda

# Install dependencies
npm install
```

### 2. Set Up Supabase

1. **Create a project at [supabase.com](https://supabase.com)**

2. **Get your credentials:**
   - Go to Settings > API
   - Copy the Project URL and anon key

3. **Create `.env` file in project root:**

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SECRET_KEY=sb_secret_...
```

### 3. Set Up Database

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

#### Option B: Manual Setup

1. Go to SQL Editor in Supabase dashboard
2. Run the SQL from `supabase/migrations/20251030232022_5e92534c-29c5-4fd9-a8b1-e2d0324c79aa.sql`
3. Then run `supabase/migrations/20251030232100_8a8c650d-7adf-49b1-8b56-17a1bf008b30.sql`

### 4. Create Admin User

You have two options: create a test admin or use a real admin from your ministry leaders.

#### Option A: Create Test Admin (Quick)

**Via Supabase Auth UI:**
1. Go to Authentication > Users in Supabase dashboard
2. Click "Add user"
3. Email: `admin@test.com`, Password: `Admin123!`
4. Click "Create user"
5. Copy the User UID from the users table
6. Go to SQL Editor and run:

```sql
-- Replace 'USER_ID_HERE' with the actual UUID you copied
INSERT INTO public.profiles (id, full_name, email, phone_number)
VALUES (
  'USER_ID_HERE',
  'Test Admin',
  'admin@test.com',
  '1234567890'
);

INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_HERE', 'admin');
```

#### Option B: Create Real Admin from CSV (Recommended)

Use one of the actual admin emails from your ministry leaders CSV:

**Via Supabase Auth UI:**
1. Go to Authentication > Users
2. Click "Add user"
3. Create user with one of these admin emails:
   - `alicmd.admin@gmail.com` (Abera Debela - Admin)
   - `alicmd.evandisc@gmail.com` (Pastor Benyam Aboye - Evangelism)
   - `alicmd.teaching@gmail.com` (Pastor Benyam Aboye - Teaching)
4. Set a password (e.g., `TempPass123!`)
5. Copy the User UID
6. Run this SQL (example for Admin):

```sql
-- Replace 'USER_ID_HERE' with actual UUID
-- Example for Abera Debela (Admin)
INSERT INTO public.profiles (id, full_name, email, phone_number)
VALUES (
  'USER_ID_HERE',
  'Abera Debela',
  'alicmd.admin@gmail.com',
  '2406405123'
);

INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_HERE', 'admin');
```

**Other Admin Options from CSV:**
```sql
-- Pastor Benyam Aboye (Evangelism)
INSERT INTO public.profiles (id, full_name, email, phone_number)
VALUES ('USER_ID_HERE', 'Pastor Benyam Aboye', 'alicmd.evandisc@gmail.com', '2404815970');
INSERT INTO public.user_roles (user_id, role) VALUES ('USER_ID_HERE', 'admin');

-- Pastor Benyam Aboye (Teaching) - same person, different ministry
INSERT INTO public.profiles (id, full_name, email, phone_number)
VALUES ('USER_ID_HERE', 'Pastor Benyam Aboye', 'alicmd.teaching@gmail.com', '2404815970');
INSERT INTO public.user_roles (user_id, role) VALUES ('USER_ID_HERE', 'admin');
```

**Note:** You can always import all users later using `npm run seed:users`

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## First Login

1. Go to `/auth`
2. Sign in with your test admin account
3. You should see the calendar dashboard

## Next Steps

### Import Ministry Leaders (Optional)

1. Place `ALIC MD Leaders Name(Ministry leaders).csv` in project root
2. Run:
   ```bash
   npm run seed:users
   ```
3. Check `user-credentials.json` for generated passwords
4. **Delete this file after testing!**

### Create Your First Event

1. Click "Create Event" on the dashboard
2. Fill in event details
3. Select a room
4. Choose date and time
5. Click "Create"

### Test the Approval Workflow

As a **Contributor**:
1. Create an event
2. Click "Submit for Review"

As an **Admin**:
1. Go to "Admin Panel"
2. See pending events
3. Click "Approve"
4. Click "Publish Event"

As **Public**:
1. Visit `/public`
2. See the published event

## Project Structure

```
src/
├── components/
│   ├── calendar/         # Calendar components
│   │   ├── EventCalendar.tsx
│   │   └── EventDialog.tsx
│   ├── layout/          # Layout components
│   └── ui/              # shadcn/ui components
├── pages/               # Main pages
│   ├── Dashboard.tsx    # Contributor calendar view
│   ├── Admin.tsx        # Admin approval panel
│   ├── Users.tsx        # User management
│   ├── Rooms.tsx        # Room management
│   ├── PublicCalendar.tsx  # Public calendar
│   └── Auth.tsx         # Login page
└── integrations/
    └── supabase/        # Supabase client config
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run seed:users` | Import users from CSV |
| `npm run lint` | Run linter |

## Troubleshooting

### "Invalid API key" Error

- Check your `.env` file has correct Supabase credentials
- Restart dev server after changing `.env`

### "Row level security policy violation"

- Make sure migrations ran successfully
- Check RLS is enabled in Supabase dashboard

### Can't Create Events

- Verify you're logged in
- Check that rooms exist in database
- Verify your user has a role assigned

### Database Connection Issues

- Verify Supabase project is active
- Check Project URL is correct in `.env`
- Ensure you're using `VITE_` prefix for environment variables

## Getting Help

- Check the main [README.md](README.md) for full documentation
- See [DEPLOYMENT.md](DEPLOYMENT.md) for production setup
- Review Supabase logs in dashboard
- Check browser console for errors

## What's Next?

- Read the full [README.md](README.md)
- Customize the church info in [PublicCalendar.tsx](src/pages/PublicCalendar.tsx)
- Add more rooms via the Rooms page
- Invite your team members
- Deploy to production (see [DEPLOYMENT.md](DEPLOYMENT.md))

---

## Appendix: Ministry Leaders Reference

Here are all the ministry leaders from your CSV file for reference:

| Ministry | Leader | Email | Phone |
|----------|--------|-------|-------|
| Prayer | Elias Adera | alicmd.Prayer@gmail.com | 5712365155 |
| Young Adult | Eyosiyas Tegegne | alicmdmya@gmail.com | 2405653856 |
| Deacons | Sintayehu Alemyehu | alicmd.deacons@gmail.com | 2405348391 |
| Women's | Hiwot Assefa | alicmd.women@gmail.com | 3019154354 |
| Men's | Getachew Melese | alicmd.men@gmail.com | - |
| Worship | Aklilu Zeleke | alicmd.@gmail.com | 7039811358 |
| Evangelism | **Pastor Benyam Aboye** ⭐ | alicmd.evandisc@gmail.com | 2404815970 |
| Youth | Eyasu Gebrehiwot | alicmd.youth@gmail.com | 3162827191 |
| True Vine | Bereket Belaye | alicmd.truevine@gmail.com | - |
| Ha Choir | Ermias Shigute | alicmd.hachoir@gmail.com | 6513669674 |
| Worship B (Aroma) | Mintesenot Gebre | alicmd.aroma@gmail.com | 3476228398 |
| Children | Hiwot Kebede | alicmd.children@gmail.com | 3016409686 |
| Home Cell | Aklilu Zeleke | alicmd.bs@gmail.com | 7039811358 |
| Welcome | Tsiyon Mekonen | alicmd.wellcome@gmail.com | 3019969374 |
| Senior's | Hirute Feyesa | alicmd.senior@gmail.com | 2402810036 |
| Holistic | Temesegen Ayele | alicmd.holistic@gmail.com | 2404541696 |
| Counseling & Marriage | Serkalem Tulu | alicmd.counmarr@gmail.com | 2405957655 |
| Grace | DR Adam Tulu | alicmd.@gmail.com | 3017285345 |
| Music | Samuel Giref | alicmd.music@gmail.com | 2025942040 |
| Media | Abenezer | alicmd.media@gmail.com | 2028551583 |
| Teaching & Discipleship | **Pastor Benyam Aboye** ⭐ | alicmd.teaching@gmail.com | 2404815970 |
| Parking | Kiduseמicael | alicmd.@gmail.com | 3017932064 |
| IT | Admasu | alicmd.@gmail.com | - |
| Servant (SMT) | Sidrak | alicmd.@gmail.com | 2407623230 |
| Family Care & Connection | Pastor Dawit Dagne | alicmd.@gmail.com | 5403830437 |
| Natanium | Lulit Berhai | alicmd@gmail.com | 2022649425 |
| **Admin** | **Abera Debela** ⭐ | **alicmd.admin@gmail.com** | 2406405123 |

**⭐ = Designated as Admin** in the seed script

### Notes:
- Some emails are incomplete (e.g., `alicmd.@gmail.com`) - these will be skipped by the seed script
- Missing phone numbers will be stored as empty strings
- The seed script will auto-generate temporary passwords for all users
- Users should change their passwords on first login

---

Happy coding! 🎉
