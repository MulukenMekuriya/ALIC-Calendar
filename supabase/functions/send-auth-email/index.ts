import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CHURCH_NAME =
  Deno.env.get("CHURCH_NAME") || "Addis Lidet International Church";
const CHURCH_LOGO_URL =
  Deno.env.get("CHURCH_LOGO_URL") || "https://addislidet.info/logo.png";
const APP_URL = Deno.env.get("APP_URL") || "https://app.addislidet.info";

interface AuthEmailPayload {
  user: {
    email: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: AuthEmailPayload = await req.json();
    console.log(
      "Received auth email request:",
      payload.email_data.email_action_type
    );

    const { user, email_data } = payload;
    const { token_hash, email_action_type, redirect_to } = email_data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const confirmLink = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;

    let subject = "";
    let html = "";

    // Generate email content based on action type
    if (email_action_type === "recovery" || email_action_type === "magiclink") {
      subject = "🔐 Reset Your Password | Addis Lidet International Church";
      html = `
        <!DOCTYPE html>
        <html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
          <head>
            <meta charset="UTF-8" />
            <meta http-equiv="X-UA-Compatible" content="IE=edge" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta name="x-apple-disable-message-reformatting" />
            <meta name="format-detection" content="telephone=no" />
            <title>Reset Your Password | Addis Lidet International Church</title>
            <!--[if mso]>
            <noscript>
              <xml>
                <o:OfficeDocumentSettings>
                  <o:PixelsPerInch>96</o:PixelsPerInch>
                </o:OfficeDocumentSettings>
              </xml>
            </noscript>
            <![endif]-->
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background-color: #f5f7fa;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              .email-wrapper {
                width: 100%;
                background-color: #f5f7fa;
                padding: 40px 20px;
              }
              .email-container {
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.08);
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #b22222 0%, #8b0000 100%);
                padding: 48px 40px;
                text-align: center;
                position: relative;
              }
              .header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)" /></svg>');
                opacity: 0.3;
              }
              .logo-container {
                background: rgba(255, 255, 255, 0.15);
                backdrop-filter: blur(10px);
                width: 96px;
                height: 96px;
                border-radius: 24px;
                margin: 0 auto 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                position: relative;
                z-index: 1;
              }
              .logo-container img {
                width: 64px;
                height: 64px;
                border-radius: 12px;
              }
              .header h1 {
                color: #ffffff;
                font-size: 26px;
                font-weight: 700;
                margin: 0;
                letter-spacing: -0.5px;
                position: relative;
                z-index: 1;
              }
              .content {
                padding: 48px 40px;
              }
              .security-badge {
                background: #fef3f2;
                border: 2px solid #fee4e2;
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 32px;
                text-align: center;
              }
              .security-badge-icon {
                font-size: 32px;
                margin-bottom: 8px;
              }
              .security-badge-text {
                color: #b42318;
                font-size: 14px;
                font-weight: 600;
                margin: 0;
              }
              .greeting {
                font-size: 18px;
                font-weight: 600;
                color: #1a1a1a;
                margin-bottom: 16px;
                text-align: left;
              }
              .main-text {
                font-size: 16px;
                line-height: 1.7;
                color: #4a5568;
                margin-bottom: 32px;
                text-align: left;
              }
              .main-text strong {
                color: #1a1a1a;
                font-weight: 600;
              }
              .button-container {
                text-align: center;
                margin: 40px 0;
              }
              .btn {
                background: linear-gradient(135deg, #b22222 0%, #8b0000 100%);
                color: #ffffff !important;
                text-decoration: none;
                padding: 18px 48px;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
                display: inline-block;
                box-shadow: 0 4px 16px rgba(178, 34, 34, 0.3);
                transition: all 0.3s ease;
                letter-spacing: 0.3px;
              }
              .btn:hover {
                box-shadow: 0 6px 24px rgba(178, 34, 34, 0.4);
                transform: translateY(-2px);
              }
              .time-sensitive {
                background: #fff7ed;
                border-left: 4px solid #fb923c;
                padding: 16px;
                margin: 32px 0;
                border-radius: 8px;
              }
              .time-sensitive p {
                margin: 0;
                font-size: 14px;
                color: #92400e;
                line-height: 1.6;
              }
              .time-sensitive strong {
                color: #9a3412;
              }
              .support-section {
                background: #f8fafc;
                border-radius: 12px;
                padding: 24px;
                margin-top: 32px;
                text-align: center;
              }
              .support-section p {
                margin: 0 0 16px 0;
                font-size: 14px;
                color: #64748b;
              }
              .support-link {
                color: #b22222;
                text-decoration: none;
                font-weight: 600;
                font-size: 14px;
              }
              .divider {
                height: 1px;
                background: linear-gradient(to right, transparent, #e2e8f0, transparent);
                margin: 32px 0;
              }
              .footer {
                background: #1a1a1a;
                padding: 40px;
                text-align: center;
              }
              .footer-content {
                color: #a0aec0;
                font-size: 13px;
                line-height: 1.8;
                margin-bottom: 20px;
              }
              .footer-links {
                margin: 20px 0;
              }
              .footer-link {
                color: #cbd5e0;
                text-decoration: none;
                font-size: 13px;
                margin: 0 12px;
                font-weight: 500;
              }
              .footer-link:hover {
                color: #ffffff;
              }
              .social-icons {
                margin: 24px 0;
              }
              .copyright {
                color: #718096;
                font-size: 12px;
                margin-top: 20px;
              }
              .website-link {
                color: #b22222;
                text-decoration: none;
                font-weight: 600;
              }
              .website-link:hover {
                text-decoration: underline;
              }
              @media only screen and (max-width: 600px) {
                .email-wrapper {
                  padding: 20px 10px !important;
                }
                .header {
                  padding: 32px 24px !important;
                }
                .content {
                  padding: 32px 24px !important;
                }
                .footer {
                  padding: 32px 24px !important;
                }
                .btn {
                  padding: 16px 32px !important;
                  font-size: 15px !important;
                }
              }
            </style>
          </head>
          <body>
            <div class="email-wrapper">
              <div class="email-container">
                <!-- Header -->
                <div class="header">
                  <div class="logo-container">
                    <img src="${CHURCH_LOGO_URL}" alt="${CHURCH_NAME}" />
                  </div>
                  <h1>${CHURCH_NAME}</h1>
                </div>
                
                <!-- Content -->
                <div class="content">
                  <!-- Security Badge -->
                  <div class="security-badge">
                    <div class="security-badge-icon">🔐</div>
                    <p class="security-badge-text">Secure Password Reset Request</p>
                  </div>
                  
                  <p class="greeting">Hello,</p>
                  
                  <p class="main-text">
                    We received a request to reset the password for your <strong>ALIC Church Management</strong> account. 
                    If you made this request, click the button below to create a new password.
                  </p>
                  
                  <!-- CTA Button -->
                  <div class="button-container">
                    <a href="${confirmLink}" class="btn">Reset My Password</a>
                  </div>
                  
                  <!-- Time Sensitive Notice -->
                  <div class="time-sensitive">
                    <p>
                      <strong>⏰ This link expires in 1 hour</strong><br>
                      For your security, this password reset link can only be used once and will expire soon.
                    </p>
                  </div>
                  
                  <div class="divider"></div>
                  
                  <!-- Security Note -->
                  <p class="main-text">
                    <strong>Didn't request this?</strong><br>
                    If you didn't request a password reset, you can safely ignore this email. 
                    Your password will remain unchanged, and your account is secure.
                  </p>
                  
                  <!-- Support Section -->
                  <div class="support-section">
                    <p>Need help? Our support team is here for you.</p>
                    <a href="mailto:support@addislidet.info" class="support-link">Contact Support →</a>
                  </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                  <div class="footer-content">
                    <strong style="color: #cbd5e0;">Addis Lidet International Church</strong><br>
                    Church Management System
                  </div>
                  
                  <div class="footer-links">
                    <a href="https://addislidet.info" class="footer-link">Visit Website</a>
                    <span style="color: #4a5568;">•</span>
                    <a href="https://addislidet.info/support" class="footer-link">Get Support</a>
                    <span style="color: #4a5568;">•</span>
                    <a href="https://addislidet.info/privacy" class="footer-link">Privacy</a>
                  </div>
                  
                  <div class="copyright">
                    © ${new Date().getFullYear()} Addis Lidet International Church. All rights reserved.<br>
                    <a href="https://addislidet.info" class="website-link">addislidet.info</a>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
    } else if (
      email_action_type === "signup" ||
      email_action_type === "invite"
    ) {
      subject =
        "✨ Welcome to ALIC Church Management | Addis Lidet International Church";
      html = `
        <!DOCTYPE html>
        <html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
          <head>
            <meta charset="UTF-8" />
            <meta http-equiv="X-UA-Compatible" content="IE=edge" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta name="x-apple-disable-message-reformatting" />
            <meta name="format-detection" content="telephone=no" />
            <title>Welcome | Addis Lidet International Church</title>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background-color: #f5f7fa;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              .email-wrapper {
                width: 100%;
                background-color: #f5f7fa;
                padding: 40px 20px;
              }
              .email-container {
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.08);
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #b22222 0%, #8b0000 100%);
                padding: 48px 40px;
                text-align: center;
                position: relative;
              }
              .header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)" /></svg>');
                opacity: 0.3;
              }
              .logo-container {
                background: rgba(255, 255, 255, 0.15);
                backdrop-filter: blur(10px);
                width: 96px;
                height: 96px;
                border-radius: 24px;
                margin: 0 auto 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                position: relative;
                z-index: 1;
              }
              .logo-container img {
                width: 64px;
                height: 64px;
                border-radius: 12px;
              }
              .header h1 {
                color: #ffffff;
                font-size: 26px;
                font-weight: 700;
                margin: 0;
                letter-spacing: -0.5px;
                position: relative;
                z-index: 1;
              }
              .content {
                padding: 48px 40px;
              }
              .welcome-badge {
                background: linear-gradient(135deg, #fef3f2 0%, #fff7ed 100%);
                border: 2px solid #fed7aa;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 32px;
                text-align: center;
              }
              .welcome-badge-icon {
                font-size: 48px;
                margin-bottom: 8px;
              }
              .welcome-badge-text {
                color: #b22222;
                font-size: 16px;
                font-weight: 700;
                margin: 0;
              }
              .greeting {
                font-size: 24px;
                font-weight: 700;
                color: #1a1a1a;
                margin-bottom: 16px;
                text-align: center;
              }
              .main-text {
                font-size: 16px;
                line-height: 1.7;
                color: #4a5568;
                margin-bottom: 24px;
                text-align: center;
              }
              .main-text strong {
                color: #1a1a1a;
                font-weight: 600;
              }
              .button-container {
                text-align: center;
                margin: 40px 0;
              }
              .btn {
                background: linear-gradient(135deg, #b22222 0%, #8b0000 100%);
                color: #ffffff !important;
                text-decoration: none;
                padding: 18px 48px;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
                display: inline-block;
                box-shadow: 0 4px 16px rgba(178, 34, 34, 0.3);
                transition: all 0.3s ease;
                letter-spacing: 0.3px;
              }
              .btn:hover {
                box-shadow: 0 6px 24px rgba(178, 34, 34, 0.4);
                transform: translateY(-2px);
              }
              .features {
                background: #f8fafc;
                border-radius: 12px;
                padding: 32px;
                margin: 32px 0;
              }
              .features h3 {
                font-size: 18px;
                font-weight: 700;
                color: #1a1a1a;
                margin-bottom: 24px;
                text-align: center;
              }
              .feature-item {
                display: flex;
                align-items: flex-start;
                margin-bottom: 20px;
                text-align: left;
              }
              .feature-icon {
                font-size: 24px;
                margin-right: 16px;
                flex-shrink: 0;
              }
              .feature-content h4 {
                font-size: 15px;
                font-weight: 600;
                color: #1a1a1a;
                margin-bottom: 4px;
              }
              .feature-content p {
                font-size: 14px;
                color: #64748b;
                margin: 0;
                line-height: 1.5;
              }
              .divider {
                height: 1px;
                background: linear-gradient(to right, transparent, #e2e8f0, transparent);
                margin: 32px 0;
              }
              .support-section {
                background: #f8fafc;
                border-radius: 12px;
                padding: 24px;
                margin-top: 32px;
                text-align: center;
              }
              .support-section p {
                margin: 0 0 16px 0;
                font-size: 14px;
                color: #64748b;
              }
              .support-link {
                color: #b22222;
                text-decoration: none;
                font-weight: 600;
                font-size: 14px;
              }
              .footer {
                background: #1a1a1a;
                padding: 40px;
                text-align: center;
              }
              .footer-content {
                color: #a0aec0;
                font-size: 13px;
                line-height: 1.8;
                margin-bottom: 20px;
              }
              .footer-links {
                margin: 20px 0;
              }
              .footer-link {
                color: #cbd5e0;
                text-decoration: none;
                font-size: 13px;
                margin: 0 12px;
                font-weight: 500;
              }
              .footer-link:hover {
                color: #ffffff;
              }
              .copyright {
                color: #718096;
                font-size: 12px;
                margin-top: 20px;
              }
              .website-link {
                color: #b22222;
                text-decoration: none;
                font-weight: 600;
              }
              .website-link:hover {
                text-decoration: underline;
              }
              @media only screen and (max-width: 600px) {
                .email-wrapper {
                  padding: 20px 10px !important;
                }
                .header {
                  padding: 32px 24px !important;
                }
                .content {
                  padding: 32px 24px !important;
                }
                .footer {
                  padding: 32px 24px !important;
                }
                .btn {
                  padding: 16px 32px !important;
                  font-size: 15px !important;
                }
                .features {
                  padding: 24px !important;
                }
              }
            </style>
          </head>
          <body>
            <div class="email-wrapper">
              <div class="email-container">
                <!-- Header -->
                <div class="header">
                  <div class="logo-container">
                    <img src="${CHURCH_LOGO_URL}" alt="${CHURCH_NAME}" />
                  </div>
                  <h1>${CHURCH_NAME}</h1>
                </div>
                
                <!-- Content -->
                <div class="content">
                  <!-- Welcome Badge -->
                  <div class="welcome-badge">
                    <div class="welcome-badge-icon">🎉</div>
                    <p class="welcome-badge-text">Welcome to ${CHURCH_NAME} Management</p>
                  </div>
                  
                  <p class="greeting">Welcome to Our Community!</p>
                  
                  <p class="main-text">
                    Thank you for joining the <strong>ALIC Church Management System</strong>. 
                    We're excited to have you on board! To get started, please confirm your email address.
                  </p>
                  
                  <!-- CTA Button -->
                  <div class="button-container">
                    <a href="${confirmLink}" class="btn">Confirm Email Address</a>
                  </div>
                  
                  <!-- Features Section -->
                  <div class="features">
                    <h3>What You Can Do</h3>
                    
                    <div class="feature-item">
                      <div class="feature-icon">📅</div>
                      <div class="feature-content">
                        <h4>Manage Events</h4>
                        <p>Create and manage church events with ease</p>
                      </div>
                    </div>
                    
                    <div class="feature-item">
                      <div class="feature-icon">🏢</div>
                      <div class="feature-content">
                        <h4>Book Rooms</h4>
                        <p>Reserve rooms and facilities for your activities</p>
                      </div>
                    </div>
                    
                    <div class="feature-item">
                      <div class="feature-icon">👥</div>
                      <div class="feature-content">
                        <h4>Collaborate</h4>
                        <p>Work together with your ministry team</p>
                      </div>
                    </div>
                    
                    <div class="feature-item">
                      <div class="feature-icon">📊</div>
                      <div class="feature-content">
                        <h4>Track Progress</h4>
                        <p>Monitor event approvals and updates in real-time</p>
                      </div>
                    </div>
                  </div>
                  
                  <div class="divider"></div>
                  
                  <p class="main-text">
                    If you didn't create this account, you can safely ignore this email.
                  </p>
                  
                  <!-- Support Section -->
                  <div class="support-section">
                    <p>Questions? We're here to help!</p>
                    <a href="mailto:support@addislidet.info" class="support-link">Contact Support →</a>
                  </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                  <div class="footer-content">
                    <strong style="color: #cbd5e0;">Addis Lidet International Church</strong><br>
                    Church Management System
                  </div>
                  
                  <div class="footer-links">
                    <a href="https://addislidet.info" class="footer-link">Visit Website</a>
                    <span style="color: #4a5568;">•</span>
                    <a href="https://addislidet.info/support" class="footer-link">Get Support</a>
                    <span style="color: #4a5568;">•</span>
                    <a href="https://addislidet.info/privacy" class="footer-link">Privacy</a>
                  </div>
                  
                  <div class="copyright">
                    © ${new Date().getFullYear()} Addis Lidet International Church. All rights reserved.<br>
                    <a href="https://addislidet.info" class="website-link">addislidet.info</a>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
    } else {
      subject = "Verify Your Email";
      html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Email Verification</h1>
            </div>
            <div style="background: white; padding: 40px 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; margin-bottom: 30px;">Please verify your email address by clicking the button below:</p>
              <div style="text-align: center; margin: 40px 0;">
                <a href="${confirmLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Verify Email</a>
              </div>
            </div>
            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${confirmLink}</p>
            </div>
          </body>
        </html>
      `;
    }

    const { data, error } = await resend.emails.send({
      from: "Addis Lidet International Church <team@addislidet.info>",
      to: [user.email],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw error;
    }

    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-auth-email function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }
};

serve(handler);
