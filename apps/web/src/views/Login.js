import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Container,
  Form,
  FormGroup,
  Input,
  Label,
  Row,
} from "reactstrap";

import bgImage from "assets/img/header.jpg";
import { useAuth } from "contexts/AuthContext.js";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, login } = useAuth();
  const [form, setForm] = React.useState({
    email: "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const redirectPath = location.state?.from?.pathname || "/dashboard";

  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleInputChange = (event) => {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await login({
        email: form.email,
        password: form.password,
        deviceName: "vite-web",
      });

      navigate(redirectPath, { replace: true });
    } catch (error) {
      const apiErrors = error.data?.errors || {};
      const firstFieldError = Object.values(apiErrors)[0]?.[0];

      setErrorMessage(firstFieldError || error.message || "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="vh-100 d-flex align-items-center"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(16, 23, 41, 0.92), rgba(25, 135, 84, 0.7)), url(${bgImage})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <Container>
        <Row className="justify-content-center">
          <Col lg="5" md="7">
            <Card className="card-user shadow-lg border-0 mb-0">
              <CardHeader>
                <h1 className="mb-1">Command Center</h1>
                <p className="text-muted mb-0">
                  Sign in with your existing backend credentials.
                </p>
              </CardHeader>
              <CardBody>
                <Form onSubmit={handleSubmit}>
                  {errorMessage ? (
                    <Alert color="danger" className="mb-4">
                      {errorMessage}
                    </Alert>
                  ) : null}
                  <FormGroup>
                    <Label for="email">Email</Label>
                    <Input
                      autoComplete="email"
                      id="email"
                      name="email"
                      onChange={handleInputChange}
                      placeholder="admin@blackstorm.local"
                      type="email"
                      value={form.email}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label for="password">Password</Label>
                    <Input
                      autoComplete="current-password"
                      id="password"
                      name="password"
                      onChange={handleInputChange}
                      placeholder="Blackstorm123!"
                      type="password"
                      value={form.password}
                    />
                  </FormGroup>
                  <Button
                    block
                    className="btn-fill mt-4"
                    color="success"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? "Signing in..." : "Sign in"}
                  </Button>
                  <p className="text-muted small mt-4 mb-0">
                    Demo admin: <code>admin@blackstorm.local</code> /{" "}
                    <code>Blackstorm123!</code>
                  </p>
                </Form>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default Login;
