import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "reactstrap";

import { useAuth } from "contexts/AuthContext.js";
import { apiRequest } from "lib/api.js";

function AuthGuard() {
  const location = useLocation();
  const { token, setUser, clearSession } = useAuth();
  const [status, setStatus] = React.useState(token ? "checking" : "guest");
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (!token) {
      setStatus("guest");
      return;
    }

    let ignore = false;

    setStatus("checking");
    setErrorMessage("");

    apiRequest("/me")
      .then((payload) => {
        if (ignore) {
          return;
        }

        setUser(payload?.data || null);
        setStatus("ready");
      })
      .catch((error) => {
        if (ignore) {
          return;
        }

        if (error.status === 401) {
          clearSession();
          setStatus("guest");
          return;
        }

        setErrorMessage(error.message || "Unable to verify the current session.");
        setStatus("error");
      });

    return () => {
      ignore = true;
    };
  }, [token]);

  if (!token || status === "guest") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === "checking") {
    return (
      <div className="vh-100 d-flex align-items-center justify-content-center bg-default">
        <div className="text-center text-white">
          <Spinner color="info" />
          <p className="mt-3 mb-0">Validating your session...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="vh-100 d-flex align-items-center justify-content-center bg-default">
        <div className="text-center text-white px-4">
          <h3 className="mb-2">Session check failed</h3>
          <p className="mb-0 text-muted">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default AuthGuard;
