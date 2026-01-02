import { useState, useEffect, useMemo } from "react";
import {
  ArrowRightLeft,
  Crown,
  Calendar,
  Search,
  Filter,
  AlertTriangle,
} from "lucide-react";
import { teamsAPI, leaguesAPI, climbersAPI } from "../services/api";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [registrationStatus, setRegistrationStatus] = useState<
    Record<number, boolean>
  >({});
  const [nextEventName, setNextEventName] = useState<string>("");
  const [hideUnregistered, setHideUnregistered] = useState(true);

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

  // Fetch registration status for next event
  useEffect(() => {
    const fetchRegistrationStatus = async () => {
      if (events.length === 0 || availableClimbers.length === 0) return;

      // Find next upcoming event
      const upcomingEvents = events
        .filter((e) => e.status === "upcoming" && new Date(e.date) > new Date())
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

      if (upcomingEvents.length === 0) return;

      const nextEvent = upcomingEvents[0];
      setNextEventName(nextEvent.name);

      try {
        const climberIds = availableClimbers.map((c) => c.id);
        const statusResponse = await climbersAPI.getRegistrationStatus(
          nextEvent.id,
          climberIds
        );
        setRegistrationStatus(statusResponse.registrations);
      } catch (err) {
        console.warn("Could not load registration status:", err);
      }
    };

    fetchRegistrationStatus();
  }, [events, availableClimbers]);

  const getAvailableTransferEvents = () => {
    // 1. Find the LATEST completed event
    const completedEvents = events.filter((e) => e.status === "completed");
    if (completedEvents.length === 0) return [];

    const latestCompletedEvent = completedEvents[completedEvents.length - 1];

    // We still return the event even if transfersUsed >= allowed, because
    // the user might want to make a FREE transfer (unregistered athlete).
    // The "Make Transfer" button or modal logic should handle the specific case
    // where a PAID transfer is attempted but no paid slots are left.

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
    // A transfer is "pending" if the window is still open.
    // That means the next event after the one the transfer followed hasn't started yet.
    return transfers.filter((t) => {
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
    setSearchQuery("");
    setSelectedCountry("");
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

  // Transfer revert functionality removed - transfers are now permanent

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
      .filter((c) => {
        if (searchQuery) {
          if (!c.name.toLowerCase().includes(searchQuery.toLowerCase()))
            return false;
        }
        if (selectedCountry) {
          if (c.country !== selectedCountry) return false;
        }
        // Filter out unregistered athletes if checkbox is checked
        if (hideUnregistered && Object.keys(registrationStatus).length > 0) {
          if (registrationStatus[c.id] === false) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const rankA = rankings.get(a.id);
        const rankB = rankings.get(b.id);
        if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
        if (rankA !== undefined) return -1;
        if (rankB !== undefined) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [
    availableClimbers,
    rosterClimberIds,
    rankings,
    searchQuery,
    selectedCountry,
    hideUnregistered,
    registrationStatus,
  ]);

  const uniqueCountries = useMemo(() => {
    const countries = new Set(
      availableClimbers
        .map((c) => c.country)
        .filter((c): c is string => c !== null)
    );
    return Array.from(countries).sort();
  }, [availableClimbers]);

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
              (t) => t.after_event_id === event.id && !t.is_free
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
                  const isUnregistered =
                    Object.keys(registrationStatus).length > 0 &&
                    registrationStatus[climber.id] === false;
                  return (
                    <button
                      key={r.climber_id}
                      className={`player-btn ${
                        climberOutId === r.climber_id ? "selected" : ""
                      } ${isUnregistered ? "unregistered" : ""}`}
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
                      title={
                        isUnregistered
                          ? `Not registered for: ${nextEventName}`
                          : undefined
                      }
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
                      {isUnregistered && (
                        <AlertTriangle
                          size={12}
                          className="unregistered-icon"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {climberOutId && (
              <div className="transfer-step">
                <label>Select replacement player:</label>
                <div className="filters-row">
                  <div className="search-box">
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="filter-box">
                    <Filter size={16} className="filter-icon" />
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
                {Object.keys(registrationStatus).length > 0 && (
                  <label className="checkbox-filter-row">
                    <input
                      type="checkbox"
                      checked={hideUnregistered}
                      onChange={(e) => setHideUnregistered(e.target.checked)}
                    />
                    Hide unregistered athletes
                  </label>
                )}
                <div className="player-grid scrollable">
                  {sortedNotInRoster.map((climber) => {
                    const isUnregistered =
                      Object.keys(registrationStatus).length > 0 &&
                      registrationStatus[climber.id] === false;

                    // Check if we can select this climber
                    const transfersAllowed = league?.transfers_per_event ?? 1;

                    // Filter transfers for THIS event
                    // Note: This filter needs to be robust.
                    const paidTransfersUsed = transfers.filter(
                      (t) =>
                        selectedEvent &&
                        t.after_event_id === selectedEvent.id &&
                        !t.is_free
                    ).length;

                    // Determine if the CURRENT proposed transfer would be free
                    // It is free if the CLIMBER OUT is unregistered
                    const climberOut = roster.find(
                      (r) => r.climber_id === climberOutId
                    );
                    const isClimberOutUnregistered =
                      climberOut &&
                      registrationStatus[climberOut.climber_id] === false;
                    const isProposedTransferFree = isClimberOutUnregistered;

                    // Disable if:
                    // 1. It's a PAID transfer (climber out is registered)
                    // 2. AND we have reached the limit
                    // 3. AND we are not just re-selecting the same climber (though loop is over available)
                    const limitReached = paidTransfersUsed >= transfersAllowed;
                    const isDisabled =
                      !isProposedTransferFree &&
                      limitReached &&
                      climberInId !== climber.id;

                    return (
                      <button
                        key={climber.id}
                        disabled={isDisabled}
                        className={`player-btn ${
                          climberInId === climber.id ? "selected" : ""
                        } ${isUnregistered ? "unregistered" : ""} ${
                          isDisabled ? "disabled" : ""
                        }`}
                        onClick={() => setClimberInId(climber.id)}
                        title={
                          isUnregistered
                            ? `Not registered for: ${nextEventName}`
                            : undefined
                        }
                      >
                        <span
                          className={`tier-badge-sm tier-${getAthleTier(
                            climber.id
                          ).toLowerCase()}`}
                        >
                          {getAthleTier(climber.id)}
                        </span>
                        {climber.name}
                        {isUnregistered && (
                          <AlertTriangle
                            size={12}
                            className="unregistered-icon"
                          />
                        )}
                      </button>
                    );
                  })}
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
