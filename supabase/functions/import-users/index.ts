import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UserData {
  ministry_name: string;
  full_name: string;
  email: string;
  phone_number: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { users } = (await req.json()) as { users: UserData[] };

    if (!users || !Array.isArray(users)) {
      throw new Error("Invalid users data");
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    const defaultPassword = "AlicMD2025!";

    for (const user of users) {
      if (
        !user.email ||
        !user.email.includes("@") ||
        user.email === "alicmd.@gmail.com"
      ) {
        results.failed++;
        results.errors.push(`Invalid email for ${user.full_name}`);
        continue;
      }

      try {
        // Create auth user with admin API
        const { data: authData, error: authError } =
          await supabaseAdmin.auth.admin.createUser({
            email: user.email,
            password: defaultPassword,
            email_confirm: true,
            user_metadata: {
              full_name: user.full_name,
            },
          });

        if (authError) {
          if (
            authError.message.includes("already registered") ||
            authError.message.includes("duplicate")
          ) {
            results.failed++;
            results.errors.push(`${user.email} already exists`);
          } else {
            throw authError;
          }
        } else if (authData.user) {
          // Manually create profile since trigger might not fire with admin API
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert({
              id: authData.user.id,
              email: user.email,
              full_name: user.full_name,
              phone_number: user.phone_number || null,
              ministry_name: user.ministry_name || null,
            });

          if (profileError) {
            console.error("Profile creation error:", profileError);
          }

          results.success++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(
          `${user.email}: ${error instanceof Error ? error.message : "Failed"}`
        );
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
