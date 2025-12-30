import { useState, useEffect, useMemo } from "react";
import { ArrowRightLeft, Undo2, Crown, Calendar } from "lucide-react";
import { teamsAPI, leaguesAPI } from "../services/api";
import type { Transfer, Climber, Event, TierConfig, League } from "../types";
import "./TransferSection.css";

interface TransferSectionProps {
  teamId: string;
  leagueId: string;
  league: League | null;
  roster: { climber_id: number; is_captain: boolean }[];
  availableClimbers: Climber[];
  rankings: Map<number, number>;
  tierConfig: TierConfig[];
  onTransferComplete: () => void;
}

export function TransferSection({
  teamId,
  leagueId,
  league,
  roster,
  availableClimbers,
  rankings,
  tierConfig,
  onTransferComplete,
}: TransferSectionProps) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [climberOutId, setClimberOutId] = useState<number | null>(null);
  const [climberInId, setClimberInId] = useState<number | null>(null);
  const [newCaptainId, setNewCaptainId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [teamId]);

  const loadData = async () => {
    try {
      const [transfersData, eventsData] = await Promise.all([
        teamsAPI.getTransfers(teamId),
        leaguesAPI.getEvents(leagueId),
      ]);
      // Sort events by date ascending
      const sortedEvents = [...eventsData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setTransfers(transfersData);
      setEvents(sortedEvents);
    } catch (err) {
      console.error("Failed to load transfer data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableTransferEvents = () => {
    // 1. Find the LATEST completed event
    const completedEvents = events.filter((e) => e.status === "completed");
    if (completedEvents.length === 0) return [];

    const latestCompletedEvent = completedEvents[completedEvents.length - 1];

    // 2. Check how many transfers have been made for this event
    const transfersUsed = transfers.filter(
      (t) => t.after_event_id === latestCompletedEvent.id && !t.reverted_at
    ).length;

    const transfersAllowed = league?.transfers_per_event ?? 1;

    if (transfersUsed >= transfersAllowed) return [];

    // 3. Check if the NEXT event has already started
    const latestIndex = events.findIndex(
      (e) => e.id === latestCompletedEvent.id
    );
    const nextEvent = events[latestIndex + 1];

    if (
      nextEvent &&
      (nextEvent.status === "in_progress" || nextEvent.status === "completed")
    ) {
      return [];
    }

    return [latestCompletedEvent];
  };

  const getPendingTransfers = () => {
    // A transfer is "pending" (reversible) ONLY if the window is still open.
    // That means the next event after the one the transfer followed hasn't started yet.
    return transfers.filter((t) => {
      if (t.reverted_at) return false;

      const eventIndex = events.findIndex((e) => e.id === t.after_event_id);
      if (eventIndex === -1) return false;

      const nextEvent = events[eventIndex + 1];
      // If no next event, or next event is upcoming, it's still reversible
      return (
        !nextEvent ||
        (nextEvent.status !== "in_progress" && nextEvent.status !== "completed")
      );
    });
  };

  const getRosterClimber = (climberId: number) => {
    return availableClimbers.find((c) => c.id === climberId);
  };

  const isSwappingCaptain = () => {
    if (!climberOutId) return false;
    const rosterEntry = roster.find((r) => r.climber_id === climberOutId);
    return rosterEntry?.is_captain || false;
  };

  const handleOpenModal = (eventId: number) => {
    setSelectedEventId(eventId);
    setClimberOutId(null);
    setClimberInId(null);
    // Default to current captain
    const currentCaptain = roster.find((r) => r.is_captain);
    setNewCaptainId(currentCaptain?.climber_id || null);
    setError("");
    setShowModal(true);
  };

  const handleSubmitTransfer = async () => {
    if (!selectedEventId || !climberOutId || !climberInId) {
      setError("Please select both a player to remove and a replacement");
      return;
    }

    if (isSwappingCaptain() && !newCaptainId) {
      setError("Please select a new captain");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await teamsAPI.createTransfer(teamId, {
        after_event_id: selectedEventId,
        climber_out_id: climberOutId,
        climber_in_id: climberInId,
        new_captain_id: newCaptainId || undefined,
      });
      setShowModal(false);
      await loadData();
      onTransferComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevertTransfer = async (afterEventId: number) => {
    try {
      await teamsAPI.revertTransfer(teamId, afterEventId);
      await loadData();
      onTransferComplete();
    } catch (err) {
      console.error("Failed to revert transfer:", err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Tier helper
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

  const rosterClimberIds = roster.map((r) => r.climber_id);

  // Sort athletes not in roster by ranking
  const sortedNotInRoster = useMemo(() => {
    return availableClimbers
      .filter((c) => !rosterClimberIds.includes(c.id))
      .sort((a, b) => {
        const rankA = rankings.get(a.id);
        const rankB = rankings.get(b.id);
        if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
        if (rankA !== undefined) return -1;
        if (rankB !== undefined) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [availableClimbers, rosterClimberIds, rankings]);

  const availableEvents = getAvailableTransferEvents();
  const pendingTransfers = getPendingTransfers();
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const pendingByEvent = useMemo(() => {
    const groups = new Map<number, Transfer[]>();
    pendingTransfers.forEach((t) => {
      const group = groups.get(t.after_event_id) || [];
      group.push(t);
      groups.set(t.after_event_id, group);
    });
    return Array.from(groups.entries());
  }, [pendingTransfers]);

  if (loading) {
    return <div className="transfer-section-loading">Loading transfers...</div>;
  }

  return (
    <div className="transfer-section">
      <div className="transfer-header">
        <ArrowRightLeft size={18} />
        <span>Transfers</span>
        {league && (
          <span className="league-context-tag">
            {league.discipline} {league.gender}
          </span>
        )}
      </div>

      {/* Pending Transfers */}
      {pendingByEvent.length > 0 && (
        <div className="pending-transfers">
          <h4>Pending Transfers</h4>
          {pendingByEvent.map(([eventId, eventTransfers]) => {
            const event = events.find((e) => e.id === eventId);
            return (
              <div key={eventId} className="pending-group">
                <div className="pending-group-header">
                  <span>After {event?.name || "Event"}</span>
                  <button
                    className="btn-undo"
                    onClick={() => handleRevertTransfer(eventId)}
                    title="Undo all transfers for this event"
                  >
                    <Undo2 size={14} />
                    Undo All
                  </button>
                </div>
                {eventTransfers.map((transfer) => (
                  <div key={transfer.id} className="pending-transfer">
                    <div className="transfer-info">
                      <span className="out">{transfer.climber_out_name}</span>
                      <ArrowRightLeft size={14} />
                      <span className="in">{transfer.climber_in_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Available Transfer Windows */}
      {availableEvents.length > 0 ? (
        <div className="available-transfers">
          <h4>Make a Transfer</h4>
          {availableEvents.map((event) => {
            const transfersUsed = transfers.filter(
              (t) => t.after_event_id === event.id && !t.reverted_at
            ).length;
            const transfersAllowed = league?.transfers_per_event ?? 1;

            return (
              <div key={event.id} className="transfer-window">
                <button
                  className="transfer-event-btn"
                  onClick={() => handleOpenModal(event.id)}
                >
                  <Calendar size={14} />
                  <span className="event-name-text">After {event.name}</span>
                  <span className="event-date">{formatDate(event.date)}</span>
                </button>
                <div className="transfer-usage">
                  {transfersUsed} / {transfersAllowed} transfers used
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="no-transfers">No transfer windows available</p>
      )}

      {/* Transfer Modal */}
      {showModal && (
        <div
          className="transfer-modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>
            {selectedEvent && (
              <div className="modal-event-header">
                <Calendar size={16} />
                <span>After {selectedEvent.name}</span>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="transfer-step">
              <label>Select player to remove:</label>
              <div className="player-grid">
                {roster.map((r) => {
                  const climber = getRosterClimber(r.climber_id);
                  if (!climber) return null;
                  return (
                    <button
                      key={r.climber_id}
                      className={`player-btn ${
                        climberOutId === r.climber_id ? "selected" : ""
                      }`}
                      onClick={() => {
                        setClimberOutId(r.climber_id);
                        if (r.is_captain) {
                          setNewCaptainId(null);
                        } else {
                          const currentCaptain = roster.find(
                            (cr) => cr.is_captain
                          );
                          setNewCaptainId(currentCaptain?.climber_id || null);
                        }
                      }}
                    >
                      <span
                        className={`tier-badge-sm tier-${getAthleTier(
                          climber.id
                        ).toLowerCase()}`}
                      >
                        {getAthleTier(climber.id)}
                      </span>
                      {climber.name}
                      {r.is_captain && <Crown size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {climberOutId && (
              <div className="transfer-step">
                <label>Select replacement player:</label>
                <div className="player-grid scrollable">
                  {sortedNotInRoster.map((climber) => (
                    <button
                      key={climber.id}
                      className={`player-btn ${
                        climberInId === climber.id ? "selected" : ""
                      }`}
                      onClick={() => setClimberInId(climber.id)}
                    >
                      <span
                        className={`tier-badge-sm tier-${getAthleTier(
                          climber.id
                        ).toLowerCase()}`}
                      >
                        {getAthleTier(climber.id)}
                      </span>
                      {climber.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {climberInId && (
              <div className="transfer-step captain-step">
                <label>
                  <Crown size={14} /> Select new captain:
                </label>
                <div className="player-grid">
                  {/* New player option */}
                  <button
                    className={`player-btn ${
                      newCaptainId === climberInId ? "selected" : ""
                    }`}
                    onClick={() => setNewCaptainId(climberInId)}
                  >
                    {getRosterClimber(climberInId)?.name || "New Player"}
                  </button>
                  {/* Existing roster (excluding the one being removed) */}
                  {roster
                    .filter((r) => r.climber_id !== climberOutId)
                    .map((r) => {
                      const climber = getRosterClimber(r.climber_id);
                      if (!climber) return null;
                      return (
                        <button
                          key={r.climber_id}
                          className={`player-btn ${
                            newCaptainId === r.climber_id ? "selected" : ""
                          }`}
                          onClick={() => setNewCaptainId(r.climber_id)}
                        >
                          {climber.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmitTransfer}
                disabled={submitting || !climberOutId || !climberInId}
              >
                {submitting ? "Processing..." : "Confirm Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
