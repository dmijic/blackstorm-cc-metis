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

import GuidedHelpTour from "components/GuidedHelpTour";
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

  const helpSteps = React.useMemo(
    () => [
      {
        selector: ".action-runs-help-header",
        title: "Pregled action runova",
        body: "Ovdje vidiš sve isporuke koje su playbookovi pokušali poslati: webhook, Teams, Slack, Jira ili e-mail akcije.",
        hint: "Kreni od statusa i vremena kreiranja da brzo vidiš što je zapelo.",
      },
      {
        selector: ".action-runs-help-filters",
        title: "Filtriranje liste",
        body: "Filtriraj po statusu ili konkretnom finding ID-u ako želiš brzo izolirati samo problematične isporuke.",
        hint: "Najkorisniji prvi filter je `failed` jer odmah pokaže što treba ponoviti ili ispraviti.",
      },
      {
        selector: ".action-runs-help-table",
        title: "Tablica rezultata",
        body: "Svaki red prikazuje playbook, finding, tip akcije, vrijeme slanja i eventualnu grešku iz prethodnog pokušaja.",
        hint: "Ako je akcija pala, usporedi `Action`, `Status` i `Error` stupce prije ponovnog slanja.",
      },
      {
        selector: ".action-runs-help-retry",
        title: "Retry sigurno",
        body: "Retry šalje istu akciju još jednom, ali samo za postojeći run. Ne mijenja playbook i ne pokreće ništa izvan spremljenog payload-a.",
        hint: "Koristi retry tek nakon što provjeriš da su vanjski webhook ili konektor stvarno ispravljeni.",
      },
    ],
    []
  );

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
        `/response/action-runs${query ? `?${query}` : ""}`
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
      await apiRequest(`/response/action-runs/${runId}/retry`, {
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
            <CardHeader className="action-runs-help-header">
              <div className="d-flex justify-content-between align-items-start flex-wrap" style={{ gap: 12 }}>
                <div>
                  <CardTitle tag="h2">Action Runs</CardTitle>
                  <p className="card-category mb-4">
                    Delivery history for webhook and email playbook actions
                  </p>
                </div>
                <GuidedHelpTour
                  title="Action Runs Help"
                  buttonLabel="Help"
                  autoOpenOnce={false}
                  steps={helpSteps}
                />
              </div>
              <Row className="action-runs-help-filters">
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
                  <thead className="text-primary action-runs-help-table">
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
                            className="btn-link action-runs-help-retry"
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
