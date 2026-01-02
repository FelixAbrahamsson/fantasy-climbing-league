import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Trophy,
  User,
  Plus,
  Crown,
  ArrowLeft,
  Copy,
  Check,
  Calendar,
  TrendingUp,
  Trash2,
  ExternalLink,
  HelpCircle,
  Info,
  Shield,
  Zap,
  Users,
} from "lucide-react";
import {
  leaguesAPI,
  teamsAPI,
  leaderboardAPI,
  scoringAPI,
} from "../services/api";
import type { ScoringConfig } from "../services/api";
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [scoring, setScoring] = useState<ScoringConfig | null>(null);

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
          leaguesAPI.getEvents(leagueId!, "completed"),
        ]);
      setLeague(leagueData);
      setTeams(teamsData);
      setLeaderboard(leaderboardData);
      setEvents(eventsData);

      // Load scoring config for the info modal
      const scoringData = await scoringAPI.getConfig();
      setScoring(scoringData);
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

  const navigate = useNavigate();

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim() || !leagueId) return;

    try {
      const newTeam = await teamsAPI.create({
        name: teamName,
        league_id: leagueId,
      });
      setTeamName("");
      setCreatingTeam(false);
      // Navigate to the new team's page to set up the roster
      navigate(`/teams/${newTeam.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    }
  };

  const handleDeleteLeague = async () => {
    if (!league || deleteConfirmName !== league.name) return;

    setDeleting(true);
    try {
      await leaguesAPI.delete(leagueId!);
      window.location.href = "/leagues";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete league");
      setDeleting(false);
    }
  };

  const isLeagueOwner = league?.admin_id === user?.id;

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
                <button
                  className="how-it-works-link"
                  onClick={() => setShowInfo(true)}
                >
                  <Info size={14} />
                  <span>How to Play</span>
                </button>
              </div>
            </div>

            {league.invite_code && (
              <button className="invite-btn" onClick={copyInviteCode}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? "Copied!" : league.invite_code}</span>
              </button>
            )}

            {isLeagueOwner && (
              <button
                className="btn btn-danger"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 size={16} />
                Delete League
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
                <div className="leaderboard-header-row">
                  <span className="rank-head">Rank</span>
                  <span className="team-head">Team</span>
                  <span className="score-head">Score</span>
                </div>
                {leaderboard.map((entry, index) => (
                  <Link
                    to={`/teams/${entry.team_id}/breakdown`}
                    key={entry.team_id}
                    className={`leaderboard-item ${
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

          {/* My Team */}
          <section className="dashboard-section teams-section">
            <div className="section-header">
              <h2>
                <User size={20} /> My Team
              </h2>
            </div>

            {userHasTeam ? (
              // User has a team - show link to their team
              <div className="my-team-card">
                {teams
                  .filter((t) => t.user_id === user?.id)
                  .map((team) => (
                    <Link
                      to={`/teams/${team.id}`}
                      key={team.id}
                      className="team-item my-team-item"
                    >
                      <Crown size={24} className="team-icon" />
                      <div className="team-details">
                        <span className="team-name">{team.name}</span>
                        <span className="team-action">
                          View & manage roster →
                        </span>
                      </div>
                    </Link>
                  ))}
              </div>
            ) : creatingTeam ? (
              // Creating team form
              <form onSubmit={handleCreateTeam} className="create-team-form">
                <input
                  type="text"
                  placeholder="Enter your team name..."
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  autoFocus
                />
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    Create Team
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setCreatingTeam(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              // No team - show prominent create button
              <div className="no-team-cta">
                <p>You haven't created a team in this league yet.</p>
                <button
                  className="btn btn-primary btn-lg create-team-btn"
                  onClick={() => setCreatingTeam(true)}
                >
                  <Plus size={20} />
                  Create Your Team
                </button>
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
                      <div className="event-actions">
                        <a
                          href={`https://ifsc.results.info/event/${String(
                            event.id
                          ).slice(0, -1)}/general/${event.discipline}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ifsc-link"
                          title="View on IFSC"
                        >
                          <ExternalLink size={14} />
                          Results
                        </a>
                        <span className="badge badge-success">Completed</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="modal delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Delete League</h3>
            <p className="delete-warning">
              This action cannot be undone. This will permanently delete the
              league, all teams, and all associated data.
            </p>
            <p>
              Type <strong>{league.name}</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder="Enter league name"
              className="delete-confirm-input"
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmName("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteLeague}
                disabled={deleteConfirmName !== league.name || deleting}
              >
                {deleting ? "Deleting..." : "Delete League"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Info Modal */}
      {showInfo && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div
            className="modal info-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="info-modal-header">
              <HelpCircle size={24} className="info-icon" />
              <h2>How to Play: {league.name}</h2>
            </div>

            <div className="info-modal-content">
              <div className="info-section">
                <h3>
                  <Users size={18} /> Building Your Team
                </h3>
                <p>
                  Select <strong>{league.team_size}</strong> climbers to form
                  your roster. You must stay within the{" "}
                  <strong>tier limits</strong>:
                </p>
                <ul className="tier-list">
                  {league.tier_config.tiers.map((tier) => (
                    <li key={tier.name}>
                      <strong>Tier {tier.name}:</strong> Athletes ranked up to #
                      {tier.max_rank || "Any"}.
                      {tier.max_per_team
                        ? ` Max ${tier.max_per_team} per team.`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="info-section">
                <h3>
                  <Zap size={18} /> Scoring Points
                </h3>
                <p>
                  Teams gain points based on the real-world performance of their
                  climbers in IFSC events.
                </p>
                <ul>
                  <li>
                    <strong>Base Points:</strong> Earned based on final event
                    rank.
                  </li>
                  <li>
                    <strong>Captain Bonus:</strong> Your chosen captain earns{" "}
                    <strong>
                      {Math.round((league.captain_multiplier || 1.2) * 100) /
                        100}
                      x
                    </strong>{" "}
                    bonus points!
                  </li>
                  <li>
                    <strong>Multiple Disciplines:</strong> If an athlete
                    competes in multiple disciplines at one event, you get
                    points for all of them.
                  </li>
                </ul>

                {scoring && (
                  <div className="scoring-preview">
                    <h4>Example Points:</h4>
                    <div className="mini-scoring-table">
                      {scoring.points_table.slice(0, 5).map((p) => (
                        <div key={p.rank} className="mini-row">
                          <span>Rank #{p.rank}</span>
                          <strong>{p.points} pts</strong>
                        </div>
                      ))}
                      <div className="mini-row muted">
                        <span>Rank #30+</span>
                        <strong>{scoring.min_points} pts</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="info-section">
                <h3>
                  <Shield size={18} /> Transfers & Windows
                </h3>
                <ul>
                  <li>
                    <strong>Transfer Limit:</strong> You can make up to{" "}
                    <strong>{league.transfers_per_event}</strong> transfers
                    after each event. You can freely transfer any athlete not
                    signed up for the next event, if the event is 14 days away
                    or less.
                  </li>
                  <li>
                    <strong>Roster Locks:</strong> Roster is locked 30 minutes
                    before the start of each event.
                  </li>
                  <li>
                    <strong>Reverting:</strong> You can revert transfers as long
                    as the next event hasn't started.
                  </li>
                </ul>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => setShowInfo(false)}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
