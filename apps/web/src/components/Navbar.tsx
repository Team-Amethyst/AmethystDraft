import { Zap } from "lucide-react";
import "./Navbar.css";
import type { JSX } from "react/jsx-dev-runtime";


export default function Navbar(): JSX.Element {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Zap size={18} className="logo-icon" />
        <span className="logo-text">DRAFTROOM</span>
      </div>
      <div className="navbar-actions">
        <button className="btn-ghost">Sign In</button>
        <button className="btn-primary">Get Started</button>
      </div>
    </nav>
  );
}