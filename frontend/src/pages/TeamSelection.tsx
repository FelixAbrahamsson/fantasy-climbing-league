import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  Plus,
  Minus,
  Check,
  Search,
  Filter,
  AlertTriangle,
} from "lucide-react";
import {
  teamsAPI,
  climbersAPI,
  leaguesAPI,
  rankingsAPI,
  eventsAPI,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [registrationStatus, setRegistrationStatus] = useState<
    Record<number, boolean>
  >({});
  const [nextEventId, setNextEventId] = useState<number | null>(null);
  const [nextEventName, setNextEventName] = useState<string>("");
  const [hideUnregistered, setHideUnregistered] = useState(true);

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

        const rankingsMap = new Map<number, number>();
        rankingsData.forEach((r: RankingEntry) =>
          rankingsMap.set(r.climber_id, r.rank)
        );
        setRankings(rankingsMap);
      } catch {
        // Rankings may not be synced yet - that's okay
        console.warn("Could not load rankings");
      }

      // Load next event and registration status
      try {
        const allEvents = await eventsAPI.getAll({
          discipline: leagueData.discipline,
          gender: leagueData.gender,
        });

        // Find next upcoming event
        const upcomingEvents = allEvents
          .filter(
            (e) => e.status === "upcoming" && new Date(e.date) > new Date()
          )
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );

        if (upcomingEvents.length > 0) {
          const nextEvent = upcomingEvents[0];
          setNextEventId(nextEvent.id);
          setNextEventName(nextEvent.name);

          // Fetch registration status for all climbers
          const climberIds = climbers.map((c) => c.id);
          if (climberIds.length > 0) {
            const statusResponse = await climbersAPI.getRegistrationStatus(
              nextEvent.id,
              climberIds
            );
            setRegistrationStatus(statusResponse.registrations);
          }
        }
      } catch (err) {
        console.warn("Could not load registration status:", err);
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

  const uniqueCountries = useMemo(() => {
    const countries = new Set(
      availableClimbers
        .map((c) => c.country)
        .filter((c): c is string => c !== null)
    );
    return Array.from(countries).sort();
  }, [availableClimbers]);

  // Sort climbers by ranking (ranked athletes first, then unranked alphabetically)
  // And filter by search/country
  const sortedClimbers = useMemo(() => {
    let filtered = availableClimbers;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(query));
    }

    if (selectedCountry) {
      filtered = filtered.filter((c) => c.country === selectedCountry);
    }

    // Filter out unregistered athletes if checkbox is checked
    if (hideUnregistered && Object.keys(registrationStatus).length > 0) {
      filtered = filtered.filter((c) => registrationStatus[c.id] !== false);
    }

    return [...filtered].sort((a, b) => {
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
  }, [
    availableClimbers,
    rankings,
    searchQuery,
    selectedCountry,
    hideUnregistered,
    registrationStatus,
  ]);

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
                  const isUnregistered =
                    nextEventId !== null &&
                    registrationStatus[climber.id] === false;

                  return (
                    <div
                      key={entry.climber_id}
                      className={`roster-item ${
                        isUnregistered ? "unregistered" : ""
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
                          <span className="climber-country">
                            {climber.country}
                          </span>
                          {isUnregistered && (
                            <span
                              className="unregistered-badge"
                              title={`Not registered for: ${nextEventName}`}
                            >
                              <AlertTriangle size={12} />
                              Not Registered
                            </span>
                          )}
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

            <div className="filters-container">
              <div className="search-box">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search athletes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="filter-box">
                <Filter size={18} className="filter-icon" />
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                >
                  <option value="">All Countries</option>
                  {uniqueCountries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {nextEventId && (
              <label className="checkbox-filter-row">
                <input
                  type="checkbox"
                  checked={hideUnregistered}
                  onChange={(e) => setHideUnregistered(e.target.checked)}
                />
                Hide unregistered athletes
              </label>
            )}

            <div className="climbers-list">
              {sortedClimbers.map((climber) => {
                const isUnregistered =
                  nextEventId !== null &&
                  registrationStatus[climber.id] === false;

                return (
                  <div
                    key={climber.id}
                    className={`climber-item ${
                      isSelected(climber.id) ? "selected" : ""
                    } ${
                      isTierFull(climber.id) && !isSelected(climber.id)
                        ? "tier-full"
                        : ""
                    } ${isUnregistered ? "unregistered" : ""}`}
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
                        <span className="climber-country">
                          {climber.country}
                        </span>
                        {isUnregistered && (
                          <span
                            className="unregistered-badge"
                            title={`Not registered for: ${nextEventName}`}
                          >
                            <AlertTriangle size={12} />
                            Not Registered
                          </span>
                        )}
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
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
