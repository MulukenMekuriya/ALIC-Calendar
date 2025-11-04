# Supabase Authentication Configuration

## Password Reset Configuration

To ensure password reset emails work correctly in both development and production, you need to configure the allowed redirect URLs in your Supabase dashboard.

### Steps to Configure Redirect URLs

1. **Go to Supabase Dashboard**

   - Navigate to [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your project

2. **Navigate to Authentication Settings**

   - Click on "Authentication" in the left sidebar
   - Click on "URL Configuration"

3. **Configure Site URL**

   - Set the **Site URL** to your production domain:
     ```
     https://addislidet.info
     ```

4. **Add Redirect URLs**
   Add the following URLs to the **Redirect URLs** list:

   **Production:**

   ```
   https://addislidet.info/reset-password
   https://addislidet.info/dashboard
   https://addislidet.info/**
   ```

   **Development (if needed):**

   ```
   http://localhost:5173/reset-password
   http://localhost:5173/dashboard
   http://localhost:3000/reset-password
   http://localhost:3000/dashboard
   ```

   **Note:** You can use wildcards for development:

   ```
   http://localhost:**/reset-password
   http://localhost:**/dashboard
   ```

5. **Save Changes**
   - Click "Save" at the bottom of the page

### How Password Reset Works

1. **User Requests Password Reset**

   - User enters their email on `/forgot-password`
   - App calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: url })`
   - Supabase sends an email with a reset link

2. **User Clicks Reset Link**

   - Email contains a link to: `https://[your-project].supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=[your-app-url]`
   - Supabase validates the token
   - If valid, redirects to your app with the token in the URL hash: `https://addislidet.info/reset-password#access_token=...&type=recovery`

3. **User Sets New Password**
   - App detects the recovery token in the URL hash
   - User enters new password
   - App calls `supabase.auth.updateUser({ password: newPassword })`
   - Password is updated and user is redirected to dashboard

### Troubleshooting

#### Issue: "Invalid reset link" or redirects to localhost

**Problem:** Redirect URL is not whitelisted in Supabase

**Solution:**

- Check that your production domain is added to the Redirect URLs list in Supabase dashboard
- Ensure the URL matches exactly (with or without trailing slash)
- Wait a few minutes after saving changes for them to take effect

#### Issue: Email not received

**Problem:** Email delivery issues or SMTP configuration

**Solution:**

- Check Supabase logs in Dashboard > Logs
- Verify your email function is working: Dashboard > Edge Functions > send-auth-email
- Check spam folder
- Ensure the Resend API key is configured correctly

#### Issue: "No token found in URL"

**Problem:** User navigated directly to reset password page

**Solution:**

- User must click the link in the password reset email
- Cannot navigate directly to `/reset-password` without a valid token

### Local Development

For local development, the app automatically uses `window.location.origin`, which will be `http://localhost:[port]`. Make sure to:

1. Add your local development URLs to Supabase redirect URLs
2. Use the same port consistently, or use wildcard URLs
3. Check browser console logs for debugging information

### Testing the Flow

1. **Test on localhost:**

   ```
   1. Start your dev server: npm run dev
   2. Navigate to http://localhost:5173/forgot-password
   3. Enter a test email
   4. Check the Supabase logs or Inbucket (local) for the email
   5. Click the reset link
   6. Should redirect to http://localhost:5173/reset-password#...
   ```

2. **Test on production:**
   ```
   1. Deploy your app to production
   2. Navigate to https://addislidet.info/forgot-password
   3. Enter your email
   4. Check your inbox for the reset email
   5. Click the reset link
   6. Should redirect to https://addislidet.info/reset-password#...
   ```

### Code Changes Made

The following files were updated to fix the password reset flow:

1. **`src/contexts/AuthContext.tsx`**

   - Simplified redirect URL logic to use `window.location.origin`
   - Added console logging for debugging
   - Removed hardcoded production URL

2. **`src/pages/ResetPassword.tsx`**
   - Added better error handling and logging
   - Improved token validation
   - Added delay before redirect after successful password update

### Security Notes

- Password reset tokens are single-use and expire after a set time
- Tokens are validated by Supabase before allowing password updates
- Always use HTTPS in production
- Never share or log sensitive tokens in production code
