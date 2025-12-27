import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Crown, Calendar, Trophy, ChevronRight } from "lucide-react";
import { teamsAPI } from "../services/api";
import type { TeamEventBreakdown } from "../types";
import "./TeamBreakdown.css";

export function TeamBreakdown() {
  const { teamId } = useParams<{ teamId: string }>();
  const [breakdown, setBreakdown] = useState<TeamEventBreakdown | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (teamId) {
      loadData();
    }
  }, [teamId]);

  const loadData = async () => {
    try {
      const data = await teamsAPI.getEventBreakdown(teamId!);
      setBreakdown(data);
      // Select first completed event by default, or first event
      const completedEvent = data.events.find(
        (e) => e.event_status === "completed"
      );
      if (completedEvent) {
        setSelectedEventId(completedEvent.event_id);
      } else if (data.events.length > 0) {
        setSelectedEventId(data.events[0].event_id);
      }
    } catch (err) {
      setError("Failed to load team breakdown");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const selectedEvent = breakdown?.events.find(
    (e) => e.event_id === selectedEventId
  );

  const totalPoints =
    breakdown?.events.reduce((sum, e) => sum + e.team_total, 0) || 0;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !breakdown) {
    return (
      <div className="error-container">
        <h2>{error || "Team not found"}</h2>
        <Link to="/leagues" className="btn btn-primary">
          Back to Leagues
        </Link>
      </div>
    );
  }

  return (
    <div className="team-breakdown">
      <div className="container">
        <div className="breakdown-header">
          <Link to={`/leagues/${breakdown.league_id}`} className="back-link">
            <ArrowLeft size={18} />
            Back to League
          </Link>
          <h1>{breakdown.team_name}</h1>
          <div className="total-points">
            <Trophy size={20} />
            <span>Total: {totalPoints} points</span>
          </div>
        </div>

        <div className="breakdown-content">
          {/* Event Tabs */}
          <div className="event-tabs">
            <h2>Events</h2>
            <div className="tabs-list">
              {breakdown.events.map((event) => (
                <button
                  key={event.event_id}
                  className={`event-tab ${
                    selectedEventId === event.event_id ? "active" : ""
                  } ${event.event_status === "upcoming" ? "upcoming" : ""}`}
                  onClick={() => setSelectedEventId(event.event_id)}
                >
                  <div className="event-tab-content">
                    <span className="event-tab-name">
                      {getShortEventName(event.event_name)}
                    </span>
                    <span className="event-tab-date">
                      <Calendar size={12} />
                      {formatDate(event.event_date)}
                    </span>
                  </div>
                  <div className="event-tab-points">
                    {event.team_total > 0 ? (
                      <span className="points-badge">{event.team_total}</span>
                    ) : (
                      <span className="no-points">
                        {event.event_status === "upcoming" ? "-" : "0"}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={16} className="tab-arrow" />
                </button>
              ))}
            </div>
          </div>

          {/* Selected Event Details */}
          <div className="event-details">
            {selectedEvent ? (
              <>
                <div className="event-details-header">
                  <h2>{selectedEvent.event_name}</h2>
                  <div className="event-meta">
                    <span
                      className={`badge badge-${
                        selectedEvent.event_status === "completed"
                          ? "success"
                          : "info"
                      }`}
                    >
                      {selectedEvent.event_status}
                    </span>
                    <span className="event-total">
                      Team Total: <strong>{selectedEvent.team_total}</strong>{" "}
                      pts
                    </span>
                  </div>
                </div>

                <table className="scores-table">
                  <thead>
                    <tr>
                      <th>Athlete</th>
                      <th>Rank</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEvent.athlete_scores.map((athlete) => (
                      <tr
                        key={athlete.climber_id}
                        className={athlete.total_points === 0 ? "no-score" : ""}
                      >
                        <td className="athlete-cell">
                          <span className="athlete-flag">
                            {getFlagEmoji(athlete.country)}
                          </span>
                          <span className="athlete-name">
                            {athlete.climber_name}
                          </span>
                          {athlete.is_captain && (
                            <Crown size={14} className="captain-icon" />
                          )}
                        </td>
                        <td className="rank-cell">
                          {athlete.rank !== null ? (
                            <span
                              className={`rank ${
                                athlete.rank <= 3 ? "top-rank" : ""
                              }`}
                            >
                              #{athlete.rank}
                            </span>
                          ) : (
                            <span className="no-result">DNP</span>
                          )}
                        </td>
                        <td className="points-cell">
                          <span className="points-value">
                            {athlete.total_points}
                          </span>
                          {athlete.is_captain && athlete.total_points > 0 && (
                            <span className="captain-bonus">2x</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="no-event-selected">
                <p>Select an event to view athlete scores</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getShortEventName(fullName: string): string {
  // Extract location from event name
  const match = fullName.match(
    /IFSC.*?(?:Cup|Championships?)\s+(.+?)\s+\d{4}/i
  );
  if (match) {
    return match[1];
  }
  return fullName.slice(0, 20) + (fullName.length > 20 ? "..." : "");
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
