import React from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";

import { apiRequest } from "lib/api.js";

const statusColors = {
  queued: "warning",
  sent: "success",
  failed: "danger",
};

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

function ResponseActionRuns() {
  const [runs, setRuns] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [retryingRunId, setRetryingRunId] = React.useState(null);
  const [filters, setFilters] = React.useState({
    status: "",
    finding: "",
  });

  const loadRuns = async (nextFilters = filters) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const params = new URLSearchParams();

      if (nextFilters.status) {
        params.set("status", nextFilters.status);
      }

      if (nextFilters.finding) {
        params.set("finding", nextFilters.finding);
      }

      const query = params.toString();
      const payload = await apiRequest(
        `/api/response/action-runs${query ? `?${query}` : ""}`
      );

      setRuns(payload.data || []);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load action runs.");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadRuns();
  }, []);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;

    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  };

  const applyFilters = () => {
    loadRuns(filters);
  };

  const retryRun = async (runId) => {
    setRetryingRunId(runId);
    setErrorMessage("");

    try {
      await apiRequest(`/api/response/action-runs/${runId}/retry`, {
        method: "POST",
      });
      await loadRuns();
    } catch (error) {
      setErrorMessage(error.message || "Unable to retry action run.");
    } finally {
      setRetryingRunId(null);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col lg="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h2">Action Runs</CardTitle>
              <p className="card-category mb-4">
                Delivery history for webhook and email playbook actions
              </p>
              <Row>
                <Col md="3">
                  <FormGroup>
                    <Label for="filter-status">Status</Label>
                    <Input
                      id="filter-status"
                      name="status"
                      onChange={handleFilterChange}
                      type="select"
                      value={filters.status}
                    >
                      <option value="">All</option>
                      <option value="queued">queued</option>
                      <option value="sent">sent</option>
                      <option value="failed">failed</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label for="filter-finding">Finding ID</Label>
                    <Input
                      id="filter-finding"
                      name="finding"
                      onChange={handleFilterChange}
                      placeholder="e.g. 3"
                      value={filters.finding}
                    />
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <Button color="info" onClick={applyFilters}>
                    Apply
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {errorMessage ? <Alert color="danger">{errorMessage}</Alert> : null}
              {isLoading ? (
                <div className="text-center py-5">
                  <Spinner color="info" />
                </div>
              ) : (
                <Table className="tablesorter" responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Created</th>
                      <th>Playbook</th>
                      <th>Finding</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th>Error</th>
                      <th className="text-right">Retry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td>{formatDateTime(run.created_at)}</td>
                        <td>{run.playbook?.name}</td>
                        <td>
                          #{run.finding_id} {run.finding?.title}
                        </td>
                        <td>{run.payload_json?.action_type}</td>
                        <td>
                          <Badge color={statusColors[run.status] || "secondary"}>
                            {run.status}
                          </Badge>
                        </td>
                        <td>{formatDateTime(run.sent_at)}</td>
                        <td className="text-danger">{run.error || "—"}</td>
                        <td className="text-right">
                          <Button
                            className="btn-link"
                            color="info"
                            disabled={
                              retryingRunId === run.id || run.status === "sent"
                            }
                            onClick={() => retryRun(run.id)}
                          >
                            {retryingRunId === run.id ? "Retrying..." : "Retry"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {runs.length === 0 ? (
                      <tr>
                        <td className="text-center text-muted" colSpan="8">
                          No action runs found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ResponseActionRuns;
