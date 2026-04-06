import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Zap } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";import { updateProfile, changePassword } from "../api/auth";import "./Account.css";

export default function Account() {
  usePageTitle("Account");
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleSaveProfile = async () => {
    try {
      const updatedUser = await updateProfile({ displayName, email }, token!);
      login(token!, updatedUser); // Update the context with new user data
      alert("Profile updated successfully");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update profile");
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    try {
      await changePassword(currentPassword, newPassword, token!);
      alert("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    }
  };

  const handleDeleteAccount = () => {
    // TODO(db): DELETE /users/:id — require confirmation modal before wiring
    console.log("Delete account");
  };

  return (
    <div className="account-page">
      <nav className="account-nav">
        <div className="account-nav-logo" onClick={() => navigate("/leagues")}>
          <Zap size={18} className="logo-icon" />
          <span>DRAFTROOM</span>
        </div>
      </nav>

      <div className="account-container">
        <button className="account-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="account-header">
          <div className="account-avatar">
            {user?.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <h1>{user?.displayName}</h1>
            <p>{user?.email}</p>
            {user?.createdAt && (
              <p className="account-member-since">
                Member since{" "}
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        <div className="account-sections">
          {/* Profile */}
          <div className="account-card">
            <div className="account-card-title">Profile</div>
            <div className="account-form">
              <div className="account-field">
                <label>Display Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="account-field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <button className="account-save-btn" onClick={handleSaveProfile}>
              <Save size={14} />
              <span>Save Changes</span>
            </button>
          </div>

          {/* Password */}
          <div className="account-card">
            <div className="account-card-title">Change Password</div>
            <div className="account-form">
              <div className="account-field">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="account-field">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="account-field">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {passwordError && (
                <div className="account-error">{passwordError}</div>
              )}
            </div>
            <button className="account-save-btn" onClick={handleChangePassword}>
              <Save size={14} />
              <span>Update Password</span>
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="account-danger">
          <button
            className="account-signout-btn"
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            Sign Out
          </button>
          <button className="account-delete-btn" onClick={handleDeleteAccount}>
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
