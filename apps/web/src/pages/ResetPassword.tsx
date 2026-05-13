import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { resetPassword } from "../api/auth";
import { usePageTitle } from "../hooks/usePageTitle";
import "./ForgotPassword.css";

export default function ResetPassword() {
  usePageTitle("Reset Password");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      setError("Invalid reset link. Missing token or email.");
    }
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token || !email) {
      setError("Invalid reset link.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, token, password);
      setSuccess(true);
      setTimeout(() => {
        navigate("/login", {
          state: { successMessage: "Password reset successfully. Please log in." },
        });
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="fp-page">
        <div className="fp-bg" />
        <div className="fp-container">
          <Link to="/login" className="fp-back">
            <ArrowLeft size={15} /> Back to sign in
          </Link>
          <h1 className="fp-title">Invalid Reset Link</h1>
          <p className="fp-subtitle">
            The reset link is missing required information. Please request a new one.
          </p>
          <Link to="/forgot-password" className="fp-back">
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="fp-page">
        <div className="fp-bg" />
        <div className="fp-container">
          <h1 className="fp-title">Password Reset</h1>
          <p className="fp-subtitle">
            Your password has been reset successfully. Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fp-page">
      <div className="fp-bg" />
      <div className="fp-container">
        <Link to="/login" className="fp-back">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
        <h1 className="fp-title">Create New Password</h1>
        <p className="fp-subtitle">Enter your new password below.</p>
        <form onSubmit={handleSubmit} className="fp-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="fp-input"
            placeholder="New password"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="fp-input"
            placeholder="Confirm password"
          />
          {error && <p className="fp-error">{error}</p>}
          <button type="submit" disabled={loading} className="fp-submit">
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
