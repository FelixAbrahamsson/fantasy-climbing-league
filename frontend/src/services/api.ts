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

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  return {};
}

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "API request failed");
  }

  return response.json();
}

// Leagues
export const leaguesAPI = {
  getAll: () => fetchAPI<League[]>("/leagues/"),

  getById: (id: string) => fetchAPI<League>(`/leagues/${id}`),

  create: (data: LeagueCreate) =>
    fetchAPI<League>("/leagues/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  join: (inviteCode: string) =>
    fetchAPI<League>("/leagues/join", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    }),

  delete: (leagueId: string) =>
    fetchAPI<{ message: string }>(`/leagues/${leagueId}`, {
      method: "DELETE",
    }),

  getEvents: (leagueId: string, status?: string) => {
    const params = status ? `?status=${status}` : "";
    return fetchAPI<Event[]>(`/leagues/${leagueId}/events${params}`);
  },
};

// Teams
export const teamsAPI = {
  getByLeague: (leagueId: string) =>
    fetchAPI<Team[]>(`/teams/league/${leagueId}`),

  getWithRoster: (teamId: string) =>
    fetchAPI<TeamWithRoster>(`/teams/${teamId}`),

  create: (data: { name: string; league_id: string }) =>
    fetchAPI<Team>("/teams/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateRoster: (teamId: string, roster: RosterEntry[]) =>
    fetchAPI<TeamWithRoster>(`/teams/${teamId}/roster`, {
      method: "PUT",
      body: JSON.stringify({ roster }),
    }),

  setCaptain: (teamId: string, climberId: number) =>
    fetchAPI<{ message: string }>(`/teams/${teamId}/captain/${climberId}`, {
      method: "PUT",
    }),

  getEventBreakdown: (teamId: string) =>
    fetchAPI<TeamEventBreakdown>(`/teams/${teamId}/event-breakdown`),

  getLeagueEventBreakdown: (leagueId: string) =>
    fetchAPI<LeagueEventBreakdown>(`/teams/league/${leagueId}/event-breakdown`),

  // Transfer actions
  getTransfers: (teamId: string) =>
    fetchAPI<Transfer[]>(`/teams/${teamId}/transfers`),

  createTransfer: (teamId: string, data: TransferCreate) =>
    fetchAPI<Transfer>(`/teams/${teamId}/transfer`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  revertTransfer: (teamId: string, afterEventId: number) =>
    fetchAPI<{ message: string }>(`/teams/${teamId}/transfer/${afterEventId}`, {
      method: "DELETE",
    }),

  getRosterStatus: (teamId: string) =>
    fetchAPI<{ locked: boolean; reason: string | null }>(
      `/teams/${teamId}/roster-status`
    ),
};

// Climbers
export const climbersAPI = {
  getAll: (gender?: string) => {
    const params = gender ? `?gender=${gender}` : "";
    return fetchAPI<Climber[]>(`/climbers/${params}`);
  },

  getById: (id: number) => fetchAPI<Climber>(`/climbers/${id}`),
};

// Events
export const eventsAPI = {
  getAll: (filters?: {
    discipline?: string;
    gender?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.discipline) params.append("discipline", filters.discipline);
    if (filters?.gender) params.append("gender", filters.gender);
    if (filters?.status) params.append("status", filters.status);
    const queryString = params.toString();
    return fetchAPI<Event[]>(`/events/${queryString ? `?${queryString}` : ""}`);
  },

  seedMockData: () =>
    fetchAPI<{ message: string; counts: Record<string, number> }>(
      "/events/seed-mock-data",
      { method: "POST" }
    ),
};

// Leaderboard
export const leaderboardAPI = {
  getByLeague: (leagueId: string) =>
    fetchAPI<LeaderboardEntry[]>(`/leaderboard/${leagueId}`),
};

// Rankings
export interface RankingEntry {
  climber_id: number;
  name: string;
  country: string;
  rank: number;
  score: number | null;
}

export const rankingsAPI = {
  get: (discipline: string, gender: string, season: number, limit = 100) =>
    fetchAPI<RankingEntry[]>(
      `/rankings/${discipline}/${gender}/${season}?limit=${limit}`
    ),

  sync: (season: number, discipline: string, gender: string) =>
    fetchAPI<{
      synced_count: number;
      discipline: string;
      gender: string;
      season: number;
    }>(
      `/rankings/sync?season=${season}&discipline=${discipline}&gender=${gender}`,
      { method: "POST" }
    ),
};
