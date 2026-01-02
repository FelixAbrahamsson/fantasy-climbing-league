import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Crown, Users, AlertTriangle } from "lucide-react";
import {
  teamsAPI,
  climbersAPI,
  leaguesAPI,
  rankingsAPI,
} from "../services/api";
import type { RankingEntry } from "../services/api";
import type { TeamWithRoster, Climber, League } from "../types";
import { TransferSection } from "../components/TransferSection";
import { getFlagEmoji } from "../utils/countryFlags";
import "./TeamView.css";

export function TeamView() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<TeamWithRoster | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [availableClimbers, setAvailableClimbers] = useState<Climber[]>([]);
  const [rankings, setRankings] = useState<Map<number, number>>(new Map());
  const [registrationStatus, setRegistrationStatus] = useState<
    Record<number, boolean>
  >({});
  const [nextEventName, setNextEventName] = useState<string | null>(null);
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

      // Load rankings for this season (try current year, fallback to previous)
      const currentYear = new Date().getFullYear();
      try {
        let rankingsData = await rankingsAPI.get(
          leagueData.discipline,
          leagueData.gender,
          currentYear,
          500
        );

        // If current year returns empty, try previous year
        if (rankingsData.length === 0) {
          rankingsData = await rankingsAPI.get(
            leagueData.discipline,
            leagueData.gender,
            currentYear - 1,
            500
          );
        }

        const rankingMap = new Map<number, number>();
        rankingsData.forEach((r: RankingEntry) => {
          rankingMap.set(r.climber_id, r.rank);
        });
        setRankings(rankingMap);
      } catch (err) {
        console.warn("Could not load rankings:", err);
      }

      // Fetch events to determine next event for registration check
      try {
        const events = await leaguesAPI.getEvents(teamData.league_id);
        const now = new Date();
        const futureEvents = events
          .filter((e) => new Date(e.date) > now && e.status !== "completed")
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
        const nextEvent = futureEvents[0];

        if (nextEvent) {
          setNextEventName(nextEvent.name);
          const rosterIds = teamData.roster.map((r) => r.id); // Changed from r.climber_id to r.id
          const statusResponse = await climbersAPI.getRegistrationStatus(
            nextEvent.id,
            rosterIds
          );
          setRegistrationStatus(statusResponse.registrations);
        }
      } catch (err) {
        console.warn("Could not load events/registration status:", err);
      }

      setLoading(false);
    } catch (err) {
      console.error("Error loading team data:", err);
      setError("Failed to load team data");
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading team...</div>;
  if (error || !team)
    return <div className="error">{error || "Team not found"}</div>;

  // Re-construct roster for TransferSection
  const selectedRoster = team.roster.map((c) => ({
    climber_id: c.id,
    is_captain: c.id === team.captain_id,
  }));

  return (
    <div className="team-view-page">
      <Link to={`/leagues/${team.league_id}`} className="back-link">
        <ArrowLeft size={20} /> Back to League
      </Link>

      <header className="team-view-header">
        <h1>{team.name}</h1>
        <p className="team-subtitle">Team Management</p>
      </header>

      <div className="team-view-content">
        <section className="current-roster">
          <h2>
            <Users size={20} />
            Your Roster
          </h2>
          <div className="roster-grid">
            {team.roster.map((climber) => {
              const isCaptain = climber.id === team.captain_id;
              const isUnregistered =
                Object.keys(registrationStatus).length > 0 &&
                registrationStatus[climber.id] === false;

              return (
                <div
                  key={climber.id}
                  className={`roster-card ${isCaptain ? "captain" : ""} ${
                    isUnregistered ? "unregistered" : ""
                  }`}
                  title={
                    isUnregistered
                      ? `Not registered for: ${nextEventName}`
                      : undefined
                  }
                >
                  <div className="roster-card-name">
                    {getFlagEmoji(climber.country)} {climber.name}
                  </div>
                  <div className="roster-card-badges">
                    {isCaptain && (
                      <div className="captain-badge">
                        <Crown size={14} /> Captain
                      </div>
                    )}
                    {isUnregistered && (
                      <div className="unregistered-badge">
                        <AlertTriangle size={12} /> Unregistered
                      </div>
                    )}
                  </div>
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
