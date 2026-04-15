import React from "react";

import {
  USER_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  apiRequest,
  getStoredToken,
  getStoredUser,
} from "lib/api.js";

const AuthContext = React.createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = React.useState(() => getStoredToken() || "");
  const [user, setUserState] = React.useState(() => getStoredUser());

  const setUser = (nextUser) => {
    if (nextUser) {
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    } else {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }

    setUserState(nextUser);
  };

  const setSession = (nextToken, nextUser) => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  };

  const clearSession = () => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(USER_STORAGE_KEY);
    setToken("");
    setUserState(null);
  };

  const login = async ({ email, password, deviceName }) => {
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        device_name: deviceName,
      }),
    });

    setSession(payload.token, payload.user);

    return payload;
  };

  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Logout should clear local auth state even if the API call fails.
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        logout,
        setUser,
        clearSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
