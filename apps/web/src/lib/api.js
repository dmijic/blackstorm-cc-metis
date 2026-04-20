import { buildApiUrl, getApiBaseUrl } from "./apiBase";

export const TOKEN_STORAGE_KEY = "bcc_token";
export const USER_STORAGE_KEY = "bcc_user";
export const API_BASE_URL = getApiBaseUrl();

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getStoredUser() {
  const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch {
    window.localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

async function readResponseBody(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(responseText);
  }

  return responseText;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    const error = new Error(
      data?.message || data?.error || "Request failed."
    );

    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
