# Deployment Guide

This guide walks you through deploying the Collaborative Calendar Management Platform to production.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Supabase Setup](#supabase-setup)
3. [Vercel Deployment](#vercel-deployment)
4. [Post-Deployment Steps](#post-deployment-steps)
5. [Troubleshooting](#troubleshooting)

## Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] Supabase project created
- [ ] GitHub repository with your code
- [ ] Vercel account
- [ ] Database migrations tested locally
- [ ] Environment variables documented
- [ ] CSV file with initial users ready

## Supabase Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - Name: `alic-calendar` (or your choice)
   - Database Password: Generate a strong password
   - Region: Choose closest to your users (e.g., `us-east-1`)
5. Wait for project to be provisioned

### 2. Get Your API Credentials

1. In Supabase dashboard, go to Settings > API
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (keep this secret!)

### 3. Apply Database Migrations

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

#### Option B: Using SQL Editor

1. Go to SQL Editor in Supabase dashboard
2. Create a new query
3. Copy contents of `supabase/migrations/20251030232022_5e92534c-29c5-4fd9-a8b1-e2d0324c79aa.sql`
4. Run the query
5. Repeat for `supabase/migrations/20251030232100_8a8c650d-7adf-49b1-8b56-17a1bf008b30.sql`

### 4. Verify Tables and RLS

In Supabase dashboard:

1. Go to **Table Editor**
2. Verify these tables exist:
   - `profiles`
   - `user_roles`
   - `rooms`
   - `events`
3. Go to **Authentication > Policies**
4. Verify RLS is enabled for all tables

### 5. Create Initial Rooms

Run this SQL in the SQL Editor:

```sql
INSERT INTO public.rooms (name, description, color) VALUES
  ('Room A', 'Main conference room', '#6366f1'),
  ('Room B', 'Secondary meeting space', '#8b5cf6'),
  ('Room C', 'Workshop and training room', '#ec4899');
```

## Vercel Deployment

### 1. Push Code to GitHub

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2. Import Project to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." > "Project"
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Vite
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 3. Set Environment Variables

In Vercel project settings > Environment Variables, add:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**Important:** Do NOT add any service key to Vercel — not
`ALIC_SERVICE_KEY` and not the legacy `SUPABASE_SERVICE_ROLE_KEY`. Vercel
builds the browser bundle, and anything it can read can end up shipped to a
browser. These keys bypass Row Level Security entirely. They belong only in
local scripts and in Supabase's own edge-function secrets, which Supabase
injects server-side.

### 4. Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Visit your deployment URL

### 5. Configure Custom Domain (Optional)

1. In Vercel project settings > Domains
2. Add your domain (e.g., `calendar.addislidetchurch.org`)
3. Follow DNS configuration instructions
4. Wait for SSL certificate to provision

## Post-Deployment Steps

### 1. Seed Initial Users

**Important:** Run this locally, not in production.

```bash
# Ensure CSV file is in project root
# Update .env with Supabase credentials
npm run seed:users
```

This will:
- Create user accounts
- Assign roles
- Generate `user-credentials.json`

### 2. Distribute User Credentials

1. Review `user-credentials.json`
2. Send credentials securely to each user (encrypted email, password manager, etc.)
3. **Delete the credentials file immediately:**
   ```bash
   rm user-credentials.json
   ```

### 3. Create Your Admin Account

If you need an additional admin:

1. Sign up via the app at `/auth`
2. In Supabase dashboard, run:
   ```sql
   -- Get your user ID
   SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

   -- Assign admin role
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('your-user-id', 'admin');
   ```

### 4. Test the Application

Visit each page and test:

- [ ] User can sign in
- [ ] Contributor can create event
- [ ] Contributor can submit event for review
- [ ] Admin can approve event
- [ ] Admin can publish event
- [ ] Public calendar shows published events
- [ ] Export to ICS works
- [ ] Room management works
- [ ] No overlapping events allowed

### 5. Monitor and Maintain

**Set up monitoring:**
1. In Vercel dashboard, check Analytics
2. In Supabase dashboard, check:
   - Database > Performance
   - Auth > Users
   - Logs

**Regular maintenance:**
- Monitor user feedback
- Check for security updates
- Review audit logs
- Backup database periodically

## Troubleshooting

### Build Fails on Vercel

**Error:** `Module not found`

**Solution:** Ensure all dependencies are in `package.json`, not just `devDependencies` that are needed for build.

### RLS Policies Not Working

**Error:** "Row level security policy violation"

**Solution:**
1. Verify RLS is enabled on all tables
2. Check policies in Supabase dashboard
3. Test with SQL Editor:
   ```sql
   SELECT * FROM public.has_role(auth.uid(), 'admin');
   ```

### Users Can't Sign In

**Error:** "Invalid login credentials"

**Solution:**
1. Verify email is confirmed in Supabase > Auth > Users
2. Check if user has profile entry:
   ```sql
   SELECT * FROM profiles WHERE email = 'user@example.com';
   ```
3. Ensure user has role assigned:
   ```sql
   SELECT * FROM user_roles WHERE user_id = 'user-uuid';
   ```

### Events Overlap Despite Constraint

**Error:** Events scheduled at same time in same room

**Solution:**
1. Verify btree_gist extension is installed:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'btree_gist';
   ```
2. Check exclusion constraint exists:
   ```sql
   SELECT conname, contype FROM pg_constraint
   WHERE conname = 'no_overlap_per_room';
   ```

### Public Calendar Not Loading Events

**Solution:**
1. Check browser console for errors
2. Verify events exist with `status = 'published'`
3. Check RLS policies allow anonymous reads of published events

### Environment Variables Not Working

**Solution:**
1. Ensure variables start with `VITE_` prefix (Vite requirement)
2. Rebuild after changing environment variables
3. Check Vercel logs for deployment errors

## Rollback Procedure

If you need to rollback:

1. In Vercel dashboard > Deployments
2. Find the last working deployment
3. Click "..." > "Promote to Production"

For database rollback:
1. Use Supabase Time Travel feature (paid plans)
2. Or restore from backup

## Security Best Practices

1. **Never commit secrets to Git**
   - Use `.env` files (already in `.gitignore`)
   - Use environment variables in Vercel

2. **Rotate credentials periodically**
   - Regenerate Supabase keys every 6 months
   - Update in Vercel immediately

3. **Monitor access logs**
   - Check Supabase Auth logs weekly
   - Review Vercel access logs

4. **Keep dependencies updated**
   ```bash
   npm audit
   npm audit fix
   ```

5. **Enable 2FA**
   - On GitHub account
   - On Vercel account
   - On Supabase account

## Support

For deployment issues:

- **Vercel Support**: [vercel.com/support](https://vercel.com/support)
- **Supabase Support**: [supabase.com/support](https://supabase.com/support)
- **Project Issues**: Open a GitHub issue

---

**Last Updated:** 2025-10-30
