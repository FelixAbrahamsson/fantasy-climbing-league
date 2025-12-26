import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Users, Trophy, Copy, Check } from "lucide-react";
import { leaguesAPI } from "../services/api";
import type { League } from "../types";
import "./Leagues.css";

export function Leagues() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    try {
      const data = await leaguesAPI.getAll();
      setLeagues(data);
    } catch (err) {
      setError("Failed to load leagues");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setJoining(true);
    try {
      await leaguesAPI.join(joinCode);
      setJoinCode("");
      loadLeagues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join league");
    } finally {
      setJoining(false);
    }
  };

  const copyInviteCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="leagues-page">
      <div className="container">
        <div className="leagues-header">
          <div>
            <h1>My Leagues</h1>
            <p className="text-muted">Manage your fantasy climbing leagues</p>
          </div>
          <Link to="/leagues/create" className="btn btn-primary">
            <Plus size={18} />
            Create League
          </Link>
        </div>

        {/* Join League Section */}
        <div className="join-section card">
          <h3>Join a League</h3>
          <form onSubmit={handleJoin} className="join-form">
            <input
              type="text"
              placeholder="Enter invite code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={joining}
            >
              {joining ? "Joining..." : "Join"}
            </button>
          </form>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* Leagues Grid */}
        {leagues.length === 0 ? (
          <div className="empty-state card">
            <Trophy size={48} className="empty-icon" />
            <h3>No Leagues Yet</h3>
            <p>Create your first league or join one with an invite code!</p>
            <Link to="/leagues/create" className="btn btn-primary">
              Create Your First League
            </Link>
          </div>
        ) : (
          <div className="leagues-grid">
            {leagues.map((league) => (
              <Link
                to={`/leagues/${league.id}`}
                key={league.id}
                className="league-card card"
              >
                <div className="league-card-header">
                  <h3>{league.name}</h3>
                  <div className="league-badges">
                    <span className={`badge badge-${league.discipline}`}>
                      {league.discipline}
                    </span>
                    <span className={`badge badge-${league.gender}`}>
                      {league.gender}
                    </span>
                  </div>
                </div>

                <div className="league-card-stats">
                  <div className="stat">
                    <Users size={16} />
                    <span>0 members</span>
                  </div>
                </div>

                {league.invite_code && (
                  <div className="league-invite">
                    <span className="invite-label">Invite Code:</span>
                    <code>{league.invite_code}</code>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        copyInviteCode(league.invite_code!, league.id);
                      }}
                    >
                      {copiedId === league.id ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
