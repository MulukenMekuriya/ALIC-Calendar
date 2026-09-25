# User Seeding Script

This directory contains scripts for seeding the database with initial data.

## Seed Users from CSV

The `seed-users.ts` script imports ministry leaders from the CSV file and creates user accounts with appropriate roles.

### Prerequisites

1. Make sure you have the CSV file `ALIC MD Leaders Name(Ministry leaders).csv` in the project root
2. Set up your environment variables in `.env`:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   ALIC_SERVICE_KEY=sb_secret_your_key_here
   ```

   **Important:** You need the service role key (not the anon key) to create users via the Admin API.

### Usage

```bash
npm run seed:users
```

### What it does

1. Reads the CSV file containing ministry leader information
2. For each valid entry:
   - Creates a user in Supabase Auth
   - Generates a temporary password
   - Creates a profile entry
   - Assigns role (admin or contributor)
3. Saves all generated credentials to `user-credentials.json`

### Admin Users

The following email addresses are designated as admins:
- `alicmd.admin@gmail.com` (Abera Debela - Admin)
- `alicmd.evandisc@gmail.com` (Pastor Benyam Aboye)
- `alicmd.teaching@gmail.com` (Pastor Benyam Aboye)

All other users are assigned the "contributor" role.

### After Running

1. The script will create a `user-credentials.json` file with all temporary passwords
2. **IMPORTANT:** Send these credentials securely to each user
3. **IMPORTANT:** Delete the `user-credentials.json` file after distribution
4. Users should change their password on first login

### Troubleshooting

- **"User already exists"**: This is normal if you've run the script before. Existing users are skipped.
- **"Missing environment variables"**: Make sure your `.env` file has both `VITE_SUPABASE_URL` and `ALIC_SERVICE_KEY` (the legacy `SUPABASE_SERVICE_ROLE_KEY` is still accepted as a fallback)
- **"CSV file not found"**: Ensure the CSV file is in the project root directory

### Security Notes

- The service role key bypasses RLS policies - keep it secure
- Never commit the service role key to version control
- Delete credential files after distribution
- Encourage users to change their passwords immediately
