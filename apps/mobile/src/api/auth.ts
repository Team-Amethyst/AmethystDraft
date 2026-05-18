import { authHeaders, requestJson, requestVoid } from "./client";

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
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

export async function resetPassword(
  email: string,
  token: string,
  newPassword: string,
): Promise<void> {
  return requestVoid(
    "/api/auth/reset-password",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, token, newPassword }),
    },
    "Password reset failed",
  );
}

export async function updateProfile(
  data: { displayName?: string; email?: string },
  token: string,
): Promise<AuthUser> {
  return requestJson<AuthUser>(
    "/api/auth/me",
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    },
    "Failed to update profile",
  );
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  token: string,
): Promise<void> {
  return requestVoid(
    "/api/auth/change-password",
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    "Failed to change password",
  );
}

export async function deleteAccount(userId: string, token: string): Promise<void> {
  return requestVoid(
    `/api/auth/users/${userId}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
    "Failed to delete account",
  );
}