import { authHeaders, requestJson, requestVoid } from "./client";

interface AuthResponse {
  token: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
}

export async function registerUser(
  displayName: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/api/auth/register",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ displayName, email, password }),
    },
    "Registration failed",
  );
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/api/auth/login",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    },
    "Login failed",
  );
}

export async function forgotPassword(email: string): Promise<void> {
  return requestVoid(
    "/api/auth/forgot-password",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email }),
    },
    "Request failed",
  );
}
