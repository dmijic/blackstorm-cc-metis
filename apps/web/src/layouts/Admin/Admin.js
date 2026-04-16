import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
// javascript plugin used to create scrollbars on windows
import PerfectScrollbar from "perfect-scrollbar";

// core components
import AdminNavbar from "components/Navbars/AdminNavbar.js";
import Footer from "components/Footer/Footer.js";
import Sidebar from "components/Sidebar/Sidebar.js";
import ProjectNav from "components/Metis/ProjectNav.js";

import routes from "routes.js";

import logo from "assets/img/react-logo.png";
import { useAuth } from "contexts/AuthContext.js";
import { BackgroundColorContext } from "contexts/BackgroundColorContext";

function Admin() {
  const location = useLocation();
  const navigate = useNavigate();
  const mainPanelRef = React.useRef(null);
  const { user, logout } = useAuth();
  const [sidebarOpened, setsidebarOpened] = React.useState(
    document.documentElement.className.indexOf("nav-open") !== -1
  );
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const hasProjectNav = /\/metis\/projects\/\d+\//.test(location.pathname);

  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1 && mainPanelRef.current) {
      document.documentElement.classList.add("perfect-scrollbar-on");
      document.documentElement.classList.remove("perfect-scrollbar-off");
      const scrollbars = [
        new PerfectScrollbar(mainPanelRef.current, {
          suppressScrollX: true,
        }),
      ];

      document.querySelectorAll(".table-responsive").forEach((table) => {
        scrollbars.push(
          new PerfectScrollbar(table, {
            suppressScrollX: false,
          })
        );
      });

      return function cleanup() {
        scrollbars.forEach((instance) => instance.destroy());
        document.documentElement.classList.add("perfect-scrollbar-off");
        document.documentElement.classList.remove("perfect-scrollbar-on");
      };
    }

    return undefined;
  }, [location.pathname]);

  React.useEffect(() => {
    if (window.innerWidth < 992) {
      document.documentElement.classList.remove("nav-open");
      setsidebarOpened(false);
    }
  }, [location.pathname]);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 992) {
        document.documentElement.classList.remove("nav-open");
        setsidebarOpened(false);
      }
    };

    window.addEventListener("resize", handleResize);

    return function cleanup() {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
    if (mainPanelRef.current) {
      mainPanelRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  const toggleSidebar = React.useCallback(() => {
    const nextOpened = !document.documentElement.classList.contains("nav-open");
    document.documentElement.classList.toggle("nav-open", nextOpened);
    setsidebarOpened(nextOpened);
  }, []);

  const closeSidebar = React.useCallback(() => {
    document.documentElement.classList.remove("nav-open");
    setsidebarOpened(false);
  }, []);

  const getBrandText = (path) => {
    const activeRoute = routes.find((route) => {
      const pattern = `^/${route.route.replace(/:\w+/g, '[^/]+')}$`;
      return new RegExp(pattern).test(path);
    });

    return activeRoute?.name || "Dashboard";
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);

    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <BackgroundColorContext.Consumer>
      {({ color }) => (
        <React.Fragment>
          <div className="wrapper">
            <Sidebar
              closeSidebar={closeSidebar}
              routes={routes}
              logo={{
                innerLink: "/metis/projects",
                text: "Metis",
                imgSrc: logo,
              }}
              toggleSidebar={toggleSidebar}
            />
            {sidebarOpened && (
              <div
                className="metis-sidebar-backdrop"
                onClick={closeSidebar}
                role="presentation"
              />
            )}
            <div
              className={`main-panel${hasProjectNav ? " has-project-nav" : ""}`}
              ref={mainPanelRef}
              data={color}
            >
              <AdminNavbar
                brandText={getBrandText(location.pathname)}
                isLoggingOut={isLoggingOut}
                onLogout={handleLogout}
                toggleSidebar={toggleSidebar}
                sidebarOpened={sidebarOpened}
                user={user}
              />
              {hasProjectNav && (
                <div className="metis-project-nav-shell">
                  <ProjectNav />
                </div>
              )}
              <Outlet />
              <Footer fluid />
            </div>
          </div>
        </React.Fragment>
      )}
    </BackgroundColorContext.Consumer>
  );
}

export default Admin;
