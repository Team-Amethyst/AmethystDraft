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


import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Zap, ChevronDown, Settings, LogOut, UserCog } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import "./AuthNavbar.css";

export default function AuthNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { league, allLeagues } = useLeague();
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLeagueDropdownOpen(false);
      }
    };
    if (leagueDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [leagueDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    if (userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userDropdownOpen]);

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
          <div className="league-selector" ref={dropdownRef}>
            <button
              className="league-selector-btn"
              onClick={() => setLeagueDropdownOpen((o) => !o)}
            >
              <span>{league.name}</span>
              <ChevronDown size={14} className={"league-selector-chevron" + (leagueDropdownOpen ? " chevron-open" : "")} />
            </button>
            {leagueDropdownOpen && (
              <div className="league-selector-dropdown">
                {allLeagues.map((l) => (
                  <div key={l.id} className={"league-selector-row" + (l.id === league.id ? " league-selector-row-current" : "")}>
                    <button
                      className="league-selector-item"
                      onClick={() => { navigate(`/leagues/${l.id}/research`); setLeagueDropdownOpen(false); }}
                    >
                      {l.name}
                    </button>
                    <button
                      className="league-selector-settings"
                      title="League settings"
                      onClick={() => { navigate(`/leagues/${l.id}/settings`); setLeagueDropdownOpen(false); }}
                    >
                      <Settings size={13} />
                    </button>
                  </div>
                ))}
                <div className="league-selector-divider" />
                <button
                  className="league-selector-item"
                  onClick={() => { navigate('/leagues'); setLeagueDropdownOpen(false); }}
                >
                  All Leagues
                </button>
              </div>
            )}
          </div>
        )}
        <div className="user-avatar-wrap" ref={userDropdownRef}>
          <button
            className="user-avatar-btn"
            onClick={() => setUserDropdownOpen((o) => !o)}
            title={user?.displayName}
          >
            {user?.displayName?.[0]?.toUpperCase() ?? "?"}
          </button>
          {userDropdownOpen && (
            <div className="user-dropdown">
              <div className="user-dropdown-greeting">Hi, {user?.displayName ?? "there"}</div>
              <div className="user-dropdown-divider" />
              <button className="user-dropdown-item" onClick={() => { navigate("/account"); setUserDropdownOpen(false); }}>
                <UserCog size={14} />
                <span>Manage Account</span>
              </button>
              <button className="user-dropdown-item user-dropdown-signout" onClick={() => { handleLogout(); setUserDropdownOpen(false); }}>
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}