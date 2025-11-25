import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  ministry_name?: string;
  role: "admin" | "contributor";
  organization_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create admin client with service role key
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

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // Parse request body
    const { email, password, full_name, ministry_name, role, organization_id } = await req.json() as CreateUserRequest;

    // Validate input
    if (!email || !password || !full_name || !role || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Check if requesting user is admin in the target organization
    const { data: userOrgRole } = await supabaseAdmin
      .from("user_organizations")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .eq("role", "admin")
      .single();

    if (!userOrgRole) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions for this organization" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }
      );
    }

    if (!email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .limit(1);

    let userId: string;

    if (existingUsers && existingUsers.length > 0) {
      // User already exists, just add them to the organization
      userId = existingUsers[0].id;

      // Check if user is already in this organization
      const { data: existingMembership } = await supabaseAdmin
        .from("user_organizations")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", organization_id)
        .single();

      if (existingMembership) {
        return new Response(
          JSON.stringify({ error: "User is already a member of this organization" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }
    } else {
      // Create new auth user with admin API
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
        },
      });

      if (authError) {
        return new Response(
          JSON.stringify({ error: authError.message }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      if (!authData.user) {
        return new Response(
          JSON.stringify({ error: "Failed to create user" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      userId = authData.user.id;

      // Create profile
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: userId,
          email,
          full_name,
          ministry_name: ministry_name || null,
          default_organization_id: organization_id,
        });

      if (profileError) {
        console.error("Profile creation error:", profileError);
        return new Response(
          JSON.stringify({ error: "User created but profile update failed" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }
    }

    // Add user to organization with specified role
    const { error: orgMemberError } = await supabaseAdmin
      .from("user_organizations")
      .insert([{
        user_id: userId,
        organization_id: organization_id,
        role: role,
        is_primary: true,
      }]);

    if (orgMemberError) {
      console.error("Organization membership error:", orgMemberError);
      return new Response(
        JSON.stringify({ error: "User created but organization assignment failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: email,
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
