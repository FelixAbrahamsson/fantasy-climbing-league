import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Trophy,
  Users,
  Crown,
  ArrowLeft,
  Copy,
  Check,
  Calendar,
  TrendingUp,
} from "lucide-react";
import {
  leaguesAPI,
  teamsAPI,
  leaderboardAPI,
  eventsAPI,
} from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { League, Team, LeaderboardEntry, Event } from "../types";
import "./LeagueDashboard.css";

export function LeagueDashboard() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");

  // Check if current user already has a team in this league
  const userHasTeam = teams.some((t) => t.user_id === user?.id);

  useEffect(() => {
    if (leagueId) {
      loadData();
    }
  }, [leagueId]);

  const loadData = async () => {
    try {
      const [leagueData, teamsData, leaderboardData, eventsData] =
        await Promise.all([
          leaguesAPI.getById(leagueId!),
          teamsAPI.getByLeague(leagueId!),
          leaderboardAPI.getByLeague(leagueId!),
          eventsAPI.getAll({
            discipline: undefined, // Will be filtered after we get league
            status: "completed",
          }),
        ]);
      setLeague(leagueData);
      setTeams(teamsData);
      setLeaderboard(leaderboardData);
      // Filter events by league's discipline and gender
      setEvents(
        eventsData.filter(
          (e) =>
            e.discipline === leagueData.discipline &&
            e.gender === leagueData.gender
        )
      );
    } catch (err) {
      setError("Failed to load league data");
    } finally {
      setLoading(false);
    }
  };

  const copyInviteCode = () => {
    if (league?.invite_code) {
      navigator.clipboard.writeText(league.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim() || !leagueId) return;

    try {
      await teamsAPI.create({ name: teamName, league_id: leagueId });
      setTeamName("");
      setCreatingTeam(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="error-container">
        <h2>League not found</h2>
        <Link to="/leagues" className="btn btn-primary">
          Back to Leagues
        </Link>
      </div>
    );
  }

  return (
    <div className="league-dashboard">
      <div className="container">
        {/* Header */}
        <div className="dashboard-header">
          <Link to="/leagues" className="back-link">
            <ArrowLeft size={18} />
            Back to Leagues
          </Link>

          <div className="league-title-row">
            <div>
              <h1>{league.name}</h1>
              <div className="league-meta">
                <span className={`badge badge-${league.discipline}`}>
                  {league.discipline}
                </span>
                <span className={`badge badge-${league.gender}`}>
                  {league.gender}
                </span>
              </div>
            </div>

            {league.invite_code && (
              <button className="invite-btn" onClick={copyInviteCode}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? "Copied!" : league.invite_code}</span>
              </button>
            )}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="dashboard-grid">
          {/* Leaderboard */}
          <section className="dashboard-section leaderboard-section">
            <div className="section-header">
              <h2>
                <Trophy size={20} /> Leaderboard
              </h2>
              <Link
                to={`/leagues/${leagueId}/events`}
                className="btn btn-secondary btn-sm"
              >
                View Events
              </Link>
            </div>

            {leaderboard.length === 0 ? (
              <div className="empty-section">
                <TrendingUp size={32} />
                <p>No scores yet. Complete a competition to see rankings!</p>
              </div>
            ) : (
              <div className="leaderboard-list">
                {leaderboard.map((entry, index) => (
                  <Link
                    to={`/teams/${entry.team_id}/breakdown`}
                    key={entry.team_id}
                    className={`leaderboard-entry ${
                      index < 3 ? `top-${index + 1}` : ""
                    }`}
                  >
                    <div className="rank">
                      {index === 0
                        ? "🥇"
                        : index === 1
                        ? "🥈"
                        : index === 2
                        ? "🥉"
                        : entry.rank}
                    </div>
                    <div className="team-info">
                      <span className="team-name">{entry.team_name}</span>
                      <span className="username">
                        @{entry.username || "anonymous"}
                      </span>
                    </div>
                    <div className="score">
                      {entry.total_score.toLocaleString()}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Teams */}
          <section className="dashboard-section teams-section">
            <div className="section-header">
              <h2>
                <Users size={20} /> Teams
              </h2>
              {!creatingTeam && !userHasTeam && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCreatingTeam(true)}
                >
                  Create Team
                </button>
              )}
            </div>

            {creatingTeam && (
              <form onSubmit={handleCreateTeam} className="create-team-form">
                <input
                  type="text"
                  placeholder="Team name..."
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary btn-sm">
                  Create
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCreatingTeam(false)}
                >
                  Cancel
                </button>
              </form>
            )}

            {teams.length === 0 ? (
              <div className="empty-section">
                <Users size={32} />
                <p>No teams yet. Create the first one!</p>
              </div>
            ) : (
              <div className="teams-list">
                {teams.map((team) => (
                  <Link
                    to={`/teams/${team.id}`}
                    key={team.id}
                    className="team-item"
                  >
                    <Crown size={18} className="team-icon" />
                    <span className="team-name">{team.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent Events */}
          <section className="dashboard-section events-section">
            <div className="section-header">
              <h2>
                <Calendar size={20} /> Completed Events
              </h2>
            </div>

            {events.length === 0 ? (
              <div className="empty-section">
                <Calendar size={32} />
                <p>No completed events yet.</p>
              </div>
            ) : (
              <div className="events-list">
                {events
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
                  .map((event) => (
                    <div key={event.id} className="event-item">
                      <div className="event-info">
                        <span className="event-name">{event.name}</span>
                        <span className="event-date">
                          {new Date(event.date).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="badge badge-success">Completed</span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
