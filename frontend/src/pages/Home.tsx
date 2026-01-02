import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Mountain, Trophy } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { scoringAPI } from "../services/api";
import type { ScoringConfig } from "../services/api";
import "./Home.css";

export function Home() {
  const { user } = useAuth();
  const [scoring, setScoring] = useState<ScoringConfig | null>(null);

  useEffect(() => {
    scoringAPI.getConfig().then(setScoring).catch(console.error);
  }, []);

  // Get points for a rank from scoring config
  const getPoints = (rank: number) => {
    if (!scoring) return "—";
    const entry = scoring.points_table.find((p) => p.rank === rank);
    return entry?.points ?? scoring.min_points;
  };

  // Format captain bonus (2x = "2x", 1.2 = "+20%")
  const captainBonusText = scoring
    ? scoring.captain_multiplier === 2
      ? "2x"
      : `+${Math.round((scoring.captain_multiplier - 1) * 100)}%`
    : "2x";

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <Mountain size={16} />
            Season 2026
          </div>
          <h1 className="hero-title">
            Fantasy Climbing
            <span className="hero-subtitle">League</span>
          </h1>
          <p className="hero-description">
            Draft your dream team of IFSC World Cup climbers. Compete against
            friends. Become the ultimate climbing manager.
          </p>
          <div className="hero-actions">
            {user ? (
              <>
                <Link to="/leagues" className="btn btn-primary btn-lg">
                  <Trophy size={20} />
                  View My Leagues
                </Link>
                <Link to="/leagues/create" className="btn btn-secondary btn-lg">
                  Create League
                </Link>
              </>
            ) : (
              <>
                <Link to="/signup" className="btn btn-primary btn-lg">
                  Start Playing
                </Link>
                <Link to="/login" className="btn btn-secondary btn-lg">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-card hero-card-1">
            <div className="climber-avatar">🧗</div>
            <span>Janja Garnbret</span>
            <span className="climber-points">+{getPoints(1)}</span>
          </div>
          <div className="hero-card hero-card-2">
            <div className="climber-avatar">🧗‍♂️</div>
            <span>Toby Roberts</span>
            <span className="climber-points">+{getPoints(2)}</span>
          </div>
          <div className="hero-card hero-card-3">
            <div className="climber-avatar">👑</div>
            <span>Captain Bonus</span>
            <span className="climber-points">{captainBonusText}</span>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="features">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">
            Compete with friends by managing your own climbing team
          </p>

          <div className="how-it-works-steps">
            {/* Step 1: Create/Join League */}
            <div className="step-card">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Create or Join a League</h3>
                <p>
                  Create a private league and invite your friends. Choose which
                  IFSC events are part of your league, and select the discipline
                  (Boulder, Lead, or Speed) and gender category.
                </p>
              </div>
            </div>

            {/* Step 2: Draft Your Team */}
            <div className="step-card">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Draft Your Team</h3>
                <p>
                  Select athletes to form your squad. Athletes are divided into
                  tiers based on their previous season rankings — you can only
                  pick a limited number from each tier, so choose wisely!
                </p>
              </div>
            </div>

            {/* Step 3: Earn Points */}
            <div className="step-card">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Earn Points</h3>
                <p>
                  After each event, your athletes earn fantasy points based on
                  their final placement. Points match the official IFSC World
                  Cup scoring system — 1st place earns {getPoints(1)} points,
                  2nd earns {getPoints(2)}, and so on.
                </p>
              </div>
            </div>

            {/* Step 4: Captain Bonus */}
            <div className="step-card">
              <div className="step-number">4</div>
              <div className="step-content">
                <h3>Pick Your Captain</h3>
                <p>
                  Designate one athlete as your team captain. Your captain earns
                  bonus points — pick the climber you believe will dominate!
                </p>
              </div>
            </div>

            {/* Step 5: Transfers */}
            <div className="step-card">
              <div className="step-number">5</div>
              <div className="step-content">
                <h3>Make Strategic Transfers</h3>
                <p>
                  After each event, you can swap athletes on your team. Use
                  transfers to capitalize on rising stars or replace
                  underperformers before the next competition.
                </p>
              </div>
            </div>

            {/* Step 6: Compete */}
            <div className="step-card">
              <div className="step-number">6</div>
              <div className="step-content">
                <h3>Climb the Leaderboard</h3>
                <p>
                  Compete against your friends throughout the season. Track
                  everyone's scores, analyze event breakdowns, and prove you're
                  the ultimate climbing manager!
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Scoring Section */}
      <section className="scoring">
        <div className="container">
          <h2 className="section-title">Scoring System</h2>
          <p className="section-subtitle">
            Points based on official IFSC World Cup rankings
          </p>
          <div className="scoring-table">
            <div className="scoring-row scoring-header">
              <span>Position</span>
              <span>Points</span>
            </div>
            <div className="scoring-row gold">
              <span>🥇 1st Place</span>
              <span>{getPoints(1)}</span>
            </div>
            <div className="scoring-row silver">
              <span>🥈 2nd Place</span>
              <span>{getPoints(2)}</span>
            </div>
            <div className="scoring-row bronze">
              <span>🥉 3rd Place</span>
              <span>{getPoints(3)}</span>
            </div>
            <div className="scoring-row">
              <span>4th Place</span>
              <span>{getPoints(4)}</span>
            </div>
            <div className="scoring-row">
              <span>5th Place</span>
              <span>{getPoints(5)}</span>
            </div>
            <div className="scoring-row">
              <span>6th - 8th</span>
              <span>
                {getPoints(6)} - {getPoints(8)}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
