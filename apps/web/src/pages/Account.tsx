import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Zap } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";
import { updateProfile, changePassword, deleteAccount } from "../api/auth";
import "./Account.css";

export default function Account() {
  usePageTitle("Account");
  const navigate = useNavigate();
  const { user, token, login, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  // Password-confirmed deletion state (kept for quick restore):
  // const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
    setDeleteError("");
    // Password-confirmed deletion flow (kept for quick restore):
    // setDeletePassword("");
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setDeleteError("");

    if (!user?.id || !token) {
      setDeleteError("You must be signed in to delete your account.");
      return;
    }

    // Password-confirmed deletion flow (kept for quick restore):
    // if (!deletePassword.trim()) {
    //   setDeleteError("Please confirm your current password to delete your account.");
    //   return;
    // }

    try {
      setIsDeleting(true);
      // Password-confirmed deletion API call variant:
      // await deleteAccount(user.id, token, deletePassword);
      await deleteAccount(user.id, token);
      logout();
      navigate("/login", {
        replace: true,
        state: { successMessage: "Account deleted successfully, we're sorry to see you go."},
      });
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message: "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
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
      {isDeleteModalOpen && (
        <div className="account-modal-backdrop" role="dialog" aria-modal="true">
          <div className="account-modal">
            <h3>Delete Account</h3>
            <p className="account-modal-warning">
              This action is permanent and cannot be undone. Do you want to continue?
            </p>

            {/* Password-confirmed deletion field (kept for quick restore):
            <div className="account-field">
              <label>Current Password</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                disabled={isDeleting}
              />
            </div>
            */}

            {deleteError && <div className="account-error">{deleteError}</div>}

            <div className="account-modal-actions">
              <button
                className="account-signout-btn"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="account-delete-btn account-delete-confirm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div> )}
    </div>
  );
}
