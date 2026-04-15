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
  Form,
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

const emptyForm = {
  name: "",
  enabled: true,
  rules_json: "",
  actions_json: "[]",
};

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function ResponsePlaybooks() {
  const [playbooks, setPlaybooks] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [modalErrorMessage, setModalErrorMessage] = React.useState("");
  const [feedbackMessage, setFeedbackMessage] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingPlaybookId, setEditingPlaybookId] = React.useState(null);
  const [form, setForm] = React.useState(emptyForm);

  const loadPlaybooks = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const payload = await apiRequest("/api/response/playbooks");
      setPlaybooks(payload.data || []);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load playbooks.");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadPlaybooks();
  }, []);

  const resetModal = () => {
    setModalOpen(false);
    setEditingPlaybookId(null);
    setForm(emptyForm);
    setModalErrorMessage("");
  };

  const openCreateModal = () => {
    setFeedbackMessage("");
    setEditingPlaybookId(null);
    setForm(emptyForm);
    setModalErrorMessage("");
    setModalOpen(true);
  };

  const openEditModal = (playbook) => {
    setFeedbackMessage("");
    setEditingPlaybookId(playbook.id);
    setForm({
      name: playbook.name,
      enabled: Boolean(playbook.enabled),
      rules_json: playbook.rules_json ? formatJson(playbook.rules_json) : "",
      actions_json: formatJson(playbook.actions || []),
    });
    setModalErrorMessage("");
    setModalOpen(true);
  };

  const handleFormChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const submitForm = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setModalErrorMessage("");

    try {
      const payload = {
        name: form.name,
        enabled: form.enabled,
        rules_json: form.rules_json.trim() ? JSON.parse(form.rules_json) : null,
        actions: form.actions_json.trim()
          ? JSON.parse(form.actions_json)
          : [],
      };

      if (editingPlaybookId) {
        await apiRequest(`/api/response/playbooks/${editingPlaybookId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/api/response/playbooks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetModal();
      await loadPlaybooks();
    } catch (error) {
      if (error instanceof SyntaxError) {
        setModalErrorMessage("rules_json and actions_json must be valid JSON.");
      } else {
        setModalErrorMessage(error.message || "Unable to save playbook.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const deletePlaybook = async (playbookId) => {
    if (!window.confirm("Delete this playbook?")) {
      return;
    }

    try {
      await apiRequest(`/api/response/playbooks/${playbookId}`, {
        method: "DELETE",
      });
      await loadPlaybooks();
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete playbook.");
    }
  };

  const testPlaybook = async (playbookId) => {
    const findingId = window.prompt("Finding ID for playbook test");

    if (!findingId) {
      return;
    }

    try {
      const payload = await apiRequest(`/api/response/playbooks/${playbookId}/test`, {
        method: "POST",
        body: JSON.stringify({
          finding_id: Number(findingId),
        }),
      });

      setFeedbackMessage(
        `Queued ${(payload.data?.queued_runs || []).length} action run(s).`
      );
    } catch (error) {
      setErrorMessage(error.message || "Unable to test playbook.");
    }
  };

  return (
    <div className="content">
      <Row>
        <Col lg="12">
          <Card>
            <CardHeader className="d-flex justify-content-between align-items-center">
              <div>
                <CardTitle tag="h2">Response Playbooks</CardTitle>
                <p className="card-category mb-0">
                  SOAR-lite rules and actions
                </p>
              </div>
              <Button color="info" onClick={openCreateModal}>
                Add Playbook
              </Button>
            </CardHeader>
            <CardBody>
              {errorMessage ? <Alert color="danger">{errorMessage}</Alert> : null}
              {feedbackMessage ? (
                <Alert color="success">{feedbackMessage}</Alert>
              ) : null}
              {isLoading ? (
                <div className="text-center py-5">
                  <Spinner color="info" />
                </div>
              ) : (
                <Table className="tablesorter" responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Name</th>
                      <th>Enabled</th>
                      <th>Rules</th>
                      <th>Actions</th>
                      <th className="text-right">Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playbooks.map((playbook) => (
                      <tr key={playbook.id}>
                        <td>{playbook.name}</td>
                        <td>
                          <Badge color={playbook.enabled ? "success" : "secondary"}>
                            {playbook.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </td>
                        <td>
                          <pre className="mb-0 small">
                            {formatJson(playbook.rules_json || {})}
                          </pre>
                        </td>
                        <td>
                          <pre className="mb-0 small">
                            {formatJson(playbook.actions || [])}
                          </pre>
                        </td>
                        <td className="text-right">
                          <Button
                            className="btn-link"
                            color="success"
                            onClick={() => testPlaybook(playbook.id)}
                          >
                            Test
                          </Button>
                          <Button
                            className="btn-link"
                            color="info"
                            onClick={() => openEditModal(playbook)}
                          >
                            Edit
                          </Button>
                          <Button
                            className="btn-link"
                            color="danger"
                            onClick={() => deletePlaybook(playbook.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {playbooks.length === 0 ? (
                      <tr>
                        <td className="text-center text-muted" colSpan="5">
                          No playbooks configured.
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

      <Modal isOpen={modalOpen} size="lg" toggle={resetModal}>
        <ModalHeader toggle={resetModal}>
          {editingPlaybookId ? "Edit Playbook" : "Create Playbook"}
        </ModalHeader>
        <Form onSubmit={submitForm}>
          <ModalBody>
            {modalErrorMessage ? (
              <Alert color="danger">{modalErrorMessage}</Alert>
            ) : null}
            <FormGroup>
              <Label for="playbook-name">Name</Label>
              <Input
                id="playbook-name"
                name="name"
                onChange={handleFormChange}
                value={form.name}
              />
            </FormGroup>
            <FormGroup check className="mb-3">
              <Label check>
                <Input
                  checked={form.enabled}
                  name="enabled"
                  onChange={handleFormChange}
                  type="checkbox"
                />{" "}
                Enabled
              </Label>
            </FormGroup>
            <FormGroup>
              <Label for="playbook-rules">rules_json</Label>
              <Input
                id="playbook-rules"
                name="rules_json"
                onChange={handleFormChange}
                placeholder='{"severity":"critical","min_confidence":0.8}'
                rows="6"
                type="textarea"
                value={form.rules_json}
              />
            </FormGroup>
            <FormGroup>
              <Label for="playbook-actions">actions_json</Label>
              <Input
                id="playbook-actions"
                name="actions_json"
                onChange={handleFormChange}
                placeholder='[{"action_type":"webhook","config_json":{"url":"https://httpbin.org/post","secret":"change-me"}}]'
                rows="8"
                type="textarea"
                value={form.actions_json}
              />
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={resetModal} type="button">
              Cancel
            </Button>
            <Button color="info" disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </div>
  );
}

export default ResponsePlaybooks;
