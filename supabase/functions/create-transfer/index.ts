// Supabase Edge Function: create-transfer
// Handles transfer creation with validation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify user from token
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      team_id,
      after_event_id,
      climber_out_id,
      climber_in_id,
      new_captain_id,
    } = await req.json();

    // Validate required fields
    if (!team_id || !after_event_id || !climber_out_id || !climber_in_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify team ownership
    const { data: team } = await supabaseClient
      .from("fantasy_teams")
      .select("user_id, league_id")
      .eq("id", team_id)
      .single();

    if (!team || team.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get league settings
    const { data: league } = await supabaseClient
      .from("leagues")
      .select("transfers_per_event, tier_config, discipline, gender")
      .eq("id", team.league_id)
      .single();

    if (!league) {
      return new Response(JSON.stringify({ error: "League not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check transfer count for this event
    const { count: existingTransfers } = await supabaseClient
      .from("team_transfers")
      .select("id", { count: "exact", head: true })
      .eq("team_id", team_id)
      .eq("after_event_id", after_event_id)
      .is("reverted_at", null);

    if ((existingTransfers || 0) >= league.transfers_per_event) {
      return new Response(
        JSON.stringify({
          error: `Maximum ${league.transfers_per_event} transfers per event`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify climber_out is in current roster
    const { data: currentRoster } = await supabaseClient
      .from("team_roster")
      .select("climber_id, is_captain")
      .eq("team_id", team_id)
      .is("removed_at", null);

    const rosterIds = (currentRoster || []).map((r) => r.climber_id);

    if (!rosterIds.includes(climber_out_id)) {
      return new Response(
        JSON.stringify({ error: "Climber to remove is not in roster" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (rosterIds.includes(climber_in_id)) {
      return new Response(
        JSON.stringify({ error: "Climber already in roster" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date().toISOString();

    // Create the transfer record
    const { data: transfer, error: transferError } = await supabaseClient
      .from("team_transfers")
      .insert({
        team_id,
        after_event_id,
        climber_out_id,
        climber_in_id,
        created_at: now,
      })
      .select()
      .single();

    if (transferError) throw transferError;

    // Update roster: mark old climber as removed
    await supabaseClient
      .from("team_roster")
      .update({ removed_at: now })
      .eq("team_id", team_id)
      .eq("climber_id", climber_out_id)
      .is("removed_at", null);

    // Check if removed player was captain
    const removedEntry = currentRoster?.find(
      (r) => r.climber_id === climber_out_id
    );
    const wasCaptain = removedEntry?.is_captain ?? false;

    // Add new climber to roster
    await supabaseClient.from("team_roster").insert({
      team_id,
      climber_id: climber_in_id,
      is_captain: wasCaptain && !new_captain_id,
      added_at: now,
    });

    // Handle captain change if needed
    if (new_captain_id || wasCaptain) {
      const captainId = new_captain_id || climber_in_id;

      // Update all roster entries
      await supabaseClient
        .from("team_roster")
        .update({ is_captain: false })
        .eq("team_id", team_id)
        .is("removed_at", null);

      await supabaseClient
        .from("team_roster")
        .update({ is_captain: true })
        .eq("team_id", team_id)
        .eq("climber_id", captainId)
        .is("removed_at", null);

      // Update captain history
      await supabaseClient
        .from("captain_history")
        .update({ replaced_at: now })
        .eq("team_id", team_id)
        .is("replaced_at", null);

      await supabaseClient.from("captain_history").insert({
        team_id,
        climber_id: captainId,
        set_at: now,
      });
    }

    return new Response(JSON.stringify(transfer), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating transfer:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
