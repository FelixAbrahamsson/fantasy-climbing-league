// API Types

export interface TierConfig {
  name: string;
  max_rank: number | null; // null = unlimited (lowest tier)
  max_per_team: number | null; // null = unlimited
}

export const DEFAULT_TIER_CONFIG: TierConfig[] = [
  { name: "S", max_rank: 10, max_per_team: 2 },
  { name: "A", max_rank: 30, max_per_team: 2 },
  { name: "B", max_rank: null, max_per_team: null },
];

export interface League {
  id: string;
  name: string;
  gender: "men" | "women";
  discipline: "boulder" | "lead" | "speed";
  admin_id: string;
  invite_code: string | null;
  created_at: string;
  transfers_per_event: number;
  team_size: number;
  tier_config: { tiers: TierConfig[] };
  captain_multiplier: number;
  member_count?: number;
}

export interface LeagueCreate {
  name: string;
  gender: "men" | "women";
  discipline: "boulder" | "lead" | "speed";
  event_ids?: number[];
  transfers_per_event?: number;
  team_size?: number;
  tier_config?: TierConfig[];
  captain_multiplier?: number;
}

export interface Climber {
  id: number;
  name: string;
  country: string | null;
  gender: "men" | "women";
}

export interface Team {
  id: string;
  league_id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface RosterEntry {
  climber_id: number;
  is_captain: boolean;
}

export interface TeamWithRoster extends Team {
  roster: Climber[];
  captain_id: number | null;
}

export interface Event {
  id: number;
  name: string;
  date: string;
  discipline: "boulder" | "lead" | "speed";
  gender: "men" | "women";
  status: "upcoming" | "in_progress" | "completed";
}

export interface LeaderboardEntry {
  rank: number;
  team_id: string;
  team_name: string;
  user_id: string;
  username: string | null;
  total_score: number;
  event_scores: Record<number, number>;
}

export interface User {
  id: string;
  email: string;
  username?: string;
}

export interface AthleteEventScore {
  climber_id: number;
  climber_name: string;
  country: string | null;
  is_captain: boolean;
  rank: number | null;
  base_points: number;
  total_points: number;
}

export interface EventBreakdown {
  event_id: number;
  event_name: string;
  event_date: string;
  event_status: "upcoming" | "in_progress" | "completed";
  team_total: number;
  athlete_scores: AthleteEventScore[];
}

export interface TeamEventBreakdown {
  team_id: string;
  team_name: string;
  league_id: string;
  events: EventBreakdown[];
}

// League-wide event breakdown types
export interface LeagueAthleteScore {
  climber_id: number;
  climber_name: string;
  country: string | null;
  is_captain: boolean;
  rank: number | null;
  points: number;
}

export interface LeagueTeamEventData {
  team_id: string;
  team_name: string;
  username: string | null;
  team_total: number;
  athletes: LeagueAthleteScore[];
}

export interface LeagueEventData {
  event_id: number;
  event_name: string;
  event_date: string;
  event_status: "upcoming" | "in_progress" | "completed";
  teams: LeagueTeamEventData[];
}

export interface LeagueEventBreakdown {
  league_id: string;
  events: LeagueEventData[];
}

// Transfer types
export interface Transfer {
  id: string;
  team_id: string;
  after_event_id: number;
  climber_out_id: number;
  climber_in_id: number;
  created_at: string;
  reverted_at: string | null;
  climber_out_name?: string;
  climber_in_name?: string;
}

export interface TransferCreate {
  after_event_id: number;
  climber_out_id: number;
  climber_in_id: number;
  new_captain_id?: number;
}
