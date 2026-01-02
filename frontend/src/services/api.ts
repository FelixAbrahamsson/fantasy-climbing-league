/**
 * API layer using Supabase directly.
 *
 * This replaces the previous FastAPI backend calls with direct Supabase client operations.
 * Complex operations that require business logic use Supabase Edge Functions.
 */

import { supabase } from "./supabase";
import type {
  League,
  LeagueCreate,
  Climber,
  Team,
  TeamWithRoster,
  RosterEntry,
  Event,
  LeaderboardEntry,
  TeamEventBreakdown,
  LeagueEventBreakdown,
  Transfer,
  TransferCreate,
} from "../types";

// Helper to get current user ID
async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// Helper to generate invite codes
function generateInviteCode(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================================
// Leagues
// ============================================================================

export const leaguesAPI = {
  getAll: async (): Promise<League[]> => {
    const userId = await getCurrentUserId();

    // Get leagues where user is a member
    const { data: memberships } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", userId);

    if (!memberships || memberships.length === 0) return [];

    const leagueIds = memberships.map((m) => m.league_id);

    const { data: leagues, error } = await supabase
      .from("leagues")
      .select("*")
      .in("id", leagueIds);

    if (error) throw new Error(error.message);

    // Get member counts (number of teams) for each league
    const { data: teamCounts } = await supabase
      .from("fantasy_teams")
      .select("league_id")
      .in("league_id", leagueIds);

    const counts: Record<string, number> = {};
    (teamCounts || []).forEach((t) => {
      counts[t.league_id] = (counts[t.league_id] || 0) + 1;
    });

    return (leagues || []).map((league) => ({
      ...league,
      member_count: counts[league.id] || 0,
    }));
  },

  getById: async (id: string): Promise<League> => {
    const { data, error } = await supabase
      .from("leagues")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("League not found");

    // Get member count
    const { count } = await supabase
      .from("fantasy_teams")
      .select("id", { count: "exact", head: true })
      .eq("league_id", id);

    return { ...data, member_count: count || 0 };
  },

  create: async (data: LeagueCreate): Promise<League> => {
    const userId = await getCurrentUserId();
    const inviteCode = generateInviteCode();

    const leagueData = {
      name: data.name,
      gender: data.gender,
      discipline: data.discipline,
      admin_id: userId,
      invite_code: inviteCode,
      transfers_per_event: data.transfers_per_event ?? 1,
      team_size: data.team_size ?? 6,
      tier_config: { tiers: data.tier_config ?? [] },
      captain_multiplier: data.captain_multiplier ?? 1.2,
    };

    const { data: league, error } = await supabase
      .from("leagues")
      .insert(leagueData)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Add creator as admin member
    await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: userId,
      role: "admin",
    });

    // Add selected events to the league
    if (data.event_ids && data.event_ids.length > 0) {
      const eventRecords = data.event_ids.map((eventId) => ({
        league_id: league.id,
        event_id: eventId,
      }));
      await supabase.from("league_events").insert(eventRecords);
    }

    return league;
  },

  join: async (inviteCode: string): Promise<League> => {
    const userId = await getCurrentUserId();

    // Find league by invite code
    const { data: league, error } = await supabase
      .from("leagues")
      .select("*")
      .eq("invite_code", inviteCode)
      .single();

    if (error || !league) throw new Error("Invalid invite code");

    // Check if already a member
    const { data: existing } = await supabase
      .from("league_members")
      .select("id")
      .eq("league_id", league.id)
      .eq("user_id", userId)
      .single();

    if (existing) throw new Error("Already a member of this league");

    // Add as member
    await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: userId,
      role: "member",
    });

    return league;
  },

  delete: async (leagueId: string): Promise<{ message: string }> => {
    const userId = await getCurrentUserId();

    // Verify ownership
    const { data: league } = await supabase
      .from("leagues")
      .select("id, name, admin_id")
      .eq("id", leagueId)
      .single();

    if (!league) throw new Error("League not found");
    if (league.admin_id !== userId) {
      throw new Error("Only the league creator can delete the league");
    }

    // Delete in order (respecting foreign key constraints)
    // The cascade deletes should handle most of this, but being explicit
    const { data: teams } = await supabase
      .from("fantasy_teams")
      .select("id")
      .eq("league_id", leagueId);

    const teamIds = (teams || []).map((t) => t.id);

    if (teamIds.length > 0) {
      for (const teamId of teamIds) {
        await supabase.from("team_transfers").delete().eq("team_id", teamId);
        await supabase.from("captain_history").delete().eq("team_id", teamId);
        await supabase.from("team_roster").delete().eq("team_id", teamId);
      }
    }

    await supabase.from("fantasy_teams").delete().eq("league_id", leagueId);
    await supabase.from("league_events").delete().eq("league_id", leagueId);
    await supabase.from("league_members").delete().eq("league_id", leagueId);
    await supabase.from("leagues").delete().eq("id", leagueId);

    return { message: `League '${league.name}' deleted successfully` };
  },

  getEvents: async (leagueId: string, status?: string): Promise<Event[]> => {
    // Get event IDs for this league
    const { data: leagueEvents } = await supabase
      .from("league_events")
      .select("event_id")
      .eq("league_id", leagueId);

    if (!leagueEvents || leagueEvents.length === 0) return [];

    const eventIds = leagueEvents.map((le) => le.event_id);

    let query = supabase.from("events").select("*").in("id", eventIds);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.order("date", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },
};

