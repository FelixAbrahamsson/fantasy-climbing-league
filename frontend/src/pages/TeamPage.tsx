import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { teamsAPI } from "../services/api";
import { TeamSelection } from "./TeamSelection";
import { TeamView } from "./TeamView";
import type { TeamWithRoster } from "../types";

export function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const [data, setData] = useState<{
    team: TeamWithRoster;
    locked: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId) {
      loadData();
    }
  }, [teamId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamData, status] = await Promise.all([
        teamsAPI.getWithRoster(teamId!),
        teamsAPI.getRosterStatus(teamId!),
      ]);
      setData({
        team: teamData,
        locked: status.locked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-container">
        <h2>Error loading team</h2>
        <p>{error || "Team not found"}</p>
        <button className="btn btn-primary" onClick={loadData}>
          Try Again
        </button>
      </div>
    );
  }

  // Render based strictly on lock status
  if (data.locked) {
    return <TeamView />;
  }

  return <TeamSelection />;
}
