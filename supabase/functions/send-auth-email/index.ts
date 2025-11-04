import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    console.log("Received auth email request:", payload.email_data.email_action_type);

    const { user, email_data } = payload;
    const { token_hash, email_action_type, redirect_to } = email_data;
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const confirmLink = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;

    let subject = "";
    let html = "";

    // Generate email content based on action type
    if (email_action_type === "recovery" || email_action_type === "magiclink") {
      subject = "Reset Your Password | Addis Lidet International Church";
      html = `
        <!DOCTYPE html>
        <html lang="en" style="margin:0;padding:0;">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Reset Your Password | Addis Lidet International Church</title>
            <style>
              body {
                font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
                background-color: #f7f7f7;
                margin: 0;
                padding: 0;
                color: #333333;
              }
              .container {
                max-width: 600px;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 10px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #b22222, #8b0000);
                padding: 20px;
                text-align: center;
                color: #ffffff;
              }
              .header img {
                width: 80px;
                height: 80px;
                margin-bottom: 10px;
              }
              .content {
                padding: 30px 40px;
                text-align: center;
              }
              .content h2 {
                color: #b22222;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .content p {
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
              }
              .btn {
                background-color: #b22222;
                color: #ffffff;
                text-decoration: none;
                padding: 14px 32px;
                border-radius: 6px;
                font-weight: 600;
                display: inline-block;
                transition: background 0.3s ease;
              }
              .btn:hover {
                background-color: #8b0000;
              }
              .footer {
                background: #fafafa;
                text-align: center;
                padding: 20px;
                font-size: 13px;
                color: #888888;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <img src="https://addislidetchurch.org/wp-content/uploads/2021/08/cropped-logo-192x192.png" alt="Addis Lidet International Church Logo" />
                <h1>Addis Lidet International Church</h1>
              </div>
              <div class="content">
                <h2>Reset Your Password</h2>
                <p>
                  Dear member,<br />
                  You recently requested to reset your password for your
                  <strong>Addis Lidet International Church</strong> account.
                  Click the button below to proceed.
                </p>
                <a href="${confirmLink}" class="btn">Reset Password</a>
                <p>
                  If you did not request a password reset, please ignore this email or contact
                  our support team for assistance.
                </p>
              </div>
              <div class="footer">
                © ${new Date().getFullYear()} Addis Lidet International Church<br />
                <a href="https://addislidet.info" style="color:#b22222;text-decoration:none;">addislidet.info</a>
              </div>
            </div>
          </body>
        </html>
      `;
    } else if (email_action_type === "signup" || email_action_type === "invite") {
      subject = "Welcome to Addis Lidet International Church";
      html = `
        <!DOCTYPE html>
        <html lang="en" style="margin:0;padding:0;">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Welcome | Addis Lidet International Church</title>
            <style>
              body {
                font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
                background-color: #f7f7f7;
                margin: 0;
                padding: 0;
                color: #333333;
              }
              .container {
                max-width: 600px;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 10px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #b22222, #8b0000);
                padding: 20px;
                text-align: center;
                color: #ffffff;
              }
              .header img {
                width: 80px;
                height: 80px;
                margin-bottom: 10px;
              }
              .content {
                padding: 30px 40px;
                text-align: center;
              }
              .content h2 {
                color: #b22222;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .content p {
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
              }
              .btn {
                background-color: #b22222;
                color: #ffffff;
                text-decoration: none;
                padding: 14px 32px;
                border-radius: 6px;
                font-weight: 600;
                display: inline-block;
                transition: background 0.3s ease;
              }
              .btn:hover {
                background-color: #8b0000;
              }
              .footer {
                background: #fafafa;
                text-align: center;
                padding: 20px;
                font-size: 13px;
                color: #888888;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <img src="https://addislidetchurch.org/wp-content/uploads/2021/08/cropped-logo-192x192.png" alt="Addis Lidet International Church Logo" />
                <h1>Addis Lidet International Church</h1>
              </div>
              <div class="content">
                <h2>Welcome!</h2>
                <p>
                  Dear member,<br />
                  Thank you for joining <strong>Addis Lidet International Church</strong>.
                  Please confirm your email address by clicking the button below to complete your registration.
                </p>
                <a href="${confirmLink}" class="btn">Confirm Email</a>
                <p>
                  If you didn't create an account, you can safely ignore this email.
                </p>
              </div>
              <div class="footer">
                © ${new Date().getFullYear()} Addis Lidet International Church<br />
                <a href="https://addislidet.info" style="color:#b22222;text-decoration:none;">addislidet.info</a>
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

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-auth-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
};

serve(handler);
