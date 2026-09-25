/**
 * Seed script to import users from CSV file
 * This script creates user accounts for all ministry leaders from the CSV file
 *
 * Usage: npx tsx scripts/seed-users.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;

// Prefer the newer, independently revocable secret key (sb_secret_...). The
// legacy SUPABASE_SERVICE_ROLE_KEY still works as a fallback, so this script
// keeps running either side of the migration - but the legacy one cannot be
// revoked without rotating the JWT secret, which signs every user out.
const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  console.error('Required: VITE_SUPABASE_URL, and SUPABASE_SECRET_KEY');
  console.error('(SUPABASE_SERVICE_ROLE_KEY is accepted as a legacy fallback)');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface UserData {
  ministryName: string;
  fullName: string;
  email: string;
  phoneNumber: string;
}

// Parse CSV file
function parseCSV(filePath: string): UserData[] {
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  // Skip header
  const dataLines = lines.slice(1);

  const users: UserData[] = [];

  for (const line of dataLines) {
    // Handle quoted fields that may contain commas
    const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);

    if (!matches || matches.length < 3) continue;

    const [ministryName, fullName, email, phoneNumber = ''] = matches.map(m =>
      m.replace(/^"(.*)"$/, '$1').trim()
    );

    // Skip if email is invalid or missing
    if (!email || !email.includes('@') || !fullName) {
      console.log(`Skipping invalid entry: ${fullName || 'Unknown'}`);
      continue;
    }

    users.push({
      ministryName,
      fullName,
      email,
      phoneNumber: phoneNumber || ''
    });
  }

  return users;
}

// Create user in Supabase Auth
async function createUser(userData: UserData, isAdmin: boolean = false) {
  try {
    // Generate a temporary password (users should reset on first login)
    const tempPassword = `ALIC${Math.random().toString(36).slice(-8)}!`;

    console.log(`Creating user: ${userData.fullName} (${userData.email})`);

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userData.email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: userData.fullName,
        ministry: userData.ministryName
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log(`  ⚠️  User already exists: ${userData.email}`);
        return { success: true, alreadyExists: true };
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error('User creation failed - no user returned');
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: userData.fullName,
        email: userData.email,
        phone_number: userData.phoneNumber
      });

    if (profileError) {
      console.error(`  ❌ Profile creation failed for ${userData.email}:`, profileError.message);
      // Clean up auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    // Assign role
    const role = isAdmin ? 'admin' : 'contributor';
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: role
      });

    if (roleError) {
      console.error(`  ❌ Role assignment failed for ${userData.email}:`, roleError.message);
      throw roleError;
    }

    console.log(`  ✅ Created successfully with role: ${role}`);
    console.log(`  🔑 Temporary password: ${tempPassword}`);

    return { success: true, password: tempPassword, user: authData.user };
  } catch (error) {
    console.error(`  ❌ Failed to create ${userData.email}:`, error);
    return { success: false, error };
  }
}

// Main function
async function main() {
  console.log('🚀 Starting user seed process...\n');

  // Find CSV file
  const csvPath = path.join(process.cwd(), 'ALIC MD Leaders Name(Ministry leaders).csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found at: ${csvPath}`);
    console.error('Please ensure the CSV file is in the project root directory');
    process.exit(1);
  }

  console.log(`📄 Reading CSV file: ${csvPath}\n`);

  // Parse CSV
  const users = parseCSV(csvPath);
  console.log(`📊 Found ${users.length} users to import\n`);

  // List of admin emails (you can customize this)
  const adminEmails = [
    'alicmd.admin@gmail.com', // Abera Debela - Admin
    'alicmd.evandisc@gmail.com', // Pastor Benyam Aboye
    'alicmd.teaching@gmail.com', // Pastor Benyam Aboye
  ];

  let successCount = 0;
  let failCount = 0;
  let existingCount = 0;

  const credentials: Array<{ email: string; password: string; role: string }> = [];

  // Process each user
  for (const user of users) {
    const isAdmin = adminEmails.includes(user.email);
    const result = await createUser(user, isAdmin);

    if (result.success) {
      if (result.alreadyExists) {
        existingCount++;
      } else {
        successCount++;
        if (result.password) {
          credentials.push({
            email: user.email,
            password: result.password,
            role: isAdmin ? 'admin' : 'contributor'
          });
        }
      }
    } else {
      failCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n📊 Summary:');
  console.log(`  ✅ Successfully created: ${successCount}`);
  console.log(`  ⚠️  Already existed: ${existingCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  📧 Total processed: ${users.length}`);

  // Save credentials to file
  if (credentials.length > 0) {
    const credentialsPath = path.join(process.cwd(), 'user-credentials.json');
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
    console.log(`\n🔐 Credentials saved to: ${credentialsPath}`);
    console.log('⚠️  IMPORTANT: Send these credentials securely to users and delete this file!');
  }

  console.log('\n✨ Seed process complete!');
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
