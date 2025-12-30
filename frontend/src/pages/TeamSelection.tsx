import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Crown, Plus, Minus, Check } from "lucide-react";
import {
  teamsAPI,
  climbersAPI,
  leaguesAPI,
  rankingsAPI,
} from "../services/api";
import type { RankingEntry } from "../services/api";
import type { TeamWithRoster, Climber, RosterEntry, League } from "../types";
import { getFlagEmoji } from "../utils/countryFlags";
import "./TeamSelection.css";

export function TeamSelection() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<TeamWithRoster | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [availableClimbers, setAvailableClimbers] = useState<Climber[]>([]);
  const [selectedRoster, setSelectedRoster] = useState<RosterEntry[]>([]);
  const [rankings, setRankings] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (teamId) {
      loadData();
    }
  }, [teamId]);

  const loadData = async () => {
    try {
      const teamData = await teamsAPI.getWithRoster(teamId!);
      setTeam(teamData);

      // Initialize selected roster from team data
      const roster: RosterEntry[] = teamData.roster.map((c) => ({
        climber_id: c.id,
        is_captain: c.id === teamData.captain_id,
      }));
      setSelectedRoster(roster);

      // Get league to determine gender for climber filtering and tier config
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
        // Rankings may not be synced yet - that's okay
        console.warn("Could not load rankings");
      }
    } catch (err) {
      setError("Failed to load team data");
    } finally {
      setLoading(false);
    }
  };

  // Tier configuration and helpers
  const tierConfig = useMemo(() => league?.tier_config?.tiers ?? [], [league]);
  const teamSize = league?.team_size ?? 6;

  const getAthleTier = (climberId: number): string => {
    const rank = rankings.get(climberId);
    if (rank === undefined || tierConfig.length === 0) {
      return tierConfig[tierConfig.length - 1]?.name ?? "?";
    }
    for (const tier of tierConfig) {
      if (tier.max_rank === null || rank <= tier.max_rank) {
        return tier.name;
      }
    }
    return tierConfig[tierConfig.length - 1]?.name ?? "?";
  };

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tierConfig.forEach((t) => (counts[t.name] = 0));
    selectedRoster.forEach((entry) => {
      const tier = getAthleTier(entry.climber_id);
      counts[tier] = (counts[tier] || 0) + 1;
    });
    return counts;
  }, [selectedRoster, tierConfig, rankings]);

  const isTierFull = (climberId: number): boolean => {
    const tier = getAthleTier(climberId);
    const tierCfg = tierConfig.find((t) => t.name === tier);
    if (!tierCfg || tierCfg.max_per_team === null) return false;
    return tierCounts[tier] >= tierCfg.max_per_team;
  };

  // Sort climbers by ranking (ranked athletes first, then unranked alphabetically)
  const sortedClimbers = useMemo(() => {
    return [...availableClimbers].sort((a, b) => {
      const rankA = rankings.get(a.id);
      const rankB = rankings.get(b.id);

      // Both have rankings - sort by rank
      if (rankA !== undefined && rankB !== undefined) {
        return rankA - rankB;
      }
      // Only A has ranking - A comes first
      if (rankA !== undefined) return -1;
      // Only B has ranking - B comes first
      if (rankB !== undefined) return 1;
      // Neither has ranking - sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [availableClimbers, rankings]);

  const isSelected = (climberId: number) =>
    selectedRoster.some((r) => r.climber_id === climberId);

  const toggleClimber = (climberId: number) => {
    if (isSelected(climberId)) {
      setSelectedRoster((prev) =>
        prev.filter((r) => r.climber_id !== climberId)
      );
    } else if (selectedRoster.length < teamSize) {
      // Check tier limit before adding
      if (isTierFull(climberId)) {
        const tier = getAthleTier(climberId);
        const tierCfg = tierConfig.find((t) => t.name === tier);
        setError(
          `Cannot add more ${tier}-tier athletes (max ${tierCfg?.max_per_team})`
        );
        setTimeout(() => setError(""), 3000);
        return;
      }
      setSelectedRoster((prev) => [
        ...prev,
        { climber_id: climberId, is_captain: false },
      ]);
    }
  };

  const setCaptain = (climberId: number) => {
    setSelectedRoster((prev) =>
      prev.map((r) => ({
        ...r,
        is_captain: r.climber_id === climberId,
      }))
    );
  };

  const handleSave = async () => {
    if (selectedRoster.length === 0) {
      setError("Please select at least one climber");
      return;
    }

    const hasCaptain = selectedRoster.some((r) => r.is_captain);
    if (!hasCaptain) {
      setError("Please select a captain");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await teamsAPI.updateRoster(teamId!, selectedRoster);
      setSuccess("Roster saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save roster");
    } finally {
      setSaving(false);
    }
  };

  const getClimberById = (id: number) =>
    availableClimbers.find((c) => c.id === id);

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
        <Link to="/leagues" className="btn btn-primary">
          Back to Leagues
        </Link>
      </div>
    );
  }

  return (
    <div className="team-selection">
      <div className="container">
        <div className="selection-header">
          <Link to={`/leagues/${team.league_id}`} className="back-link">
            <ArrowLeft size={18} />
            Back to League
          </Link>
          <h1>{team.name}</h1>
          <p className="text-muted">
            Select up to {teamSize} climbers for your team
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && (
          <div className="success-message">
            <Check size={18} />
            {success}
          </div>
        )}

        <div className="selection-grid">
          <section className="roster-section">
            <h2>
              Your Roster ({selectedRoster.length}/{teamSize})
            </h2>

            {selectedRoster.length === 0 ? (
              <div className="empty-roster">
                <p>No climbers selected yet. Pick from the list!</p>
              </div>
            ) : (
              <div className="roster-list">
                {selectedRoster.map((entry) => {
                  const climber = getClimberById(entry.climber_id);
                  if (!climber) return null;

                  return (
                    <div key={entry.climber_id} className="roster-item">
                      <div className="climber-info">
                        <span
                          className={`tier-badge tier-${getAthleTier(
                            climber.id
                          ).toLowerCase()}`}
                        >
                          {getAthleTier(climber.id)}
                        </span>
                        <span className="climber-flag">
                          {getFlagEmoji(climber.country)}
                        </span>
                        <div>
                          <span className="climber-name">{climber.name}</span>
                          <span className="climber-country">
                            {climber.country}
                          </span>
                        </div>
                      </div>
                      <div className="roster-actions">
                        <button
                          className={`captain-btn ${
                            entry.is_captain ? "active" : ""
                          }`}
                          onClick={() => setCaptain(entry.climber_id)}
                          title="Set as captain"
                        >
                          <Crown size={16} />
                        </button>
                        <button
                          className="remove-btn"
                          onClick={() => toggleClimber(entry.climber_id)}
                          title="Remove"
                        >
                          <Minus size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="btn btn-primary btn-full save-btn"
              onClick={handleSave}
              disabled={saving || selectedRoster.length === 0}
            >
              {saving ? "Saving..." : "Save Roster"}
            </button>
          </section>

          {/* Available Climbers */}
          <section className="climbers-section">
            <h2>Available Climbers</h2>

            <div className="climbers-list">
              {sortedClimbers.map((climber) => (
                <div
                  key={climber.id}
                  className={`climber-item ${
                    isSelected(climber.id) ? "selected" : ""
                  } ${
                    isTierFull(climber.id) && !isSelected(climber.id)
                      ? "tier-full"
                      : ""
                  }`}
                >
                  <div className="climber-info">
                    <span
                      className={`tier-badge tier-${getAthleTier(
                        climber.id
                      ).toLowerCase()}`}
                    >
                      {getAthleTier(climber.id)}
                    </span>
                    <span className="climber-flag">
                      {getFlagEmoji(climber.country)}
                    </span>
                    <div>
                      <span className="climber-name">{climber.name}</span>
                      <span className="climber-country">{climber.country}</span>
                    </div>
                  </div>

                  <button
                    className={`add-btn ${
                      isSelected(climber.id) ? "added" : ""
                    }`}
                    onClick={() => toggleClimber(climber.id)}
                    disabled={
                      !isSelected(climber.id) &&
                      (selectedRoster.length >= teamSize ||
                        isTierFull(climber.id))
                    }
                  >
                    {isSelected(climber.id) ? (
                      <>
                        <Check size={16} />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        Add
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
