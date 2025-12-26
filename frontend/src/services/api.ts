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
  getAll: () => fetchAPI<League[]>("/leagues"),

  getById: (id: string) => fetchAPI<League>(`/leagues/${id}`),

  create: (data: LeagueCreate) =>
    fetchAPI<League>("/leagues", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  join: (inviteCode: string) =>
    fetchAPI<League>("/leagues/join", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    }),
};

// Teams
export const teamsAPI = {
  getByLeague: (leagueId: string) =>
    fetchAPI<Team[]>(`/teams/league/${leagueId}`),

  getWithRoster: (teamId: string) =>
    fetchAPI<TeamWithRoster>(`/teams/${teamId}`),

  create: (data: { name: string; league_id: string }) =>
    fetchAPI<Team>("/teams", {
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
};

// Climbers
export const climbersAPI = {
  getAll: (gender?: string) => {
    const params = gender ? `?gender=${gender}` : "";
    return fetchAPI<Climber[]>(`/climbers${params}`);
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
    return fetchAPI<Event[]>(`/events${queryString ? `?${queryString}` : ""}`);
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
