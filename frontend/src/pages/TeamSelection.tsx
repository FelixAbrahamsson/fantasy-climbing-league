import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Crown, Plus, Minus, Check } from "lucide-react";
import { teamsAPI, climbersAPI } from "../services/api";
import type { TeamWithRoster, Climber, RosterEntry } from "../types";
import { TransferSection } from "../components/TransferSection";
import "./TeamSelection.css";

export function TeamSelection() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<TeamWithRoster | null>(null);
  const [availableClimbers, setAvailableClimbers] = useState<Climber[]>([]);
  const [selectedRoster, setSelectedRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const MAX_ROSTER_SIZE = 6;

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

      // Load available climbers (we need to determine gender from league)
      // For now, load all climbers
      const climbers = await climbersAPI.getAll();
      setAvailableClimbers(climbers);
    } catch (err) {
      setError("Failed to load team data");
    } finally {
      setLoading(false);
    }
  };

  const isSelected = (climberId: number) =>
    selectedRoster.some((r) => r.climber_id === climberId);

  const toggleClimber = (climberId: number) => {
    if (isSelected(climberId)) {
      setSelectedRoster((prev) =>
        prev.filter((r) => r.climber_id !== climberId)
      );
    } else if (selectedRoster.length < MAX_ROSTER_SIZE) {
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
            Select up to {MAX_ROSTER_SIZE} climbers for your team
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
          {/* Current Roster */}
          <section className="roster-section">
            <h2>
              Your Roster ({selectedRoster.length}/{MAX_ROSTER_SIZE})
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
              {availableClimbers.map((climber) => (
                <div
                  key={climber.id}
                  className={`climber-item ${
                    isSelected(climber.id) ? "selected" : ""
                  }`}
                >
                  <div className="climber-info">
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
                      selectedRoster.length >= MAX_ROSTER_SIZE
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

// Helper function to get flag emoji from country code
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
