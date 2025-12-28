import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Crown, Users } from "lucide-react";
import { teamsAPI, climbersAPI, leaguesAPI } from "../services/api";
import type { TeamWithRoster, Climber, RosterEntry } from "../types";
import { TransferSection } from "../components/TransferSection";
import "./TeamView.css";

export function TeamView() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<TeamWithRoster | null>(null);
  const [availableClimbers, setAvailableClimbers] = useState<Climber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (teamId) {
      loadData();
    }
  }, [teamId]);

  const loadData = async () => {
    try {
      const teamData = await teamsAPI.getWithRoster(teamId!);
      setTeam(teamData);

      // Get league to determine gender for climber filtering
      const league = await leaguesAPI.getById(teamData.league_id);

      // Load climbers filtered by league gender
      const climbers = await climbersAPI.getAll(league.gender);
      setAvailableClimbers(climbers);
    } catch (err) {
      setError("Failed to load team data");
    } finally {
      setLoading(false);
    }
  };

  const selectedRoster: RosterEntry[] =
    team?.roster.map((c) => ({
      climber_id: c.id,
      is_captain: c.id === team.captain_id,
    })) || [];

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="error-container">
        <h2>Team not found</h2>
        <Link to="/" className="btn btn-primary">
          Go Home
        </Link>
      </div>
    );
  }

  return (
    <div className="team-view-page">
      <header className="team-view-header">
        <Link to={`/leagues/${team.league_id}`} className="back-link">
          <ArrowLeft size={20} />
          Back to League
        </Link>
        <h1>{team.name}</h1>
        <p className="team-subtitle">Team Management</p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="team-view-content">
        {/* Current Roster */}
        <section className="current-roster">
          <h2>
            <Users size={20} />
            Your Roster
          </h2>
          <div className="roster-grid">
            {team.roster.map((climber) => {
              const isCaptain = climber.id === team.captain_id;
              return (
                <div
                  key={climber.id}
                  className={`roster-card ${isCaptain ? "captain" : ""}`}
                >
                  <div className="roster-card-name">
                    {getFlagEmoji(climber.country)} {climber.name}
                  </div>
                  {isCaptain && (
                    <div className="captain-badge">
                      <Crown size={14} /> Captain
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {team.roster.length === 0 && (
            <p className="empty-roster">No climbers in roster yet.</p>
          )}
        </section>

        {/* Transfer Section */}
        <TransferSection
          teamId={teamId!}
          roster={selectedRoster}
          availableClimbers={availableClimbers}
          onTransferComplete={loadData}
        />
      </div>
    </div>
  );
}

function getFlagEmoji(countryCode: string | null): string {
  if (!countryCode) return "🏳️";

  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));

  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🏳️";
  }
}
