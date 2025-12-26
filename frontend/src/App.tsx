import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { Leagues } from "./pages/Leagues";
import { CreateLeague } from "./pages/CreateLeague";
import { LeagueDashboard } from "./pages/LeagueDashboard";
import { TeamSelection } from "./pages/TeamSelection";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/leagues" element={<Leagues />} />
            <Route path="/leagues/create" element={<CreateLeague />} />
            <Route path="/leagues/:leagueId" element={<LeagueDashboard />} />
            <Route path="/teams/:teamId" element={<TeamSelection />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
