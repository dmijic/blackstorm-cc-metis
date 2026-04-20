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
  type: "domain",
  enabled: true,
  config_json: "",
};

function IntelSubjects() {
  const [subjects, setSubjects] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [modalErrorMessage, setModalErrorMessage] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingSubjectId, setEditingSubjectId] = React.useState(null);
  const [form, setForm] = React.useState(emptyForm);

  const loadSubjects = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const payload = await apiRequest("/intel/subjects");
      setSubjects(payload.data || []);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load subjects.");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadSubjects();
  }, []);

  const resetModal = () => {
    setModalOpen(false);
    setEditingSubjectId(null);
    setForm(emptyForm);
    setModalErrorMessage("");
  };

  const openCreateModal = () => {
    setModalErrorMessage("");
    setEditingSubjectId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (subject) => {
    setModalErrorMessage("");
    setEditingSubjectId(subject.id);
    setForm({
      name: subject.name,
      type: subject.type,
      enabled: Boolean(subject.enabled),
      config_json: subject.config_json
        ? JSON.stringify(subject.config_json, null, 2)
        : "",
    });
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
        type: form.type,
        enabled: form.enabled,
        config_json: form.config_json.trim()
          ? JSON.parse(form.config_json)
          : null,
      };

      if (editingSubjectId) {
        await apiRequest(`/intel/subjects/${editingSubjectId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/intel/subjects", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetModal();
      await loadSubjects();
    } catch (error) {
      if (error instanceof SyntaxError) {
        setModalErrorMessage("config_json must be valid JSON.");
      } else {
        setModalErrorMessage(error.message || "Unable to save subject.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const removeSubject = async (subjectId) => {
    if (!window.confirm("Delete this subject?")) {
      return;
    }

    try {
      await apiRequest(`/intel/subjects/${subjectId}`, {
        method: "DELETE",
      });
      await loadSubjects();
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete subject.");
    }
  };

  return (
    <div className="content">
      <Row>
        <Col lg="12">
          <Card>
            <CardHeader className="d-flex justify-content-between align-items-center">
              <div>
                <CardTitle tag="h2">Subjects</CardTitle>
                <p className="card-category mb-0">
                  Domains, email domains and keywords for matching
                </p>
              </div>
              <Button color="info" onClick={openCreateModal}>
                Add Subject
              </Button>
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
                <Table className="tablesorter" responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Enabled</th>
                      <th>Config</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((subject) => (
                      <tr key={subject.id}>
                        <td>{subject.name}</td>
                        <td>{subject.type}</td>
                        <td>
                          <Badge color={subject.enabled ? "success" : "secondary"}>
                            {subject.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </td>
                        <td>
                          <code>
                            {subject.config_json
                              ? JSON.stringify(subject.config_json)
                              : "{}"}
                          </code>
                        </td>
                        <td className="text-right">
                          <Button
                            className="btn-link"
                            color="info"
                            onClick={() => openEditModal(subject)}
                          >
                            Edit
                          </Button>
                          <Button
                            className="btn-link"
                            color="danger"
                            onClick={() => removeSubject(subject.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {subjects.length === 0 ? (
                      <tr>
                        <td className="text-center text-muted" colSpan="5">
                          No subjects configured.
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

      <Modal isOpen={modalOpen} toggle={resetModal}>
        <ModalHeader toggle={resetModal}>
          {editingSubjectId ? "Edit Subject" : "Create Subject"}
        </ModalHeader>
        <Form onSubmit={submitForm}>
          <ModalBody>
            {modalErrorMessage ? (
              <Alert color="danger">{modalErrorMessage}</Alert>
            ) : null}
            <FormGroup>
              <Label for="subject-name">Name</Label>
              <Input
                id="subject-name"
                name="name"
                onChange={handleFormChange}
                value={form.name}
              />
            </FormGroup>
            <FormGroup>
              <Label for="subject-type">Type</Label>
              <Input
                id="subject-type"
                name="type"
                onChange={handleFormChange}
                type="select"
                value={form.type}
              >
                <option value="domain">domain</option>
                <option value="email_domain">email_domain</option>
                <option value="keyword">keyword</option>
              </Input>
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
              <Label for="subject-config">config_json</Label>
              <Input
                id="subject-config"
                name="config_json"
                onChange={handleFormChange}
                placeholder='{"category":"brand"}'
                rows="5"
                type="textarea"
                value={form.config_json}
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

export default IntelSubjects;
