// Supabase Edge Function: get-team-breakdown
// Gets detailed score breakdown per event for a team

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const IFSC_POINTS: Record<number, number> = {
  1: 1000,
  2: 805,
  3: 690,
  4: 610,
  5: 545,
  6: 495,
  7: 455,
  8: 415,
  9: 380,
  10: 350,
  11: 325,
  12: 300,
  13: 280,
  14: 260,
  15: 240,
  16: 220,
  17: 205,
  18: 185,
  19: 170,
  20: 155,
  21: 145,
  22: 130,
  23: 120,
  24: 105,
  25: 95,
  26: 84,
  27: 73,
  28: 63,
  29: 56,
  30: 48,
  31: 42,
  32: 37,
  33: 33,
  34: 30,
  35: 27,
  36: 24,
  37: 21,
  38: 19,
  39: 17,
  40: 15,
};

function getPointsForRank(rank: number): number {
  return IFSC_POINTS[rank] ?? (rank > 40 ? 0 : 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { team_id } = await req.json();

    if (!team_id) {
      return new Response(JSON.stringify({ error: "team_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get team and league info
    const { data: team, error: teamError } = await supabaseClient
      .from("fantasy_teams")
      .select("id, name, league_id, leagues(captain_multiplier)")
      .eq("id", team_id)
      .single();

    if (teamError || !team) {
      return new Response(JSON.stringify({ error: "Team not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const captainMultiplier =
      (team.leagues as { captain_multiplier?: number })?.captain_multiplier ??
      1.2;

    // Get league events
    const { data: leagueEvents } = await supabaseClient
      .from("league_events")
      .select("event_id")
      .eq("league_id", team.league_id);

    const eventIds = (leagueEvents || []).map((le) => le.event_id);

    // Get events
    const { data: events } = await supabaseClient
      .from("events")
      .select("id, name, date, status")
      .in("id", eventIds)
      .order("date", { ascending: true });

    // Get roster entries
    const { data: rosterEntries } = await supabaseClient
      .from("team_roster")
      .select("climber_id, is_captain, added_at, removed_at")
      .eq("team_id", team_id);

    // Get captain history
    const { data: captainHistory } = await supabaseClient
      .from("captain_history")
      .select("climber_id, set_at, replaced_at")
      .eq("team_id", team_id);

    const eventBreakdowns = [];

    for (const event of events || []) {
      const eventDate = new Date(event.date);

      // Get active roster at event time
      const activeClimbers: { id: number; isCaptain: boolean }[] = [];
      let captainAtEvent: number | null = null;

      for (const entry of rosterEntries || []) {
        const addedAt = new Date(entry.added_at);
        const removedAt = entry.removed_at ? new Date(entry.removed_at) : null;

        if (addedAt <= eventDate && (!removedAt || removedAt > eventDate)) {
          activeClimbers.push({
            id: entry.climber_id,
            isCaptain: entry.is_captain,
          });
          if (entry.is_captain) captainAtEvent = entry.climber_id;
        }
      }

      // Check captain history for exact captain at event time
      for (const ch of captainHistory || []) {
        const setAt = new Date(ch.set_at);
        const replacedAt = ch.replaced_at ? new Date(ch.replaced_at) : null;

        if (setAt <= eventDate && (!replacedAt || replacedAt > eventDate)) {
          captainAtEvent = ch.climber_id;
          break;
        }
      }

      const climberIds = activeClimbers.map((c) => c.id);

      // Get climber details and results
      const { data: climbers } = await supabaseClient
        .from("climbers")
        .select("id, name, country")
        .in("id", climberIds);

      const { data: results } = await supabaseClient
        .from("event_results")
        .select("climber_id, rank")
        .eq("event_id", event.id)
        .in("climber_id", climberIds);

      const resultsMap: Record<number, number> = {};
      (results || []).forEach((r) => {
        resultsMap[r.climber_id] = r.rank;
      });

      const athleteScores = (climbers || []).map((climber) => {
        const rank = resultsMap[climber.id] ?? null;
        const basePoints = rank ? getPointsForRank(rank) : 0;
        const isCaptain = climber.id === captainAtEvent;
        const multiplier = isCaptain ? captainMultiplier : 1.0;
        const totalPoints = Math.floor(basePoints * multiplier);

        return {
          climber_id: climber.id,
          climber_name: climber.name,
          country: climber.country,
          is_captain: isCaptain,
          rank,
          base_points: basePoints,
          total_points: totalPoints,
        };
      });

      const teamTotal = athleteScores.reduce(
        (sum, a) => sum + a.total_points,
        0
      );

      eventBreakdowns.push({
        event_id: event.id,
        event_name: event.name,
        event_date: event.date,
        event_status: event.status,
        team_total: teamTotal,
        athlete_scores: athleteScores,
      });
    }

    return new Response(
      JSON.stringify({
        team_id: team.id,
        team_name: team.name,
        league_id: team.league_id,
        events: eventBreakdowns,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error getting team breakdown:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
