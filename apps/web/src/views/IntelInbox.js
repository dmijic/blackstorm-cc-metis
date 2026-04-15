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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
} from "reactstrap";

import { apiRequest } from "lib/api.js";

const severityColors = {
  low: "success",
  med: "warning",
  high: "danger",
  critical: "primary",
};

const statusColors = {
  new: "info",
  in_review: "warning",
  confirmed: "success",
  false_positive: "secondary",
  escalated: "danger",
};

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function formatLabel(value) {
  return value.replaceAll("_", " ");
}

function renderJson(value) {
  return JSON.stringify(value, null, 2);
}

function IntelInbox() {
  const [findings, setFindings] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [selectedFindingId, setSelectedFindingId] = React.useState(null);
  const [selectedFinding, setSelectedFinding] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState("");
  const [triageNote, setTriageNote] = React.useState("");
  const [triageStatus, setTriageStatus] = React.useState("");

  const loadFindings = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const payload = await apiRequest("/api/intel/findings");
      setFindings(payload.data || []);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load findings.");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadFindings();
  }, []);

  const openFinding = async (findingId) => {
    setSelectedFindingId(findingId);
    setDetailLoading(true);
    setDetailError("");
    setTriageNote("");
    setSelectedFinding(null);

    try {
      const payload = await apiRequest(`/api/intel/findings/${findingId}`);
      setSelectedFinding(payload.data);
    } catch (error) {
      setDetailError(error.message || "Unable to load finding detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedFindingId(null);
    setSelectedFinding(null);
    setDetailError("");
    setTriageNote("");
    setTriageStatus("");
  };

  const submitTriage = async (status) => {
    if (!selectedFindingId) {
      return;
    }

    setTriageStatus(status);
    setDetailError("");

    try {
      const payload = await apiRequest(
        `/api/intel/findings/${selectedFindingId}/triage`,
        {
          method: "POST",
          body: JSON.stringify({
            status,
            note:
              triageNote.trim() ||
              `${formatLabel(status)} by web triage workflow.`,
          }),
        }
      );

      setSelectedFinding(payload.data);
      setTriageNote("");
      await loadFindings();
    } catch (error) {
      setDetailError(error.message || "Unable to update finding status.");
    } finally {
      setTriageStatus("");
    }
  };

  return (
    <div className="content">
      <Row>
        <Col lg="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h2">Exposure Inbox</CardTitle>
              <p className="card-category">
                Flare-lite findings from the current Intel API
              </p>
            </CardHeader>
            <CardBody>
              {errorMessage ? (
                <Alert color="danger">{errorMessage}</Alert>
              ) : null}
              {isLoading ? (
                <div className="text-center py-5">
                  <Spinner color="info" />
                </div>
              ) : (
                <Table className="tablesorter" responsive hover>
                  <thead className="text-primary">
                    <tr>
                      <th>Observed</th>
                      <th>Severity</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th className="text-center">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((finding) => (
                      <tr
                        key={finding.id}
                        onClick={() => openFinding(finding.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{formatDateTime(finding.observed_at)}</td>
                        <td>
                          <Badge color={severityColors[finding.severity] || "info"}>
                            {finding.severity}
                          </Badge>
                        </td>
                        <td>{finding.type}</td>
                        <td>{finding.title}</td>
                        <td>
                          <Badge color={statusColors[finding.status] || "secondary"}>
                            {formatLabel(finding.status)}
                          </Badge>
                        </td>
                        <td className="text-center">
                          {Number(finding.confidence).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {findings.length === 0 ? (
                      <tr>
                        <td className="text-center text-muted" colSpan="6">
                          No findings available.
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

      <Modal
        isOpen={Boolean(selectedFindingId)}
        size="lg"
        toggle={closeModal}
      >
        <ModalHeader toggle={closeModal}>Finding Detail</ModalHeader>
        <ModalBody>
          {detailError ? <Alert color="danger">{detailError}</Alert> : null}
          {detailLoading ? (
            <div className="text-center py-5">
              <Spinner color="info" />
            </div>
          ) : selectedFinding ? (
            <>
              <div className="mb-4">
                <h3 className="mb-2">{selectedFinding.title}</h3>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <Badge color={severityColors[selectedFinding.severity] || "info"}>
                    {selectedFinding.severity}
                  </Badge>
                  <Badge color={statusColors[selectedFinding.status] || "secondary"}>
                    {formatLabel(selectedFinding.status)}
                  </Badge>
                  <Badge color="default">{selectedFinding.type}</Badge>
                </div>
                <p className="mb-2">{selectedFinding.summary}</p>
                <p className="text-muted mb-0">
                  Observed: {formatDateTime(selectedFinding.observed_at)} | Confidence:{" "}
                  {Number(selectedFinding.confidence).toFixed(2)}
                </p>
              </div>

              <Row>
                <Col md="6">
                  <Card className="card-plain">
                    <CardHeader>
                      <CardTitle tag="h4">Evidence</CardTitle>
                    </CardHeader>
                    <CardBody>
                      {(selectedFinding.evidences || []).map((evidence) => (
                        <div className="mb-3" key={evidence.id}>
                          <Badge color="info">{evidence.kind}</Badge>
                          <pre className="mt-2 mb-0 small">
                            {renderJson(evidence.data_json)}
                          </pre>
                        </div>
                      ))}
                      {(selectedFinding.evidences || []).length === 0 ? (
                        <p className="text-muted mb-0">No evidence attached.</p>
                      ) : null}
                    </CardBody>
                  </Card>
                </Col>
                <Col md="6">
                  <Card className="card-plain">
                    <CardHeader>
                      <CardTitle tag="h4">Matches</CardTitle>
                    </CardHeader>
                    <CardBody>
                      {(selectedFinding.matches || []).map((match) => (
                        <div className="mb-3" key={match.id}>
                          <div className="d-flex justify-content-between align-items-center">
                            <strong>{match.subject?.name}</strong>
                            <Badge color="success">
                              {Number(match.confidence).toFixed(2)}
                            </Badge>
                          </div>
                          <p className="small text-muted mb-1">
                            {match.subject?.type}
                          </p>
                          <pre className="mb-0 small">
                            {renderJson(match.why_json)}
                          </pre>
                        </div>
                      ))}
                      {(selectedFinding.matches || []).length === 0 ? (
                        <p className="text-muted mb-0">No subject matches.</p>
                      ) : null}
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              <Card className="card-plain mt-3">
                <CardHeader>
                  <CardTitle tag="h4">Triage Notes</CardTitle>
                </CardHeader>
                <CardBody>
                  {(selectedFinding.notes || []).map((note) => (
                    <div className="mb-3" key={note.id}>
                      <div className="small text-muted">
                        {note.actor?.email || "Unknown actor"} |{" "}
                        {formatDateTime(note.created_at)}
                      </div>
                      <div>{note.note}</div>
                    </div>
                  ))}
                  {(selectedFinding.notes || []).length === 0 ? (
                    <p className="text-muted mb-0">No notes yet.</p>
                  ) : null}
                </CardBody>
              </Card>

              <Card className="card-plain mt-3">
                <CardHeader>
                  <CardTitle tag="h4">Actions</CardTitle>
                </CardHeader>
                <CardBody>
                  {(selectedFinding.action_runs || []).map((run) => (
                    <div className="mb-3" key={run.id}>
                      <div className="d-flex justify-content-between align-items-center">
                        <strong>{run.playbook?.name}</strong>
                        <Badge color={statusColors[run.status] || "secondary"}>
                          {run.status}
                        </Badge>
                      </div>
                      <div className="small text-muted">
                        {run.payload_json?.action_type} | Created:{" "}
                        {formatDateTime(run.created_at)}
                        {run.sent_at ? ` | Sent: ${formatDateTime(run.sent_at)}` : ""}
                      </div>
                      {run.error ? (
                        <div className="text-danger small mt-1">{run.error}</div>
                      ) : null}
                    </div>
                  ))}
                  {(selectedFinding.action_runs || []).length === 0 ? (
                    <p className="text-muted mb-0">
                      No response actions have been queued for this finding.
                    </p>
                  ) : null}
                </CardBody>
              </Card>

              <FormGroup className="mt-4">
                <Label for="triage-note">Triage Note</Label>
                <Input
                  id="triage-note"
                  onChange={(event) => setTriageNote(event.target.value)}
                  placeholder="Add analyst context for the status update"
                  rows="4"
                  type="textarea"
                  value={triageNote}
                />
              </FormGroup>
            </>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button
            color="success"
            disabled={detailLoading || Boolean(triageStatus)}
            onClick={() => submitTriage("confirmed")}
          >
            {triageStatus === "confirmed" ? "Saving..." : "Confirm"}
          </Button>
          <Button
            color="secondary"
            disabled={detailLoading || Boolean(triageStatus)}
            onClick={() => submitTriage("false_positive")}
          >
            {triageStatus === "false_positive" ? "Saving..." : "False positive"}
          </Button>
          <Button
            color="danger"
            disabled={detailLoading || Boolean(triageStatus)}
            onClick={() => submitTriage("escalated")}
          >
            {triageStatus === "escalated" ? "Saving..." : "Escalate"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default IntelInbox;
