import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mountain, Trophy } from "lucide-react";
import { leaguesAPI } from "../services/api";
import "./CreateLeague.css";

export function CreateLeague() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"men" | "women">("men");
  const [discipline, setDiscipline] = useState<"boulder" | "lead">("boulder");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const league = await leaguesAPI.create({ name, gender, discipline });
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league");
    } finally {
      setLoading(false);
    }
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

            <div className="form-info">
              <Mountain size={16} />
              <span>
                Your league will track {gender}'s {discipline} World Cup events
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create League"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
