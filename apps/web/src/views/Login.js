import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Col, Container, Form, FormGroup, Input, Label, Row } from "reactstrap";
import { useAuth } from "contexts/AuthContext.js";

function Login() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { token, user, login } = useAuth();

  const [form, setForm]               = React.useState({ email: "", password: "" });
  const [errorMessage, setErrorMessage] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const redirectPath = location.state?.from?.pathname || "/dashboard";

  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(cur => ({ ...cur, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await login({ email: form.email, password: form.password, deviceName: "vite-web" });
      navigate(redirectPath, { replace: true });
    } catch (error) {
      const apiErrors    = error.data?.errors || {};
      const firstFieldErr = Object.values(apiErrors)[0]?.[0];
      setErrorMessage(firstFieldErr || error.message || "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1117',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Container>
        <Row className="justify-content-center">
          <Col lg="4" md="6">
            {/* Logo / title */}
            <div style={{ marginBottom: 28, textAlign: 'center' }}>
              <div style={{
                display: 'inline-block',
                width: 40, height: 40,
                background: '#4fc3f7',
                marginBottom: 12,
              }} />
              <h2 style={{
                color: '#e6edf3',
                fontWeight: 700,
                fontSize: 20,
                margin: 0,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                Command Center
              </h2>
              <p style={{ color: '#484f58', fontSize: 12, marginTop: 6 }}>
                Restricted access — authorised users only
              </p>
            </div>

            <div style={{
              background: '#161b22',
              border: '1px solid #30363d',
              padding: 24,
            }}>
              <Form onSubmit={handleSubmit}>
                {errorMessage && (
                  <Alert color="danger" className="mb-4" style={{ fontSize: 12 }}>
                    {errorMessage}
                  </Alert>
                )}

                <FormGroup style={{ marginBottom: 16 }}>
                  <Label for="email">Email</Label>
                  <Input
                    autoComplete="email"
                    id="email"
                    name="email"
                    onChange={handleInputChange}
                    placeholder="user@example.local"
                    type="email"
                    value={form.email}
                  />
                </FormGroup>

                <FormGroup style={{ marginBottom: 20 }}>
                  <Label for="password">Password</Label>
                  <Input
                    autoComplete="current-password"
                    id="password"
                    name="password"
                    onChange={handleInputChange}
                    placeholder="············"
                    type="password"
                    value={form.password}
                  />
                </FormGroup>

                <Button
                  block
                  color="info"
                  disabled={isSubmitting}
                  type="submit"
                  style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}
                >
                  {isSubmitting ? "Authenticating…" : "Sign In"}
                </Button>
              </Form>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default Login;
