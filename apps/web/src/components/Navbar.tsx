import { useNavigate } from "react-router";
import { Zap } from "lucide-react";
import "./Navbar.css";
 
export default function Navbar() {
  const navigate = useNavigate();
 
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Zap size={18} className="logo-icon" />
        <div className="navbar-logo-text-group">
          <span className="logo-text">DRAFTROOM</span>
          <span className="logo-byline">by Amethyst Industries</span>
        </div>
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