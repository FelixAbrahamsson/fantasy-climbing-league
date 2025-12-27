import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mountain, Trophy, Calendar, Check } from "lucide-react";
import { leaguesAPI, eventsAPI } from "../services/api";
import type { Event } from "../types";
import "./CreateLeague.css";

export function CreateLeague() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"men" | "women">("men");
  const [discipline, setDiscipline] = useState<"boulder" | "lead">("boulder");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
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
        // Auto-select all events by default
        setSelectedEventIds(sortedEvents.map((e) => e.id));
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
                </div>
              </div>
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
