// import { useNavigate } from 'react-router';
// import { Zap, User, LogOut } from "lucide-react";
// import { useAuth } from "../contexts/AuthContext";
// import "./AuthNavbar.css";

// export default function AuthNavbar() {
//   const navigate = useNavigate();
//   const { user, logout } = useAuth();

//   const handleLogout = () => {
//     logout();
//     navigate("/");
//   };

//   return (
//     <nav className="auth-navbar">
//       <div className="auth-navbar-logo" onClick={() => navigate('/leagues')}>
//         <Zap size={18} className="logo-icon" />
//         <span className="logo-text">DRAFTROOM</span>
//       </div>
      
//       <div className="auth-navbar-center">
//         <button className="nav-link" onClick={() => navigate('/leagues')}>
//           Leagues
//         </button>
//         <button className="nav-link" onClick={() => navigate('/research')}>
//           Research
//         </button>
//         <button className="nav-link nav-link-disabled">
//           My Draft
//         </button>
//       </div>

//       <div className="auth-navbar-actions">
//         <div className="user-info">
//           <User size={16} />
//           <span>{user?.username}</span>
//         </div>
//         <button className="btn-logout" onClick={handleLogout}>
//           <LogOut size={16} />
//           <span>Logout</span>
//         </button>
//       </div>
//     </nav>
//   );
// }


import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Zap, User, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import "./AuthNavbar.css";

export default function AuthNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { league } = useLeague();
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const leagueBase = league ? `/leagues/${league.id}` : '';
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="auth-navbar">
      <div className="auth-navbar-logo" onClick={() => navigate('/leagues')}>
        <Zap size={18} className="logo-icon" />
        <span className="logo-text">DRAFTROOM</span>
      </div>

      {league && (
        <div className="auth-navbar-center">
          <button
            className={"nav-link" + (isActive(`${leagueBase}/research`) ? " nav-link-active" : "")}
            onClick={() => navigate(`${leagueBase}/research`)}
          >
            Research
          </button>
          <button
            className={"nav-link" + (isActive(`${leagueBase}/my-draft`) ? " nav-link-active" : "")}
            onClick={() => navigate(`${leagueBase}/my-draft`)}
          >
            My Draft
          </button>
          <button
            className={"nav-link" + (isActive(`${leagueBase}/command-center`) ? " nav-link-active" : "")}
            onClick={() => navigate(`${leagueBase}/command-center`)}
          >
            Command Center
          </button>
        </div>
      )}

      <div className="auth-navbar-actions">
        {league && (
          <div className="league-selector">
            <button
              className="league-selector-btn"
              onClick={() => setLeagueDropdownOpen((o) => !o)}
            >
              <span>{league.name}</span>
              <ChevronDown size={14} className={"league-selector-chevron" + (leagueDropdownOpen ? " chevron-open" : "")} />
            </button>
            {leagueDropdownOpen && (
              <div className="league-selector-dropdown">
                <button
                  className="league-selector-item league-selector-current"
                  onClick={() => { navigate(leagueBase); setLeagueDropdownOpen(false); }}
                >
                  {league.name}
                </button>
                <div className="league-selector-divider" />
                <button
                  className="league-selector-item"
                  onClick={() => { navigate('/leagues'); setLeagueDropdownOpen(false); }}
                >
                  Switch League
                </button>
              </div>
            )}
          </div>
        )}
        <div className="user-info">
          <User size={16} />
          <span>{user?.username}</span>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}