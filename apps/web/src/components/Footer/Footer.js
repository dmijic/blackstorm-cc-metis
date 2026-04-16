import React from "react";
import { Container } from "reactstrap";

function Footer() {
  return (
    <footer className="footer">
      <Container fluid>
        <div style={{ fontSize: 11, color: '#484f58', padding: '8px 0' }}>
          Metis Command Center &nbsp;·&nbsp; {new Date().getFullYear()}
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
