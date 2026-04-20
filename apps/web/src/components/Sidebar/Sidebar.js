/*eslint-disable*/
import React from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
// nodejs library to set properties for components
import { PropTypes } from "prop-types";

// javascript plugin used to create scrollbars on windows
import PerfectScrollbar from "perfect-scrollbar";

// reactstrap components
import { Nav } from "reactstrap";
import { BackgroundColorContext } from "contexts/BackgroundColorContext";

function Sidebar(props) {
  const location = useLocation();
  const sidebarRef = React.useRef(null);
  // verifies if routeName is the one active (in browser input)
  const activeRoute = (routeName) => {
    return location.pathname === routeName ||
      location.pathname.startsWith(`${routeName}/`)
      ? "active"
      : "";
  };
  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1 && sidebarRef.current) {
      const scrollbar = new PerfectScrollbar(sidebarRef.current, {
        suppressScrollX: true,
        suppressScrollY: false,
      });

      return function cleanup() {
        scrollbar.destroy();
      };
    }

    return undefined;
  }, []);
  const linkOnClick = () => {
    document.documentElement.classList.remove("nav-open");
    props.closeSidebar?.();
  };
  const { routes, rtlActive, logo } = props;
  let logoImg = null;
  let logoText = null;
  if (logo !== undefined) {
    if (logo.outterLink !== undefined) {
      logoImg = (
        <a
          href={logo.outterLink}
          className="simple-text logo-mini"
          target="_blank"
          rel="noreferrer"
          onClick={linkOnClick}
        >
          <div className="logo-img">
            <img src={logo.imgSrc} alt="react-logo" />
          </div>
        </a>
      );
      logoText = (
        <a
          href={logo.outterLink}
          className="simple-text logo-normal"
          target="_blank"
          rel="noreferrer"
          onClick={linkOnClick}
        >
          {logo.text}
        </a>
      );
    } else {
      logoImg = (
        <Link
          to={logo.innerLink}
          className="simple-text logo-mini"
          onClick={linkOnClick}
        >
          <div className="logo-img">
            <img src={logo.imgSrc} alt="react-logo" />
          </div>
        </Link>
      );
      logoText = (
        <Link
          to={logo.innerLink}
          className="simple-text logo-normal"
          onClick={linkOnClick}
        >
          {logo.text}
        </Link>
      );
    }
  }
  return (
    <BackgroundColorContext.Consumer>
      {({ color }) => (
        <div
          className={`sidebar${props.collapsed ? " collapsed" : ""}`}
          data={color}
        >
          <div className="sidebar-wrapper" ref={sidebarRef}>
            {logoImg !== null || logoText !== null ? (
              <div className="logo">
                <div className="metis-sidebar-brand">
                  {logoImg}
                  {logoText}
                </div>
                <button
                  type="button"
                  className="metis-sidebar-rail-toggle d-none d-lg-inline-flex"
                  onClick={props.toggleSidebarCollapse}
                  title={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <i
                    className={`fas ${
                      props.collapsed ? "fa-angles-right" : "fa-angles-left"
                    }`}
                  />
                </button>
              </div>
            ) : null}
            <Nav>
              {/* Grouped sidebar with section labels */}
              {(() => {
                const rendered = [];
                let lastGroup = null;
                routes.forEach((prop, key) => {
                  if (prop.redirect || prop.hidden) return;
                  // Render group label when group changes
                  if (prop.groupLabel && prop.group !== lastGroup) {
                    rendered.push(
                      <li key={`group-${prop.group}`} className="nav-group-label">
                        <p style={{
                          fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
                          color: '#4fc3f7', padding: '14px 16px 4px', margin: 0, fontWeight: 600,
                        }}>
                          {prop.groupLabel}
                        </p>
                      </li>
                    );
                  }
                  lastGroup = prop.group;
                  rendered.push(
                    <li className={activeRoute(prop.path)} key={key}>
                      <NavLink
                        to={prop.path}
                        className="nav-link"
                        onClick={linkOnClick}
                        title={rtlActive ? prop.rtlName : prop.name}
                      >
                        <i className={prop.icon} />
                        <p>{rtlActive ? prop.rtlName : prop.name}</p>
                      </NavLink>
                    </li>
                  );
                });
                return rendered;
              })()}
              {/* Command palette hint */}
              <li style={{ marginTop: 24, padding: '0 16px' }}>
                <div className="metis-sidebar-shortcut" style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid #30363d',
                  borderRadius: 6, padding: '7px 10px', fontSize: 11, color: '#555',
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                }}
                onClick={() => {
                  const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
                  document.dispatchEvent(event);
                }}
                >
                  <i className="fas fa-search" style={{ fontSize: 10 }} />
                  <span>Search &amp; Commands</span>
                  <span className="metis-sidebar-shortcut-key" style={{ marginLeft: 'auto', fontSize: 10, border: '1px solid #30363d', padding: '1px 5px', borderRadius: 3 }}>⌘K</span>
                </div>
              </li>
            </Nav>
          </div>
        </div>
      )}
    </BackgroundColorContext.Consumer>
  );
}

Sidebar.propTypes = {
  // if true, then instead of the routes[i].name, routes[i].rtlName will be rendered
  // insde the links of this component
  rtlActive: PropTypes.bool,
  routes: PropTypes.arrayOf(PropTypes.object),
  closeSidebar: PropTypes.func,
  collapsed: PropTypes.bool,
  logo: PropTypes.shape({
    // innerLink is for links that will direct the user within the app
    // it will be rendered as <Link to="...">...</Link> tag
    innerLink: PropTypes.string,
    // outterLink is for links that will direct the user outside the app
    // it will be rendered as simple <a href="...">...</a> tag
    outterLink: PropTypes.string,
    // the text of the logo
    text: PropTypes.node,
    // the image src of the logo
    imgSrc: PropTypes.string,
  }),
  toggleSidebarCollapse: PropTypes.func,
};

export default Sidebar;
