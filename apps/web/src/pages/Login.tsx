import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Zap, ArrowLeft } from "lucide-react";
import { loginUser } from "../api/auth";
import { useAuth } from "../contexts/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";
import "./Login.css";

export default function Login() {
  usePageTitle("Log In");
  const navigate = useNavigate();
  const { login } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const state = location.state as {successMessage?: string} | null;
    if (state?.successMessage) {
      setSuccessMessage(state.successMessage);
    } 
  }, [location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await loginUser(email, password);
      login(data.token, data.user);
      navigate("/leagues");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-container">
        <Link to="/" className="login-back">
          <ArrowLeft size={15} /> Back
        </Link>
        <div className="login-logo">
          <Zap size={18} style={{ color: "#a855f7" }} />
          <span>DRAFTROOM</span>
        </div>
        <h1 className="login-title">Sign In</h1>
        <p className="login-subtitle">
          Enter your credentials to access your draft room.
        </p>
        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label className="login-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="login-input"
              placeholder="you@email.com"
            />
          </div>
          <div className="login-field">
            <label className="login-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="login-input"
              placeholder="••••••••"
            />
          </div>
          {successMessage && <p className="login-success">{successMessage}</p>}
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading} className="login-submit">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div className="login-footer">
          <p className="login-footer-text">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="login-link">
              Sign up
            </Link>
          </p>
          <Link to="/forgot-password" className="login-link">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
