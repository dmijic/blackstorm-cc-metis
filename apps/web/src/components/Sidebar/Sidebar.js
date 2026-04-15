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

var ps;

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
    if (navigator.platform.indexOf("Win") > -1) {
      ps = new PerfectScrollbar(sidebarRef.current, {
        suppressScrollX: true,
        suppressScrollY: false,
      });
    }
    // Specify how to clean up after this effect:
    return function cleanup() {
      if (navigator.platform.indexOf("Win") > -1) {
        ps.destroy();
      }
    };
  });
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
        <div className="sidebar" data={color}>
          <div className="sidebar-wrapper" ref={sidebarRef}>
            {logoImg !== null || logoText !== null ? (
              <div className="logo">
                {logoImg}
                {logoText}
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
                      <NavLink to={prop.path} className="nav-link" onClick={linkOnClick}>
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
                <div style={{
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
                  <span style={{ marginLeft: 'auto', fontSize: 10, border: '1px solid #30363d', padding: '1px 5px', borderRadius: 3 }}>⌘K</span>
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
};

export default Sidebar;
