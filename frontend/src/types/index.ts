// API Types

export interface League {
  id: string;
  name: string;
  gender: "men" | "women";
  discipline: "boulder" | "lead";
  admin_id: string;
  invite_code: string | null;
  created_at: string;
}

export interface LeagueCreate {
  name: string;
  gender: "men" | "women";
  discipline: "boulder" | "lead";
  event_ids?: number[];
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
  discipline: "boulder" | "lead";
  gender: "men" | "women";
  status: "upcoming" | "completed";
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