// ============================================================================
// Teams
// ============================================================================

export const teamsAPI = {
  getByLeague: async (leagueId: string): Promise<Team[]> => {
    const { data, error } = await supabase
      .from("fantasy_teams")
      .select("*")
      .eq("league_id", leagueId);

    if (error) throw new Error(error.message);
    return data || [];
  },

  getWithRoster: async (teamId: string): Promise<TeamWithRoster> => {
    const { data: team, error } = await supabase
      .from("fantasy_teams")
      .select("*")
      .eq("id", teamId)
      .single();

    if (error || !team) throw new Error("Team not found");

    // Get current roster (where removed_at is null)
    const { data: rosterEntries } = await supabase
      .from("team_roster")
      .select("climber_id, is_captain")
      .eq("team_id", teamId)
      .is("removed_at", null);

    if (!rosterEntries || rosterEntries.length === 0) {
      return { ...team, roster: [], captain_id: null };
    }

    const climberIds = rosterEntries.map((r) => r.climber_id);

    // Get climber details
    const { data: climbers } = await supabase
      .from("climbers")
      .select("*")
      .in("id", climberIds);

    const captainEntry = rosterEntries.find((r) => r.is_captain);

    return {
      ...team,
      roster: climbers || [],
      captain_id: captainEntry?.climber_id || null,
    };
  },

  create: async (data: { name: string; league_id: string }): Promise<Team> => {
    const userId = await getCurrentUserId();

    const { data: team, error } = await supabase
      .from("fantasy_teams")
      .insert({
        name: data.name,
        league_id: data.league_id,
        user_id: userId,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return team;
  },

  updateRoster: async (
    teamId: string,
    roster: RosterEntry[]
  ): Promise<TeamWithRoster> => {
    const userId = await getCurrentUserId();

    // Verify ownership
    const { data: team } = await supabase
      .from("fantasy_teams")
      .select("user_id, league_id")
      .eq("id", teamId)
      .single();

    if (!team || team.user_id !== userId) {
      throw new Error("Not authorized to update this team");
    }

    // Get current roster
    const { data: currentRoster } = await supabase
      .from("team_roster")
      .select("climber_id")
      .eq("team_id", teamId)
      .is("removed_at", null);

    const currentIds = new Set((currentRoster || []).map((r) => r.climber_id));
    const newIds = new Set(roster.map((r) => r.climber_id));
    const now = new Date().toISOString();

    // Remove climbers no longer in roster
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        await supabase
          .from("team_roster")
          .update({ removed_at: now })
          .eq("team_id", teamId)
          .eq("climber_id", id)
          .is("removed_at", null);
      }
    }

    // Add new climbers
    for (const entry of roster) {
      if (!currentIds.has(entry.climber_id)) {
        await supabase.from("team_roster").insert({
          team_id: teamId,
          climber_id: entry.climber_id,
          is_captain: entry.is_captain,
          added_at: now,
        });
      } else {
        // Update captain status if changed
        await supabase
          .from("team_roster")
          .update({ is_captain: entry.is_captain })
          .eq("team_id", teamId)
          .eq("climber_id", entry.climber_id)
          .is("removed_at", null);
      }
    }

    return teamsAPI.getWithRoster(teamId);
  },

  setCaptain: async (
    teamId: string,
    climberId: number
  ): Promise<{ message: string }> => {
    const userId = await getCurrentUserId();

    // Verify ownership
    const { data: team } = await supabase
      .from("fantasy_teams")
      .select("user_id")
      .eq("id", teamId)
      .single();

    if (!team || team.user_id !== userId) {
      throw new Error("Not authorized");
    }

    const now = new Date().toISOString();

    // Remove captain from all current roster entries
    await supabase
      .from("team_roster")
      .update({ is_captain: false })
      .eq("team_id", teamId)
      .is("removed_at", null);

    // Set new captain
    await supabase
      .from("team_roster")
      .update({ is_captain: true })
      .eq("team_id", teamId)
      .eq("climber_id", climberId)
      .is("removed_at", null);

    // Update captain history
    await supabase
      .from("captain_history")
      .update({ replaced_at: now })
      .eq("team_id", teamId)
      .is("replaced_at", null);

    await supabase.from("captain_history").insert({
      team_id: teamId,
      climber_id: climberId,
      set_at: now,
    });

    return { message: "Captain set successfully" };
  },

  getEventBreakdown: async (teamId: string): Promise<TeamEventBreakdown> => {
    // Get team info
    const { data: team } = await supabase
      .from("fantasy_teams")
      .select("id, name, league_id, leagues(captain_multiplier)")
      .eq("id", teamId)
      .single();

    if (!team) throw new Error("Team not found");

    const captainMultiplier =
      (team.leagues as { captain_multiplier?: number } | null)
        ?.captain_multiplier ?? 1.2;

    // Get league events
    const { data: leagueEvents } = await supabase
      .from("league_events")
      .select("event_id")
      .eq("league_id", team.league_id);

    const eventIds = (leagueEvents || []).map((le) => le.event_id);

    // Get events
    const { data: events } = await supabase
      .from("events")
      .select("id, name, date, status")
      .in("id", eventIds)
      .order("date", { ascending: true });

    // Get roster
    const { data: roster } = await supabase
      .from("team_roster")
      .select("climber_id, is_captain")
      .eq("team_id", teamId)
      .is("removed_at", null);

    const climberIds = (roster || []).map((r) => r.climber_id);
    const captainId = roster?.find((r) => r.is_captain)?.climber_id;

    // Get climber details
    const { data: climbers } = await supabase
      .from("climbers")
      .select("id, name, country")
      .in("id", climberIds);

    const climbersMap = new Map(
      (climbers || []).map((c) => [c.id, { name: c.name, country: c.country }])
    );

    const eventBreakdowns = [];

    for (const event of events || []) {
      // Get results for this event
      const { data: results } = await supabase
        .from("event_results")
        .select("climber_id, rank")
        .eq("event_id", event.id)
        .in("climber_id", climberIds);

      const resultsMap = new Map(
        (results || []).map((r) => [r.climber_id, r.rank])
      );

      const athleteScores = climberIds.map((climberId) => {
        const climber = climbersMap.get(climberId);
        const rank = resultsMap.get(climberId) ?? null;
        const basePoints = rank ? getPointsForRank(rank) : 0;
        const isCaptain = climberId === captainId;
        const multiplier = isCaptain ? captainMultiplier : 1.0;
        const totalPoints = Math.floor(basePoints * multiplier);

        return {
          climber_id: climberId,
          climber_name: climber?.name || "",
          country: climber?.country || null,
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

    return {
      team_id: team.id,
      team_name: team.name,
      league_id: team.league_id,
      events: eventBreakdowns,
    };
  },

  getLeagueEventBreakdown: async (
    leagueId: string
  ): Promise<LeagueEventBreakdown> => {
    // Get league info
    const { data: league } = await supabase
      .from("leagues")
      .select("captain_multiplier")
      .eq("id", leagueId)
      .single();

    const captainMultiplier = league?.captain_multiplier ?? 1.2;

    // Get all teams in league
    const { data: teams } = await supabase
      .from("fantasy_teams")
      .select("id, name, user_id, profiles(username)")
      .eq("league_id", leagueId);

    // Get league events
    const { data: leagueEvents } = await supabase
      .from("league_events")
      .select("event_id")
      .eq("league_id", leagueId);

    const eventIds = (leagueEvents || []).map((le) => le.event_id);

    // Get events
    const { data: events } = await supabase
      .from("events")
      .select("id, name, date, status")
      .in("id", eventIds)
      .order("date", { ascending: true });

    const eventBreakdowns = [];

    for (const event of events || []) {
      const teamsData = [];

      for (const team of teams || []) {
        // Get roster for this team
        const { data: roster } = await supabase
          .from("team_roster")
          .select("climber_id, is_captain")
          .eq("team_id", team.id)
          .is("removed_at", null);

        const climberIds = (roster || []).map((r) => r.climber_id);
        const captainId = roster?.find((r) => r.is_captain)?.climber_id;

        if (climberIds.length === 0) {
          teamsData.push({
            team_id: team.id,
            team_name: team.name,
            username:
              (team.profiles as { username?: string } | null)?.username ?? null,
            team_total: 0,
            athletes: [],
          });
          continue;
        }

        // Get climber details and results
        const { data: climbers } = await supabase
          .from("climbers")
          .select("id, name, country")
          .in("id", climberIds);

        const { data: results } = await supabase
          .from("event_results")
          .select("climber_id, rank")
          .eq("event_id", event.id)
          .in("climber_id", climberIds);

        const resultsMap = new Map(
          (results || []).map((r) => [r.climber_id, r.rank])
        );

        const athletes = (climbers || []).map((climber) => {
          const rank = resultsMap.get(climber.id) ?? null;
          const basePoints = rank ? getPointsForRank(rank) : 0;
          const isCaptain = climber.id === captainId;
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
          username:
            (team.profiles as { username?: string } | null)?.username ?? null,
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

    return {
      league_id: leagueId,
      events: eventBreakdowns,
    };
  },

  getTransfers: async (teamId: string): Promise<Transfer[]> => {
    const { data, error } = await supabase
      .from("team_transfers")
      .select(
        `
        *,
        climber_out:climbers!team_transfers_climber_out_id_fkey(name),
        climber_in:climbers!team_transfers_climber_in_id_fkey(name)
      `
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((t) => ({
      ...t,
      climber_out_name: t.climber_out?.name,
      climber_in_name: t.climber_in?.name,
    }));
  },

  createTransfer: async (
    teamId: string,
    transferData: TransferCreate
  ): Promise<Transfer> => {
    const userId = await getCurrentUserId();

    // Verify team ownership and get league info
    const { data: team } = await supabase
      .from("fantasy_teams")
      .select("user_id, league_id")
      .eq("id", teamId)
      .single();

    if (!team || team.user_id !== userId) {
      throw new Error("Not authorized");
    }

    // Get league tier config
    const { data: league } = await supabase
      .from("leagues")
      .select("tier_config, discipline, gender")
      .eq("id", team.league_id)
      .single();

    if (!league) {
      throw new Error("League not found");
    }

    const tierConfig =
      (
        league.tier_config as {
          tiers?: {
            name: string;
            max_rank: number | null;
            max_per_team: number | null;
          }[];
        }
      )?.tiers || [];

    // Get current roster (excluding the outgoing climber)
    const { data: currentRoster } = await supabase
      .from("team_roster")
      .select("climber_id")
      .eq("team_id", teamId)
      .is("removed_at", null);

    const rosterClimberIds = (currentRoster || [])
      .map((r) => r.climber_id)
      .filter((id) => id !== transferData.climber_out_id);

    // Add the incoming climber to check tier limits
    const newRosterIds = [...rosterClimberIds, transferData.climber_in_id];

    // Get rankings for all climbers in new roster
    const { data: rankings } = await supabase
      .from("athlete_rankings")
      .select("climber_id, rank")
      .eq("discipline", league.discipline)
      .eq("gender", league.gender)
      .in("climber_id", newRosterIds);

    const rankMap = new Map(
      (rankings || []).map((r) => [r.climber_id, r.rank])
    );

    // Helper to determine tier for a climber
    const getTier = (climberId: number): string => {
      const rank = rankMap.get(climberId);
      if (rank === undefined) {
        // No ranking = lowest tier
        return tierConfig[tierConfig.length - 1]?.name ?? "?";
      }
      for (const tier of tierConfig) {
        if (tier.max_rank === null || rank <= tier.max_rank) {
          return tier.name;
        }
      }
      return tierConfig[tierConfig.length - 1]?.name ?? "?";
    };

    // Count athletes per tier in new roster
    const tierCounts: Record<string, number> = {};
    for (const climberId of newRosterIds) {
      const tier = getTier(climberId);
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    }

    // Check tier limits
    for (const tier of tierConfig) {
      if (tier.max_per_team !== null) {
        const count = tierCounts[tier.name] || 0;
        if (count > tier.max_per_team) {
          throw new Error(
            `Transfer violates tier limit: maximum ${tier.max_per_team} Tier ${tier.name} athletes allowed`
          );
        }
      }
    }

    const now = new Date().toISOString();

    // Create the transfer record
    const { data: transfer, error: transferError } = await supabase
      .from("team_transfers")
      .insert({
        team_id: teamId,
        after_event_id: transferData.after_event_id,
        climber_out_id: transferData.climber_out_id,
        climber_in_id: transferData.climber_in_id,
        created_at: now,
      })
      .select()
      .single();

    if (transferError) throw new Error(transferError.message);

    // Update roster: mark old climber as removed
    await supabase
      .from("team_roster")
      .update({ removed_at: now })
      .eq("team_id", teamId)
      .eq("climber_id", transferData.climber_out_id)
      .is("removed_at", null);

    // Add new climber to roster
    await supabase.from("team_roster").insert({
      team_id: teamId,
      climber_id: transferData.climber_in_id,
      is_captain: false,
      added_at: now,
    });

    // Handle captain change if specified
    if (transferData.new_captain_id) {
      await supabase
        .from("team_roster")
        .update({ is_captain: false })
        .eq("team_id", teamId)
        .is("removed_at", null);

      await supabase
        .from("team_roster")
        .update({ is_captain: true })
        .eq("team_id", teamId)
        .eq("climber_id", transferData.new_captain_id)
        .is("removed_at", null);
    }

    return transfer;
  },

  // revertTransfer removed - transfers are now permanent

  getRosterStatus: async (
    teamId: string
  ): Promise<{ locked: boolean; reason: string | null }> => {
    // Check if first event has started
    const { data: team } = await supabase
      .from("fantasy_teams")
      .select("league_id")
      .eq("id", teamId)
      .single();

    if (!team) throw new Error("Team not found");

    const { data: leagueEvents } = await supabase
      .from("league_events")
      .select("event_id")
      .eq("league_id", team.league_id);

    if (!leagueEvents || leagueEvents.length === 0) {
      return { locked: false, reason: null };
    }

    const eventIds = leagueEvents.map((le) => le.event_id);

    const { data: events } = await supabase
      .from("events")
      .select("date, status")
      .in("id", eventIds)
      .order("date", { ascending: true })
      .limit(1);

    if (!events || events.length === 0) {
      return { locked: false, reason: null };
    }

    const firstEvent = events[0];
    const now = new Date();
    const eventDate = new Date(firstEvent.date);

    if (eventDate <= now || firstEvent.status === "completed") {
      return {
        locked: true,
        reason: "First event has started - use transfers to change roster",
      };
    }

    return { locked: false, reason: null };
  },
};

// ============================================================================
// Climbers
// ============================================================================

export const climbersAPI = {
  getAll: async (gender?: string): Promise<Climber[]> => {
    let query = supabase.from("climbers").select("*").eq("active", true);

    if (gender) {
      query = query.eq("gender", gender);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return data || [];
  },

  getById: async (id: number): Promise<Climber> => {
    const { data, error } = await supabase
      .from("climbers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Climber not found");
    return data;
  },

  getRegistrationStatus: async (
    eventId: number,
    climberIds: number[]
  ): Promise<{ event_id: number; registrations: Record<number, boolean> }> => {
    // Query the event_registrations table (synced via python-sdk)
    const { data, error } = await supabase
      .from("event_registrations")
      .select("climber_id")
      .eq("event_id", eventId)
      .in("climber_id", climberIds);

    if (error) {
      console.warn("Could not check registrations:", error.message);
      return { event_id: eventId, registrations: {} };
    }

    // Build registrations map
    const registeredIds = new Set((data || []).map((r) => r.climber_id));
    const registrations: Record<number, boolean> = {};
    climberIds.forEach((id) => {
      registrations[id] = registeredIds.has(id);
    });

    return { event_id: eventId, registrations };
  },
};

// ============================================================================
// Events
// ============================================================================

export const eventsAPI = {
  getAll: async (filters?: {
    discipline?: string;
    gender?: string;
    status?: string;
  }): Promise<Event[]> => {
    let query = supabase.from("events").select("*");

    if (filters?.discipline) query = query.eq("discipline", filters.discipline);
    if (filters?.gender) query = query.eq("gender", filters.gender);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query.order("date", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  // Note: seedMockData removed - use python-sdk for data sync
};

// ============================================================================
// Leaderboard
// ============================================================================

// Points lookup for leaderboard calculation
function getPointsForRank(rank: number): number {
  const points: Record<number, number> = {
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
  return points[rank] ?? 0;
}

export const leaderboardAPI = {
  getByLeague: async (leagueId: string): Promise<LeaderboardEntry[]> => {
    // Get league info
    const { data: league } = await supabase
      .from("leagues")
      .select("captain_multiplier")
      .eq("id", leagueId)
      .single();

    const captainMultiplier = league?.captain_multiplier ?? 1.2;

    // Get all teams in the league
    const { data: teams } = await supabase
      .from("fantasy_teams")
      .select("id, name, user_id, profiles(username)")
      .eq("league_id", leagueId);

    if (!teams || teams.length === 0) return [];

    // Get league events
    const { data: leagueEvents } = await supabase
      .from("league_events")
      .select("event_id")
      .eq("league_id", leagueId);

    if (!leagueEvents || leagueEvents.length === 0) {
      // Return teams with zero scores
      return teams.map((team, index) => ({
        rank: index + 1,
        team_id: team.id,
        team_name: team.name,
        user_id: team.user_id,
        username:
          (team.profiles as { username?: string } | null)?.username ?? null,
        total_score: 0,
        event_scores: {},
      }));
    }

    const eventIds = leagueEvents.map((le) => le.event_id);

    // Get completed events
    const { data: completedEvents } = await supabase
      .from("events")
      .select("id")
      .in("id", eventIds)
      .eq("status", "completed");

    const completedEventIds = (completedEvents || []).map((e) => e.id);

    // Calculate scores for each team
    const leaderboard: LeaderboardEntry[] = [];

    for (const team of teams) {
      let totalScore = 0;
      const eventScores: Record<number, number> = {};

      // Get roster for this team
      const { data: roster } = await supabase
        .from("team_roster")
        .select("climber_id, is_captain")
        .eq("team_id", team.id)
        .is("removed_at", null);

      if (!roster || roster.length === 0) {
        leaderboard.push({
          rank: 0,
          team_id: team.id,
          team_name: team.name,
          user_id: team.user_id,
          username:
            (team.profiles as { username?: string } | null)?.username ?? null,
          total_score: 0,
          event_scores: {},
        });
        continue;
      }

      const climberIds = roster.map((r) => r.climber_id);
      const captainId = roster.find((r) => r.is_captain)?.climber_id;

      // Get results for all completed events
      for (const eventId of completedEventIds) {
        const { data: results } = await supabase
          .from("event_results")
          .select("climber_id, rank")
          .eq("event_id", eventId)
          .in("climber_id", climberIds);

        let eventScore = 0;
        for (const result of results || []) {
          const basePoints = getPointsForRank(result.rank);
          const isCaptain = result.climber_id === captainId;
          const multiplier = isCaptain ? captainMultiplier : 1.0;
          eventScore += Math.floor(basePoints * multiplier);
        }

        eventScores[eventId] = eventScore;
        totalScore += eventScore;
      }

      leaderboard.push({
        rank: 0,
        team_id: team.id,
        team_name: team.name,
        user_id: team.user_id,
        username:
          (team.profiles as { username?: string } | null)?.username ?? null,
        total_score: totalScore,
        event_scores: eventScores,
      });
    }

    // Sort by total score descending and assign ranks
    leaderboard.sort((a, b) => b.total_score - a.total_score);
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return leaderboard;
  },
};

// ============================================================================
// Rankings
// ============================================================================

export interface RankingEntry {
  climber_id: number;
  name: string;
  country: string;
  rank: number;
  score: number | null;
}

export const rankingsAPI = {
  get: async (
    discipline: string,
    gender: string,
    season: number,
    limit = 100
  ): Promise<RankingEntry[]> => {
    const { data, error } = await supabase
      .from("athlete_rankings")
      .select(
        `
        climber_id,
        rank,
        score,
        climbers(name, country)
      `
      )
      .eq("discipline", discipline)
      .eq("gender", gender)
      .eq("season", season)
      .order("rank", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    return (data || []).map((r) => {
      // Supabase returns joined data, need to cast appropriately
      const climber = r.climbers as unknown as {
        name: string;
        country: string;
      } | null;
      return {
        climber_id: r.climber_id,
        rank: r.rank,
        score: r.score,
        name: climber?.name || "",
        country: climber?.country || "",
      };
    });
  },

  // Note: sync removed - use python-sdk for data sync
};

// ============================================================================
// Scoring (static config, no API needed)
// ============================================================================

export interface ScoringConfig {
  points_table: { rank: number; points: number }[];
  captain_multiplier: number;
  min_points: number;
  description: string;
}

// Static scoring configuration (no need for API call)
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

export const scoringAPI = {
  getConfig: async (): Promise<ScoringConfig> => {
    const pointsTable = Object.entries(IFSC_POINTS).map(([rank, points]) => ({
      rank: parseInt(rank),
      points,
    }));

    return {
      points_table: pointsTable,
      captain_multiplier: 1.2,
      min_points: 1,
      description: "IFSC Official World Cup Scoring System",
    };
  },
};
