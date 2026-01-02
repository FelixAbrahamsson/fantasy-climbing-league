// Supabase Edge Function: get-league-breakdown
// Gets detailed score breakdown per event for all teams in a league

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

    const { league_id } = await req.json();

    if (!league_id) {
      return new Response(JSON.stringify({ error: "league_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get league info
    const { data: league } = await supabaseClient
      .from("leagues")
      .select("captain_multiplier")
      .eq("id", league_id)
      .single();

    const captainMultiplier = league?.captain_multiplier ?? 1.2;

    // Get all teams in league
    const { data: teams } = await supabaseClient
      .from("fantasy_teams")
      .select("id, name, user_id, profiles(username)")
      .eq("league_id", league_id);

    // Get league events
    const { data: leagueEvents } = await supabaseClient
      .from("league_events")
      .select("event_id")
      .eq("league_id", league_id);

    const eventIds = (leagueEvents || []).map((le) => le.event_id);

    // Get events
    const { data: events } = await supabaseClient
      .from("events")
      .select("id, name, date, status")
      .in("id", eventIds)
      .order("date", { ascending: true });

    const eventBreakdowns = [];

    for (const event of events || []) {
      const eventDate = new Date(event.date);

      const teamsData = [];

      for (const team of teams || []) {
        // Get roster entries for this team
        const { data: rosterEntries } = await supabaseClient
          .from("team_roster")
          .select("climber_id, is_captain, added_at, removed_at")
          .eq("team_id", team.id);

        // Get captain history
        const { data: captainHistory } = await supabaseClient
          .from("captain_history")
          .select("climber_id, set_at, replaced_at")
          .eq("team_id", team.id);

        // Find active roster at event time
        const activeClimberIds: number[] = [];
        let captainAtEvent: number | null = null;

        for (const entry of rosterEntries || []) {
          const addedAt = new Date(entry.added_at);
          const removedAt = entry.removed_at
            ? new Date(entry.removed_at)
            : null;

          if (addedAt <= eventDate && (!removedAt || removedAt > eventDate)) {
            activeClimberIds.push(entry.climber_id);
            if (entry.is_captain) captainAtEvent = entry.climber_id;
          }
        }

        // Check captain history
        for (const ch of captainHistory || []) {
          const setAt = new Date(ch.set_at);
          const replacedAt = ch.replaced_at ? new Date(ch.replaced_at) : null;

          if (setAt <= eventDate && (!replacedAt || replacedAt > eventDate)) {
            captainAtEvent = ch.climber_id;
            break;
          }
        }

        if (activeClimberIds.length === 0) {
          teamsData.push({
            team_id: team.id,
            team_name: team.name,
            username:
              (team.profiles as { username?: string })?.username ?? null,
            team_total: 0,
            athletes: [],
          });
          continue;
        }

        // Get climber details and results
        const { data: climbers } = await supabaseClient
          .from("climbers")
          .select("id, name, country")
          .in("id", activeClimberIds);

        const { data: results } = await supabaseClient
          .from("event_results")
          .select("climber_id, rank")
          .eq("event_id", event.id)
          .in("climber_id", activeClimberIds);

        const resultsMap: Record<number, number> = {};
        (results || []).forEach((r) => {
          resultsMap[r.climber_id] = r.rank;
        });

        const athletes = (climbers || []).map((climber) => {
          const rank = resultsMap[climber.id] ?? null;
          const basePoints = rank ? getPointsForRank(rank) : 0;
          const isCaptain = climber.id === captainAtEvent;
          const multiplier = isCaptain ? captainMultiplier : 1.0;
          const points = Math.floor(basePoints * multiplier);

          return {
            climber_id: climber.id,
            climber_name: climber.name,
            country: climber.country,
            is_captain: isCaptain,
            rank,
            points,
          };
        });

        const teamTotal = athletes.reduce((sum, a) => sum + a.points, 0);

        teamsData.push({
          team_id: team.id,
          team_name: team.name,
          username: (team.profiles as { username?: string })?.username ?? null,
          team_total: teamTotal,
          athletes,
        });
      }

      eventBreakdowns.push({
        event_id: event.id,
        event_name: event.name,
        event_date: event.date,
        event_status: event.status,
        teams: teamsData,
      });
    }

    return new Response(
      JSON.stringify({
        league_id,
        events: eventBreakdowns,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error getting league breakdown:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
