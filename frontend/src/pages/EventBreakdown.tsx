import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Crown, Calendar, Trophy } from "lucide-react";
import { teamsAPI } from "../services/api";
import type { LeagueEventBreakdown } from "../types";
import "./EventBreakdown.css";

export function EventBreakdown() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [breakdown, setBreakdown] = useState<LeagueEventBreakdown | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (leagueId) {
      loadData();
    }
  }, [leagueId]);

  const loadData = async () => {
    try {
      const data = await teamsAPI.getLeagueEventBreakdown(leagueId!);
      setBreakdown(data);
      // Select first completed event by default
      const completedEvent = data.events.find(
        (e) => e.event_status === "completed"
      );
      if (completedEvent) {
        setSelectedEventId(completedEvent.event_id);
      } else if (data.events.length > 0) {
        setSelectedEventId(data.events[0].event_id);
      }
    } catch (err) {
      setError("Failed to load event breakdown");
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
        <h2>{error || "League not found"}</h2>
        <Link to="/leagues" className="btn btn-primary">
          Back to Leagues
        </Link>
      </div>
    );
  }

  return (
    <div className="event-breakdown-page">
      <div className="container">
        <div className="breakdown-header">
          <Link to={`/leagues/${leagueId}`} className="back-link">
            <ArrowLeft size={18} />
            Back to League
          </Link>
          <h1>Event Breakdown</h1>
        </div>

        {/* Event Tabs */}
        <div className="event-tabs-horizontal">
          {breakdown.events.map((event) => (
            <button
              key={event.event_id}
              className={`event-tab-h ${
                selectedEventId === event.event_id ? "active" : ""
              } ${event.event_status === "upcoming" ? "upcoming" : ""}`}
              onClick={() => setSelectedEventId(event.event_id)}
            >
              <span className="event-tab-name">
                {getShortEventName(event.event_name)}
              </span>
              <span className="event-tab-date">
                <Calendar size={12} />
                {formatDate(event.event_date)}
              </span>
            </button>
          ))}
        </div>

        {/* Event Details */}
        {selectedEvent && (
          <div className="event-details-panel">
            <div className="event-title">
              <h2>{selectedEvent.event_name}</h2>
              <span
                className={`badge badge-${
                  selectedEvent.event_status === "completed"
                    ? "success"
                    : "info"
                }`}
              >
                {selectedEvent.event_status}
              </span>
            </div>

            <div className="teams-breakdown">
              {selectedEvent.teams.map((team, teamIndex) => (
                <div key={team.team_id} className="team-card">
                  <div className="team-header">
                    <div className="team-rank">
                      {teamIndex === 0
                        ? "🥇"
                        : teamIndex === 1
                        ? "🥈"
                        : teamIndex === 2
                        ? "🥉"
                        : `#${teamIndex + 1}`}
                    </div>
                    <div className="team-info">
                      <span className="team-name">{team.team_name}</span>
                      <span className="username">
                        @{team.username || "anonymous"}
                      </span>
                    </div>
                    <div className="team-total">
                      <Trophy size={16} />
                      <span>{team.team_total}</span>
                    </div>
                  </div>

                  <div className="athletes-grid">
                    {team.athletes.map((athlete) => (
                      <div
                        key={athlete.climber_id}
                        className={`athlete-chip ${
                          athlete.points === 0 ? "no-score" : ""
                        }`}
                      >
                        <span className="athlete-flag">
                          {getFlagEmoji(athlete.country)}
                        </span>
                        <span className="athlete-name">
                          {athlete.climber_name}
                        </span>
                        {athlete.is_captain && (
                          <Crown size={12} className="captain-icon" />
                        )}
                        <span className="athlete-points">
                          {athlete.rank !== null ? (
                            <>
                              <span className="rank">#{athlete.rank}</span>
                              <span className="points">{athlete.points}</span>
                            </>
                          ) : (
                            <span className="dnp">DNP</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getShortEventName(fullName: string): string {
  const match = fullName.match(
    /IFSC.*?(?:Cup|Championships?)\s+(.+?)\s+\d{4}/i
  );
  if (match) {
    return match[1];
  }
  return fullName.slice(0, 15) + (fullName.length > 15 ? "..." : "");
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
