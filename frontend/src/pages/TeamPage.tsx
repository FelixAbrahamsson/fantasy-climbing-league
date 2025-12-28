import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { teamsAPI } from "../services/api";
import { TeamSelection } from "./TeamSelection";
import { TeamView } from "./TeamView";

export function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const [isLocked, setIsLocked] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (teamId) {
      checkLockStatus();
    }
  }, [teamId]);

  const checkLockStatus = async () => {
    try {
      const status = await teamsAPI.getRosterStatus(teamId!);
      setIsLocked(status.locked);
    } catch (err) {
      // Default to unlocked if can't determine
      setIsLocked(false);
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

  // If roster is locked, show read-only TeamView with transfers
  // If unlocked, show TeamSelection for free editing
  return isLocked ? <TeamView /> : <TeamSelection />;
}
