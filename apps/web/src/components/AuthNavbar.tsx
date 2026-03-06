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


import { useNavigate, useLocation } from 'react-router';
import { Zap, User, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import "./AuthNavbar.css";

export default function AuthNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="auth-navbar">
      <div className="auth-navbar-logo" onClick={() => navigate('/leagues')}>
        <Zap size={18} className="logo-icon" />
        <span className="logo-text">DRAFTROOM</span>
      </div>
      
      <div className="auth-navbar-center">
        <button
          className={"nav-link" + (isActive('/leagues') ? " nav-link-active" : "")}
          onClick={() => navigate('/leagues')}
        >
          Leagues
        </button>
        <button
          className={"nav-link" + (isActive('/research') ? " nav-link-active" : "")}
          onClick={() => navigate('/research')}
        >
          Research
        </button>
        <button
          className={"nav-link" + (isActive('/command-center') ? " nav-link-active" : "")}
          onClick={() => navigate('/command-center')}
        >
          Command Center
        </button>
        <button
          className={"nav-link" + (isActive('/my-draft') ? " nav-link-active" : "")}
          onClick={() => navigate('/my-draft')}
        >
          My Draft
        </button>
      </div>

      <div className="auth-navbar-actions">
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