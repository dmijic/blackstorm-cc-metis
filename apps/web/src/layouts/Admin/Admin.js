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
import { Outlet, useLocation, useNavigate } from "react-router-dom";
// javascript plugin used to create scrollbars on windows
import PerfectScrollbar from "perfect-scrollbar";

// core components
import AdminNavbar from "components/Navbars/AdminNavbar.js";
import Footer from "components/Footer/Footer.js";
import Sidebar from "components/Sidebar/Sidebar.js";
import FixedPlugin from "components/FixedPlugin/FixedPlugin.js";
import ProjectNav from "components/Metis/ProjectNav.js";

import routes from "routes.js";

import logo from "assets/img/react-logo.png";
import { useAuth } from "contexts/AuthContext.js";
import { BackgroundColorContext } from "contexts/BackgroundColorContext";

var ps;

function Admin() {
  const location = useLocation();
  const navigate = useNavigate();
  const mainPanelRef = React.useRef(null);
  const { user, logout } = useAuth();
  const [sidebarOpened, setsidebarOpened] = React.useState(
    document.documentElement.className.indexOf("nav-open") !== -1
  );
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1) {
      document.documentElement.className += " perfect-scrollbar-on";
      document.documentElement.classList.remove("perfect-scrollbar-off");
      ps = new PerfectScrollbar(mainPanelRef.current, {
        suppressScrollX: true,
      });
      let tables = document.querySelectorAll(".table-responsive");
      for (let i = 0; i < tables.length; i++) {
        ps = new PerfectScrollbar(tables[i]);
      }
    }
    // Specify how to clean up after this effect:
    return function cleanup() {
      if (navigator.platform.indexOf("Win") > -1) {
        ps.destroy();
        document.documentElement.classList.add("perfect-scrollbar-off");
        document.documentElement.classList.remove("perfect-scrollbar-on");
      }
    };
  });
  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1) {
      let tables = document.querySelectorAll(".table-responsive");
      for (let i = 0; i < tables.length; i++) {
        ps = new PerfectScrollbar(tables[i]);
      }
    }
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
    if (mainPanelRef.current) {
      mainPanelRef.current.scrollTop = 0;
    }
  }, [location]);

  // this function opens and closes the sidebar on small devices
  const toggleSidebar = () => {
    document.documentElement.classList.toggle("nav-open");
    setsidebarOpened(!sidebarOpened);
  };

  const closeSidebar = () => {
    document.documentElement.classList.remove("nav-open");
    setsidebarOpened(false);
  };

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
      {({ color, changeColor }) => (
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
            <div className="main-panel" ref={mainPanelRef} data={color}>
              <AdminNavbar
                brandText={getBrandText(location.pathname)}
                isLoggingOut={isLoggingOut}
                onLogout={handleLogout}
                toggleSidebar={toggleSidebar}
                sidebarOpened={sidebarOpened}
                user={user}
              />
              {/* Show project sub-nav when inside a Metis project */}
              {/\/metis\/projects\/\d+\//.test(location.pathname) && (
                <div style={{ padding: '8px 24px 0', borderBottom: '1px solid #21262d' }}>
                  <ProjectNav />
                </div>
              )}
              <Outlet />
              <Footer fluid />
            </div>
          </div>
          <FixedPlugin bgColor={color} handleBgClick={changeColor} />
        </React.Fragment>
      )}
    </BackgroundColorContext.Consumer>
  );
}

export default Admin;
