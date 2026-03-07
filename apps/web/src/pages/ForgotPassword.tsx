import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { forgotPassword } from "../api/auth";
import { usePageTitle } from "../hooks/usePageTitle";
import "./ForgotPassword.css";

export default function ForgotPassword() {
  usePageTitle("Forgot Password");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fp-page">
        <div className="fp-bg" />
        <div className="fp-container">
          <h1 className="fp-title">Check your email</h1>
          <p className="fp-subtitle">
            We sent a reset link to{" "}
            <strong style={{ color: "#f0e6ff" }}>{email}</strong>. Check your
            inbox and follow the instructions.
          </p>
          <Link to="/login" className="fp-back">
            <ArrowLeft size={15} /> Back to sign in
          </Link>
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
        <h1 className="fp-title">Reset Password</h1>
        <p className="fp-subtitle">Enter your email to receive a reset link.</p>
        <form onSubmit={handleSubmit} className="fp-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="fp-input"
            placeholder="you@email.com"
          />
          {error && <p className="fp-error">{error}</p>}
          <button type="submit" disabled={loading} className="fp-submit">
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
