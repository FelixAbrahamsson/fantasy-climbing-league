// Supabase Edge Function: calculate-leaderboard
// Calculates the full leaderboard for a league including event scores

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// IFSC Scoring Table
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
  41: 14,
  42: 13,
  43: 12,
  44: 11,
  45: 11,
  46: 10,
  47: 9,
  48: 9,
  49: 8,
  50: 8,
  51: 7,
  52: 7,
  53: 7,
  54: 6,
  55: 6,
  56: 6,
  57: 5,
  58: 5,
  59: 5,
  60: 4,
  61: 4,
  62: 4,
  63: 4,
  64: 3,
  65: 3,
  66: 3,
  67: 3,
  68: 3,
  69: 2,
  70: 2,
  71: 2,
  72: 2,
  73: 2,
  74: 2,
  75: 1,
  76: 1,
  77: 1,
  78: 1,
  79: 1,
  80: 1,
};

function getPointsForRank(rank: number): number {
  return IFSC_POINTS[rank] ?? (rank > 80 ? 1 : 0);
}

serve(async (req) => {
  // Handle CORS preflight
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

    // Get all teams in the league
    const { data: teams, error: teamsError } = await supabaseClient
      .from("fantasy_teams")
      .select("id, name, user_id, profiles(username)")
      .eq("league_id", league_id);

    if (teamsError) throw teamsError;
    if (!teams || teams.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get league captain multiplier
    const { data: league } = await supabaseClient
      .from("leagues")
      .select("captain_multiplier")
      .eq("id", league_id)
      .single();

    const captainMultiplier = league?.captain_multiplier ?? 1.2;

    // Get events for this league
    const { data: leagueEvents } = await supabaseClient
      .from("league_events")
      .select("event_id")
      .eq("league_id", league_id);

    if (!leagueEvents || leagueEvents.length === 0) {
      // Return teams with zero scores
      const emptyLeaderboard = teams.map((team, index) => ({
        rank: index + 1,
        team_id: team.id,
        team_name: team.name,
        user_id: team.user_id,
        username: (team.profiles as { username?: string })?.username ?? null,
        total_score: 0,
        event_scores: {},
      }));

      return new Response(JSON.stringify(emptyLeaderboard), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventIds = leagueEvents.map((le) => le.event_id);

    // Get completed events only
    const { data: completedEvents } = await supabaseClient
      .from("events")
      .select("id, date")
      .in("id", eventIds)
      .eq("status", "completed");

    const completedEventIds = (completedEvents || []).map((e) => e.id);
    const eventDates: Record<number, Date> = {};
    (completedEvents || []).forEach((e) => {
      eventDates[e.id] = new Date(e.date);
    });

    // Calculate scores for each team
    const leaderboard = await Promise.all(
      teams.map(async (team) => {
        let totalScore = 0;
        const eventScores: Record<number, number> = {};

        for (const eventId of completedEventIds) {
          const eventDate = eventDates[eventId];

          // Get roster entries active at event time
          const { data: rosterEntries } = await supabaseClient
            .from("team_roster")
            .select("climber_id, is_captain, added_at, removed_at")
            .eq("team_id", team.id);

          const activeClimberIds: number[] = [];
          let currentCaptainId: number | null = null;

          for (const entry of rosterEntries || []) {
            const addedAt = new Date(entry.added_at);
            const removedAt = entry.removed_at
              ? new Date(entry.removed_at)
              : null;

            if (addedAt <= eventDate && (!removedAt || removedAt > eventDate)) {
              activeClimberIds.push(entry.climber_id);
              if (entry.is_captain) {
                currentCaptainId = entry.climber_id;
              }
            }
          }

          if (activeClimberIds.length === 0) {
            eventScores[eventId] = 0;
            continue;
          }

          // Check captain history for who was captain at event time
          const { data: captainHistory } = await supabaseClient
            .from("captain_history")
            .select("climber_id, set_at, replaced_at")
            .eq("team_id", team.id);

          let captainAtEvent = currentCaptainId;
          for (const ch of captainHistory || []) {
            const setAt = new Date(ch.set_at);
            const replacedAt = ch.replaced_at ? new Date(ch.replaced_at) : null;

            if (setAt <= eventDate && (!replacedAt || replacedAt > eventDate)) {
              captainAtEvent = ch.climber_id;
              break;
            }
          }

          // Get results for active climbers
          const { data: results } = await supabaseClient
            .from("event_results")
            .select("climber_id, rank")
            .eq("event_id", eventId)
            .in("climber_id", activeClimberIds);

          let eventScore = 0;
          for (const result of results || []) {
            const basePoints = getPointsForRank(result.rank);
            const isCaptain = result.climber_id === captainAtEvent;
            const multiplier = isCaptain ? captainMultiplier : 1.0;
            eventScore += Math.floor(basePoints * multiplier);
          }

          eventScores[eventId] = eventScore;
          totalScore += eventScore;
        }

        return {
          rank: 0, // Will be set after sorting
          team_id: team.id,
          team_name: team.name,
          user_id: team.user_id,
          username: (team.profiles as { username?: string })?.username ?? null,
          total_score: totalScore,
          event_scores: eventScores,
        };
      })
    );

    // Sort by total score descending and assign ranks
    leaderboard.sort((a, b) => b.total_score - a.total_score);
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return new Response(JSON.stringify(leaderboard), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error calculating leaderboard:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
