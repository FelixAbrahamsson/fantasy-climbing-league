import { useState, useEffect, useMemo } from "react";
import { ArrowRightLeft, Undo2, Crown, Calendar } from "lucide-react";
import { teamsAPI, eventsAPI } from "../services/api";
import type { Transfer, Climber, Event, TierConfig } from "../types";
import "./TransferSection.css";

interface TransferSectionProps {
  teamId: string;
  roster: { climber_id: number; is_captain: boolean }[];
  availableClimbers: Climber[];
  rankings: Map<number, number>;
  tierConfig: TierConfig[];
  onTransferComplete: () => void;
}

export function TransferSection({
  teamId,
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
        eventsAPI.getAll({ status: "completed" }),
      ]);
      setTransfers(transfersData);
      setEvents(eventsData);
    } catch (err) {
      console.error("Failed to load transfer data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableTransferEvents = () => {
    // Get completed events that don't have an active (non-reverted) transfer
    const activeTransferEventIds = transfers
      .filter((t) => !t.reverted_at)
      .map((t) => t.after_event_id);

    return events.filter(
      (e) => e.status === "completed" && !activeTransferEventIds.includes(e.id)
    );
  };

  const getPendingTransfers = () => {
    return transfers.filter((t) => !t.reverted_at);
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

  if (loading) {
    return <div className="transfer-section-loading">Loading transfers...</div>;
  }

  return (
    <div className="transfer-section">
      <h3>
        <ArrowRightLeft size={18} />
        Transfers
      </h3>

      {/* Pending Transfers */}
      {pendingTransfers.length > 0 && (
        <div className="pending-transfers">
          <h4>Pending Transfers</h4>
          {pendingTransfers.map((transfer) => (
            <div key={transfer.id} className="pending-transfer">
              <div className="transfer-info">
                <span className="out">{transfer.climber_out_name}</span>
                <ArrowRightLeft size={14} />
                <span className="in">{transfer.climber_in_name}</span>
              </div>
              <button
                className="btn-undo"
                onClick={() => handleRevertTransfer(transfer.after_event_id)}
                title="Undo transfer"
              >
                <Undo2 size={14} />
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Available Transfer Windows */}
      {availableEvents.length > 0 ? (
        <div className="available-transfers">
          <h4>Make a Transfer</h4>
          <div className="transfer-events">
            {availableEvents.slice(0, 3).map((event) => (
              <button
                key={event.id}
                className="transfer-event-btn"
                onClick={() => handleOpenModal(event.id)}
              >
                <Calendar size={14} />
                <span>After {event.name.slice(0, 25)}...</span>
                <span className="event-date">{formatDate(event.date)}</span>
              </button>
            ))}
          </div>
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
            <h3>Make Transfer</h3>

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
