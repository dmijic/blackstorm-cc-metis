/*!

=========================================================
* Black Dashboard React v1.2.2
=========================================================

* Product Page: https://www.creative-tim.com/product/black-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/black-dashboard-react/blob/master/LICENSE.md)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";

import AdminLayout from "layouts/Admin/Admin.js";
import AuthGuard from "components/AuthGuard.js";
import { AuthProvider, useAuth } from "contexts/AuthContext.js";
import { MetisProvider } from "contexts/MetisContext.js";
import CommandPalette from "components/Metis/CommandPalette.js";
import Login from "views/Login.js";
import routes from "routes.js";

import "assets/scss/black-dashboard-react.scss";
import "assets/demo/demo.css";
import "assets/css/nucleo-icons.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "assets/css/metis.css";

import ThemeContextWrapper from "./components/ThemeWrapper/ThemeWrapper";
import BackgroundColorWrapper from "./components/BackgroundColorWrapper/BackgroundColorWrapper";

const root = ReactDOM.createRoot(document.getElementById("root"));

function LoginRoute() {
  const { token, user } = useAuth();

  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<AuthGuard />}>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {routes.map((route) => (
            <Route
              element={route.component}
              key={route.path}
              path={route.route}
            />
          ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

root.render(
  <AuthProvider>
    <MetisProvider>
      <ThemeContextWrapper>
        <BackgroundColorWrapper>
          <BrowserRouter>
            <CommandPalette />
            <AppRoutes />
          </BrowserRouter>
        </BackgroundColorWrapper>
      </ThemeContextWrapper>
    </MetisProvider>
  </AuthProvider>
);
