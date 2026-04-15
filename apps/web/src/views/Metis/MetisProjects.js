import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { getProjects, createProject, deleteProject } from 'api/metisApi';
import {
  Row, Col, Card, CardBody, CardHeader, CardTitle,
  Button, Badge, Input, Modal, ModalHeader, ModalBody, ModalFooter,
  Form, FormGroup, Label, Spinner,
} from 'reactstrap';

const STATUS_COLORS = { active: '#3fb950', archived: '#888', completed: '#58a6ff' };

function ProjectCard({ project, onOpen, onDelete }) {
  const stats = project;
  return (
    <Card
      className="metis-project-card"
      style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: 8, cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#58a6ff'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
    >
      <CardHeader
        onClick={() => onOpen(project.id)}
        style={{ background: 'transparent', borderBottom: '1px solid #21262d', padding: '14px 18px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardTitle tag="h6" style={{ margin: 0, color: '#e6edf3', fontSize: 14 }}>
            {project.name}
          </CardTitle>
          <Badge style={{
            background: STATUS_COLORS[project.status] || '#555',
            color: project.status === 'active' ? '#000' : '#fff', fontSize: 10,
          }}>
            {project.status}
          </Badge>
        </div>
        {project.client && (
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{project.client}</div>
        )}
      </CardHeader>
      <CardBody style={{ padding: '12px 18px' }} onClick={() => onOpen(project.id)}>
        {project.description && (
          <p style={{ fontSize: 12, color: '#8b949e', marginBottom: 12, lineHeight: 1.5 }}>
            {project.description.slice(0, 120)}{project.description.length > 120 ? '…' : ''}
          </p>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            ['fas fa-globe', project.domain_entities_count || 0, 'domains', '#4fc3f7'],
            ['fas fa-server', project.host_entities_count || 0, 'hosts', '#81c784'],
            ['fas fa-bug', project.finding_entities_count || 0, 'findings', '#ef5350'],
            ['fas fa-play-circle', project.job_runs_count || 0, 'runs', '#ffb74d'],
          ].map(([icon, count, label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className={icon} style={{ color, fontSize: 11 }} />
              <span style={{ fontSize: 12, color: '#c9d1d9' }}>{count}</span>
              <span style={{ fontSize: 11, color: '#555' }}>{label}</span>
            </div>
          ))}
        </div>
        {project.tags?.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {project.tags.map(tag => (
              <span key={tag} style={{
                background: '#21262d', color: '#8b949e', fontSize: 10,
                padding: '2px 8px', borderRadius: 12,
              }}>{tag}</span>
            ))}
          </div>
        )}
      </CardBody>
      <div style={{ padding: '8px 18px', borderTop: '1px solid #21262d', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(project); }}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 11 }}
        >
          <i className="fas fa-trash-alt" />
        </button>
      </div>
    </Card>
  );
}

export default function MetisProjects() {
  const { token } = useAuth();
  const navigate  = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [creating, setCreating] = useState(false);
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState({ name: '', client: '', description: '', tags: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProjects({ search }, token);
      setProjects(res.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [search, token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setModal(true);
    }
  }, [searchParams]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const res  = await createProject({ ...form, tags }, token);
      setModal(false);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('create');
      setSearchParams(nextParams, { replace: true });
      setForm({ name: '', client: '', description: '', tags: '' });
      navigate(`/metis/projects/${res.data.id}/overview`);
    } catch (err) {
      alert('Failed to create project: ' + err.message);
    }
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.id, token);
      setDeleteTarget(null);
      load();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  return (
    <div className="content">
      {/* Header */}
      <Row style={{ marginBottom: 24 }}>
        <Col>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ color: '#e6edf3', margin: 0 }}>Projects</h3>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
                {projects.length} project{projects.length !== 1 ? 's' : ''} · Metis Recon &amp; ASM
              </p>
            </div>
            <Button color="info" onClick={() => setModal(true)} style={{ fontSize: 12 }}>
              <i className="fas fa-plus" style={{ marginRight: 6 }} /> New Project
            </Button>
          </div>
        </Col>
      </Row>

      {/* Search */}
      <Row style={{ marginBottom: 20 }}>
        <Col md={4}>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }}
          />
        </Col>
      </Row>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spinner color="info" />
        </div>
      ) : projects.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 80, color: '#555',
          border: '1px dashed #30363d', borderRadius: 8,
        }}>
          <i className="fas fa-folder-open" style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
          <p>No projects yet. Create your first one.</p>
          <Button color="info" onClick={() => setModal(true)}>Create Project</Button>
        </div>
      ) : (
        <Row>
          {projects.map(p => (
            <Col key={p.id} md={6} lg={4} style={{ marginBottom: 20 }}>
              <ProjectCard
                project={p}
                onOpen={id => navigate(`/metis/projects/${id}/overview`)}
                onDelete={setDeleteTarget}
              />
            </Col>
          ))}
        </Row>
      )}

      {/* Create Modal */}
      <Modal isOpen={modal} toggle={() => setModal(false)} className="modal-dark">
        <Form onSubmit={handleCreate}>
          <ModalHeader toggle={() => setModal(false)} style={{ background: '#161b22', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
            New Project
          </ModalHeader>
          <ModalBody style={{ background: '#161b22' }}>
            {[
              ['name', 'Project Name *', 'e.g. Acme Corp ASM', true],
              ['client', 'Client', 'e.g. Acme Corporation', false],
              ['description', 'Description', 'Brief description…', false],
              ['tags', 'Tags (comma-separated)', 'e.g. pentest, asm, q2-2026', false],
            ].map(([field, label, placeholder, required]) => (
              <FormGroup key={field}>
                <Label style={{ color: '#8b949e', fontSize: 12 }}>{label}</Label>
                {field === 'description' ? (
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder={placeholder}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }}
                  />
                ) : (
                  <Input
                    placeholder={placeholder}
                    required={required}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 13 }}
                  />
                )}
              </FormGroup>
            ))}
          </ModalBody>
          <ModalFooter style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
            <Button color="secondary" outline onClick={() => setModal(false)}>Cancel</Button>
            <Button color="info" type="submit" disabled={creating}>
              {creating ? <Spinner size="sm" /> : 'Create Project'}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} toggle={() => setDeleteTarget(null)} className="modal-dark" size="sm">
        <ModalHeader toggle={() => setDeleteTarget(null)} style={{ background: '#161b22', color: '#e6edf3', borderBottom: '1px solid #30363d' }}>
          Delete Project
        </ModalHeader>
        <ModalBody style={{ background: '#161b22', color: '#c9d1d9', fontSize: 13 }}>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will remove all entities, runs, and findings.
        </ModalBody>
        <ModalFooter style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
          <Button color="secondary" outline onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
