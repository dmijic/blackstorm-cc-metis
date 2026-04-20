import React from "react";
// nodejs library that concatenates classes
import classNames from "classnames";

// reactstrap components
import {
  Badge,
  Button,
  Collapse,
  NavbarBrand,
  Navbar,
  Nav,
  Container,
  NavbarToggler,
} from "reactstrap";
import animeAvatar from "assets/img/anime3.png";

function AdminNavbar(props) {
  const [collapseOpen, setcollapseOpen] = React.useState(false);
  const [color, setcolor] = React.useState("navbar-transparent");
  React.useEffect(() => {
    window.addEventListener("resize", updateColor);
    updateColor();

    return function cleanup() {
      window.removeEventListener("resize", updateColor);
    };
  }, [collapseOpen]);
  // function that adds color white/transparent to the navbar on resize (this is for the collapse)
  const updateColor = () => {
    if (window.innerWidth < 993 && collapseOpen) {
      setcolor("bg-white");
    } else {
      setcolor("navbar-transparent");
    }
  };
  // this function opens and closes the collapse on small devices
  const toggleCollapse = () => {
    if (collapseOpen) {
      setcolor("navbar-transparent");
    } else {
      setcolor("bg-white");
    }
    setcollapseOpen(!collapseOpen);
  };
  return (
    <>
      <Navbar className={classNames("metis-sticky-navbar", color)} expand="lg">
        <Container fluid>
          <div className="navbar-wrapper">
            <div
              className={classNames("navbar-toggle d-inline", {
                toggled: props.sidebarOpened,
              })}
            >
              <NavbarToggler onClick={props.toggleSidebar}>
                <span className="navbar-toggler-bar bar1" />
                <span className="navbar-toggler-bar bar2" />
                <span className="navbar-toggler-bar bar3" />
              </NavbarToggler>
            </div>
            <Button
              className="metis-sidebar-collapse-btn d-none d-lg-inline-flex"
              color="secondary"
              outline
              size="sm"
              onClick={props.toggleSidebarCollapse}
              title={props.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <i
                className={`fas ${
                  props.sidebarCollapsed ? "fa-angles-right" : "fa-angles-left"
                }`}
              />
            </Button>
            <NavbarBrand href="#pablo" onClick={(e) => e.preventDefault()}>
              {props.brandText}
            </NavbarBrand>
          </div>
          <NavbarToggler type="button" onClick={toggleCollapse}>
            <span className="navbar-toggler-bar navbar-kebab" />
            <span className="navbar-toggler-bar navbar-kebab" />
            <span className="navbar-toggler-bar navbar-kebab" />
          </NavbarToggler>
          <Collapse navbar isOpen={collapseOpen}>
            <Nav className="ml-auto align-items-lg-center" navbar>
              <div className="d-flex align-items-center mr-lg-3 mb-3 mb-lg-0">
                <div className="photo mr-2">
                  <img alt="Authenticated user" src={animeAvatar} />
                </div>
                <div className="text-lg-right">
                  <div className="text-white small">{props.user?.email}</div>
                  <Badge color="info" pill>
                    {props.user?.role || "Authenticated"}
                  </Badge>
                </div>
              </div>
              <Button
                className="btn-simple"
                color="info"
                disabled={props.isLoggingOut}
                onClick={props.onLogout}
              >
                {props.isLoggingOut ? "Logging out..." : "Logout"}
              </Button>
              <li className="separator d-lg-none" />
            </Nav>
          </Collapse>
        </Container>
      </Navbar>
    </>
  );
}

export default AdminNavbar;
