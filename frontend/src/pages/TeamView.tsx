import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Crown, Users } from "lucide-react";
import {
  teamsAPI,
  climbersAPI,
  leaguesAPI,
  rankingsAPI,
} from "../services/api";
import type { RankingEntry } from "../services/api";
import type { TeamWithRoster, Climber, RosterEntry, League } from "../types";
import { TransferSection } from "../components/TransferSection";
import { getFlagEmoji } from "../utils/countryFlags";
import "./TeamView.css";

export function TeamView() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<TeamWithRoster | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [availableClimbers, setAvailableClimbers] = useState<Climber[]>([]);
  const [rankings, setRankings] = useState<Map<number, number>>(new Map());
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
      const leagueData = await leaguesAPI.getById(teamData.league_id);
      setLeague(leagueData);

      // Load climbers filtered by league gender
      const climbers = await climbersAPI.getAll(leagueData.gender);
      setAvailableClimbers(climbers);

      // Load rankings for this season
      const currentSeason = new Date().getFullYear();
      try {
        const rankingsData = await rankingsAPI.get(
          leagueData.discipline,
          leagueData.gender,
          currentSeason,
          500
        );
        const rankingsMap = new Map<number, number>();
        rankingsData.forEach((r: RankingEntry) =>
          rankingsMap.set(r.climber_id, r.rank)
        );
        setRankings(rankingsMap);
      } catch {
        console.warn("Could not load rankings");
      }
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
          leagueId={team.league_id}
          league={league}
          roster={selectedRoster}
          availableClimbers={availableClimbers}
          rankings={rankings}
          tierConfig={league?.tier_config?.tiers ?? []}
          onTransferComplete={loadData}
        />
      </div>
    </div>
  );
}
