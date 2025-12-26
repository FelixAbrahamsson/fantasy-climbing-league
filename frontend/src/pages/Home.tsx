import { Link } from "react-router-dom";
import { Mountain, Trophy, Users, TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "./Home.css";

export function Home() {
  const { user } = useAuth();

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <Mountain size={16} />
            Season 2024
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
            <span className="climber-points">+1000</span>
          </div>
          <div className="hero-card hero-card-2">
            <div className="climber-avatar">🧗‍♂️</div>
            <span>Toby Roberts</span>
            <span className="climber-points">+805</span>
          </div>
          <div className="hero-card hero-card-3">
            <div className="climber-avatar">👑</div>
            <span>Captain Bonus</span>
            <span className="climber-points">+20%</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <Users />
              </div>
              <h3>Draft Your Team</h3>
              <p>
                Select 6 climbers from the IFSC World Cup circuit to form your
                ultimate squad.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Trophy />
              </div>
              <h3>Earn Points</h3>
              <p>
                Score points based on your climbers' real performances. Captain
                gets 20% bonus!
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <TrendingUp />
              </div>
              <h3>Climb the Ranks</h3>
              <p>
                Compete against friends in private leagues. Strategic transfers
                after each event.
              </p>
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
              <span>1000</span>
            </div>
            <div className="scoring-row silver">
              <span>🥈 2nd Place</span>
              <span>805</span>
            </div>
            <div className="scoring-row bronze">
              <span>🥉 3rd Place</span>
              <span>655</span>
            </div>
            <div className="scoring-row">
              <span>4th Place</span>
              <span>540</span>
            </div>
            <div className="scoring-row">
              <span>5th Place</span>
              <span>445</span>
            </div>
            <div className="scoring-row">
              <span>6th - 8th</span>
              <span>365 - 245</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
