import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function loadStoredToken(): string | null {
  const session = sessionStorage.getItem("token");
  if (session) {
    localStorage.setItem("token", session);
    return session;
  }
  const local = localStorage.getItem("token");
  if (local) {
    sessionStorage.setItem("token", local);
    return local;
  }
  return null;
}

function loadStoredUser(): AuthUser | null {
  const session = sessionStorage.getItem("user");
  if (session) {
    localStorage.setItem("user", session);
    return JSON.parse(session) as AuthUser;
  }
  const local = localStorage.getItem("user");
  if (local) {
    sessionStorage.setItem("user", local);
    return JSON.parse(local) as AuthUser;
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());

  const login = (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    sessionStorage.setItem("token", newToken);
    sessionStorage.setItem("user", JSON.stringify(newUser));
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook for consuming auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
