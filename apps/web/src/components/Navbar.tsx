import { useNavigate } from "react-router";
import { Zap } from "lucide-react";
import "./Navbar.css";

export default function Navbar() {
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Zap size={18} className="logo-icon" />
        <span className="logo-text">DRAFTROOM</span>
      </div>
      <div className="navbar-actions">
        <button className="btn-ghost" onClick={() => navigate("/login")}>
          Sign In
        </button>
        <button className="btn-primary" onClick={() => navigate("/signup")}>
          Get Started
        </button>
      </div>
    </nav>
  );
}
