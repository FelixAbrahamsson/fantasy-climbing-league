import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mountain,
  Trophy,
  Calendar,
  Check,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { leaguesAPI, eventsAPI } from "../services/api";
import type { Event, TierConfig } from "../types";
import { DEFAULT_TIER_CONFIG } from "../types";
import "./CreateLeague.css";

export function CreateLeague() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"men" | "women">("men");
  const [discipline, setDiscipline] = useState<"boulder" | "lead" | "speed">(
    "boulder"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [transfersPerEvent, setTransfersPerEvent] = useState(1);
  const [teamSize, setTeamSize] = useState(6);
  const [tierConfig, setTierConfig] =
    useState<TierConfig[]>(DEFAULT_TIER_CONFIG);
  const [captainMultiplier, setCaptainMultiplier] = useState(1.2);
  const navigate = useNavigate();

  // Fetch events when gender or discipline changes
  useEffect(() => {
    const fetchEvents = async () => {
      setLoadingEvents(true);
      try {
        const allEvents = await eventsAPI.getAll({
          discipline,
          gender,
        });
        // Sort by date
        const sortedEvents = allEvents.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setEvents(sortedEvents);

        // Auto-select World Cup/Championship/Series events, exclude Youth
        const worldEvents = sortedEvents.filter((e) => {
          const nameLower = e.name.toLowerCase();
          const isWorldLevel =
            nameLower.includes("world") &&
            (nameLower.includes("cup") ||
              nameLower.includes("championship") ||
              nameLower.includes("climbing series")); // New series name
          const isYouth = nameLower.includes("youth");

          return isWorldLevel && !isYouth;
        });
        setSelectedEventIds(worldEvents.map((e) => e.id));
      } catch (err) {
        console.error("Failed to load events:", err);
      } finally {
        setLoadingEvents(false);
      }
    };
    fetchEvents();
  }, [gender, discipline]);

  const toggleEvent = (eventId: number) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    );
  };

  const selectAllEvents = () => {
    setSelectedEventIds(events.map((e) => e.id));
  };

  const deselectAllEvents = () => {
    setSelectedEventIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (selectedEventIds.length === 0) {
      setError("Please select at least one event");
      return;
    }

    setLoading(true);

    try {
      const league = await leaguesAPI.create({
        name,
        gender,
        discipline,
        event_ids: selectedEventIds,
        transfers_per_event: transfersPerEvent,
        team_size: teamSize,
        tier_config: tierConfig,
        captain_multiplier: captainMultiplier,
      });
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="create-league-page">
      <div className="container">
        <div className="create-league-container">
          <div className="create-league-header">
            <Trophy className="create-icon" />
            <h1>Create New League</h1>
            <p className="text-muted">
              Set up your fantasy climbing competition
            </p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="create-league-form card">
            <div className="input-group">
              <label htmlFor="name">League Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Office Climbing Champions"
                minLength={3}
                maxLength={50}
                required
              />
            </div>

            <div className="form-row">
              <div className="input-group">
                <label>Category</label>
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${gender === "men" ? "active" : ""}`}
                    onClick={() => setGender("men")}
                  >
                    <span className="toggle-icon">👨</span>
                    Men
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${
                      gender === "women" ? "active" : ""
                    }`}
                    onClick={() => setGender("women")}
                  >
                    <span className="toggle-icon">👩</span>
                    Women
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label>Discipline</label>
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${
                      discipline === "boulder" ? "active" : ""
                    }`}
                    onClick={() => setDiscipline("boulder")}
                  >
                    <span className="toggle-icon">🪨</span>
                    Boulder
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${
                      discipline === "lead" ? "active" : ""
                    }`}
                    onClick={() => setDiscipline("lead")}
                  >
                    <span className="toggle-icon">🧗</span>
                    Lead
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${
                      discipline === "speed" ? "active" : ""
                    }`}
                    onClick={() => setDiscipline("speed")}
                  >
                    <span className="toggle-icon">⚡</span>
                    Speed
                  </button>
                </div>
              </div>

              {/* Transfers Per Event */}
              <div className="input-group">
                <label>
                  Transfers Per Event
                  <span className="input-hint">
                    (
                    {transfersPerEvent === 0
                      ? "No transfers"
                      : `${transfersPerEvent} swap${
                          transfersPerEvent > 1 ? "s" : ""
                        }`}
                    )
                  </span>
                </label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="6"
                    value={transfersPerEvent}
                    onChange={(e) =>
                      setTransfersPerEvent(Number(e.target.value))
                    }
                    className="slider"
                  />
                  <div className="slider-labels">
                    <span>0</span>
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                    <span>6</span>
                  </div>
                </div>
                <p className="input-description">
                  Allow players to swap team members after each completed event
                </p>
              </div>

              {/* Team Size */}
              <div className="input-group">
                <label>
                  <Users size={16} style={{ marginRight: "8px" }} />
                  Team Size
                  <span className="input-hint">({teamSize} athletes)</span>
                </label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={teamSize}
                    onChange={(e) => setTeamSize(Number(e.target.value))}
                    className="slider"
                  />
                  <div className="slider-labels">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <span key={n}>{n}</span>
                    ))}
                  </div>
                </div>
                <p className="input-description">
                  Number of athletes each player can select for their team
                </p>
              </div>

              {/* Captain Multiplier */}
              <div className="input-group">
                <label>
                  👑 Captain Bonus
                  <span className="input-hint">
                    (
                    {captainMultiplier === 1
                      ? "No bonus"
                      : captainMultiplier === 2
                      ? "2x points"
                      : `${Math.round((captainMultiplier - 1) * 100)}% bonus`}
                    )
                  </span>
                </label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={captainMultiplier}
                    onChange={(e) =>
                      setCaptainMultiplier(Number(e.target.value))
                    }
                    className="slider"
                  />
                  <div className="slider-labels">
                    <span>1x</span>
                    <span>1.5x</span>
                    <span>2x</span>
                    <span>2.5x</span>
                    <span>3x</span>
                  </div>
                </div>
                <p className="input-description">
                  Point multiplier for your team captain's scores
                </p>
              </div>
            </div>

            {/* Tier Configuration */}
            <div className="input-group tier-configuration">
              <label>
                <Trophy size={16} style={{ marginRight: "8px" }} />
                Athlete Tiers
                <span className="input-hint">
                  (Based on IFSC World Rankings)
                </span>
              </label>
              <p className="input-description" style={{ marginBottom: "12px" }}>
                Configure tiers based on athlete rankings. Higher-ranked
                athletes are more valuable but can be limited per team.
              </p>

              <div className="tier-list">
                {tierConfig.map((tier, index) => (
                  <div key={index} className="tier-item">
                    <div className="tier-inputs">
                      <div className="tier-field">
                        <label>Name</label>
                        <input
                          type="text"
                          value={tier.name}
                          onChange={(e) => {
                            const newConfig = [...tierConfig];
                            newConfig[index].name = e.target.value.slice(0, 3);
                            setTierConfig(newConfig);
                          }}
                          maxLength={3}
                          className="tier-name-input"
                        />
                      </div>
                      <div className="tier-field">
                        <label>Max Rank</label>
                        <input
                          type="number"
                          value={tier.max_rank ?? ""}
                          onChange={(e) => {
                            const newConfig = [...tierConfig];
                            const val = e.target.value;
                            newConfig[index].max_rank = val
                              ? Number(val)
                              : null;
                            setTierConfig(newConfig);
                          }}
                          placeholder="∞"
                          min={1}
                          className="tier-number-input"
                        />
                      </div>
                      <div className="tier-field">
                        <label>Max/Team</label>
                        <input
                          type="number"
                          value={tier.max_per_team ?? ""}
                          onChange={(e) => {
                            const newConfig = [...tierConfig];
                            const val = e.target.value;
                            newConfig[index].max_per_team = val
                              ? Number(val)
                              : null;
                            setTierConfig(newConfig);
                          }}
                          placeholder="∞"
                          min={0}
                          className="tier-number-input"
                        />
                      </div>
                      {tierConfig.length > 1 && (
                        <button
                          type="button"
                          className="tier-remove-btn"
                          onClick={() => {
                            setTierConfig(
                              tierConfig.filter((_, i) => i !== index)
                            );
                          }}
                          title="Remove tier"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="tier-preview">
                      Ranks{" "}
                      {index === 0
                        ? "1"
                        : String((tierConfig[index - 1].max_rank ?? 0) + 1)}
                      –{tier.max_rank ?? "∞"}
                      {tier.max_per_team !== null &&
                        " • Max " + tier.max_per_team + "/team"}
                    </div>
                  </div>
                ))}
              </div>

              {tierConfig.length < 6 && (
                <button
                  type="button"
                  className="btn btn-secondary tier-add-btn"
                  onClick={() => {
                    const lastTier = tierConfig[tierConfig.length - 1];
                    const newTierMaxRank = (lastTier.max_rank ?? 50) + 20;

                    // Find next available letter not already used
                    const usedNames = new Set(
                      tierConfig.map((t) => t.name.toUpperCase())
                    );
                    let nextLetter = "A";
                    for (let i = 0; i < 26; i++) {
                      const letter = String.fromCharCode(65 + i);
                      if (!usedNames.has(letter)) {
                        nextLetter = letter;
                        break;
                      }
                    }

                    setTierConfig([
                      ...tierConfig.slice(0, -1),
                      {
                        ...tierConfig[tierConfig.length - 1],
                        max_rank: newTierMaxRank,
                        max_per_team: 2,
                      },
                      {
                        name: nextLetter,
                        max_rank: null,
                        max_per_team: null,
                      },
                    ]);
                  }}
                >
                  <Plus size={16} />
                  Add Tier
                </button>
              )}
            </div>

            {/* Event Selection */}
            <div className="input-group event-selection">
              <div className="event-selection-header">
                <label>
                  <Calendar size={16} />
                  Select Events ({selectedEventIds.length} selected)
                </label>
                <div className="event-selection-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={selectAllEvents}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={deselectAllEvents}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {loadingEvents ? (
                <div className="events-loading">Loading events...</div>
              ) : events.length === 0 ? (
                <div className="events-empty">
                  No events found for {gender}'s {discipline}
                </div>
              ) : (
                <div className="events-list">
                  {events.map((event) => (
                    <label
                      key={event.id}
                      className={`event-checkbox ${
                        selectedEventIds.includes(event.id) ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEventIds.includes(event.id)}
                        onChange={() => toggleEvent(event.id)}
                      />
                      <div className="event-checkbox-content">
                        <div className="event-checkbox-check">
                          {selectedEventIds.includes(event.id) && (
                            <Check size={14} />
                          )}
                        </div>
                        <div className="event-info">
                          <span className="event-name">{event.name}</span>
                          <span className="event-date">
                            {formatDate(event.date)}
                          </span>
                        </div>
                        <span
                          className={`badge badge-${
                            event.status === "completed" ? "success" : "info"
                          }`}
                        >
                          {event.status}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="form-info">
              <Mountain size={16} />
              <span>
                Your league will track the selected {gender}'s {discipline}{" "}
                events
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading || selectedEventIds.length === 0}
            >
              {loading ? "Creating..." : "Create League"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
