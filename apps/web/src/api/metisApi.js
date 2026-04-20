/**
 * Metis API client – thin wrappers around fetch.
 * All calls require auth token from AuthContext.
 */

import { buildApiUrl } from 'lib/apiBase';

async function request(method, path, body, token) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(buildApiUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || 'API Error'), { status: res.status, data });
  return data;
}

const get  = (path, token)        => request('GET',    path, null, token);
const post = (path, body, token)  => request('POST',   path, body, token);
const put  = (path, body, token)  => request('PUT',    path, body, token);
const del  = (path, token)        => request('DELETE', path, null, token);

// ── Projects ──────────────────────────────────────────────────────────────────
export const getProjects       = (params, tk) => get(`/metis/projects?${new URLSearchParams(params)}`, tk);
export const createProject     = (body,   tk) => post('/metis/projects', body, tk);
export const getProject        = (id,     tk) => get(`/metis/projects/${id}`, tk);
export const updateProject     = (id, b,  tk) => put(`/metis/projects/${id}`, b, tk);
export const deleteProject     = (id,     tk) => del(`/metis/projects/${id}`, tk);
export const getProjectTimeline= (id, p,  tk) => get(`/metis/projects/${id}/timeline?${new URLSearchParams(p)}`, tk);

// ── Scope ─────────────────────────────────────────────────────────────────────
export const getScope          = (pid, tk)     => get(`/metis/projects/${pid}/scope`, tk);
export const updateScope       = (pid, b, tk)  => put(`/metis/projects/${pid}/scope`, b, tk);
export const initiateVerify    = (pid, b, tk)  => post(`/metis/projects/${pid}/scope/verify`, b, tk);
export const checkVerify       = (pid, vid, tk)=> post(`/metis/projects/${pid}/scope/verifications/${vid}/check`, {}, tk);
export const deleteVerify      = (pid, vid, tk)=> del(`/metis/projects/${pid}/scope/verifications/${vid}`, tk);

// ── Layers ────────────────────────────────────────────────────────────────────
export const getLayers         = (pid, params, tk) => get(`/metis/projects/${pid}/layers?${new URLSearchParams(params)}`, tk);

// ── Entities: Domains ─────────────────────────────────────────────────────────
export const getDomains        = (pid, params, tk) => get(`/metis/projects/${pid}/entities/domains?${new URLSearchParams(params)}`, tk);
export const getDomain         = (pid, did,   tk)  => get(`/metis/projects/${pid}/entities/domains/${did}`, tk);

// ── Entities: Hosts ───────────────────────────────────────────────────────────
export const getHosts          = (pid, params, tk) => get(`/metis/projects/${pid}/entities/hosts?${new URLSearchParams(params)}`, tk);
export const getHost           = (pid, hid,   tk)  => get(`/metis/projects/${pid}/entities/hosts/${hid}`, tk);

// ── Entities: URLs ────────────────────────────────────────────────────────────
export const getUrls           = (pid, params, tk) => get(`/metis/projects/${pid}/entities/urls?${new URLSearchParams(params)}`, tk);
export const getDedupeSuggestions = (pid, tk)      => post(`/metis/projects/${pid}/entities/dedupe-assistant`, {}, tk);

// ── Findings ──────────────────────────────────────────────────────────────────
export const getFindings       = (pid, params, tk) => get(`/metis/projects/${pid}/findings?${new URLSearchParams(params)}`, tk);
export const createFinding     = (pid, b, tk)      => post(`/metis/projects/${pid}/findings`, b, tk);
export const updateFinding     = (pid, fid, b, tk) => put(`/metis/projects/${pid}/findings/${fid}`, b, tk);

// ── Notes ─────────────────────────────────────────────────────────────────────
export const createNote        = (pid, b, tk) => post(`/metis/projects/${pid}/notes`, b, tk);

// ── Job Runs ──────────────────────────────────────────────────────────────────
export const getRuns           = (pid, params, tk) => get(`/metis/projects/${pid}/runs?${new URLSearchParams(params)}`, tk);
export const getRunDetail      = (pid, rid, tk)    => get(`/metis/projects/${pid}/runs/${rid}`, tk);
export const dispatchRun       = (pid, b, tk)      => post(`/metis/projects/${pid}/runs`, b, tk);
export const cancelRun         = (pid, rid, tk)    => post(`/metis/projects/${pid}/runs/${rid}/cancel`, {}, tk);
export const getToolsCatalog   = (tk)              => get('/metis/tools/catalog', tk);
export const getIntelHits      = (pid, params, tk) => get(`/metis/projects/${pid}/intel/hits?${new URLSearchParams(params)}`, tk);

// ── Workflow Engine ───────────────────────────────────────────────────────────
export const getWorkflows      = (params, tk)      => get(`/metis/workflows?${new URLSearchParams(params)}`, tk);
export const syncWorkflows     = (tk)              => post('/metis/workflows/sync-defaults', {}, tk);
export const getWorkflowRuns   = (pid, params, tk) => get(`/metis/projects/${pid}/workflow-runs?${new URLSearchParams(params)}`, tk);
export const createWorkflowRun = (pid, b, tk)      => post(`/metis/projects/${pid}/workflow-runs`, b, tk);
export const getWorkflowRun    = (pid, rid, tk)    => get(`/metis/projects/${pid}/workflow-runs/${rid}`, tk);

// ── Script Engine ─────────────────────────────────────────────────────────────
export const getScriptTemplates   = (params, tk)       => get(`/metis/scripts/templates?${new URLSearchParams(params)}`, tk);
export const createScriptTemplate = (b, tk)            => post('/metis/scripts/templates', b, tk);
export const updateScriptTemplate = (id, b, tk)        => put(`/metis/scripts/templates/${id}`, b, tk);
export const duplicateScriptTemplate = (id, tk)        => post(`/metis/scripts/templates/${id}/duplicate`, {}, tk);
export const getScriptRuns        = (pid, params, tk)  => get(`/metis/projects/${pid}/script-runs?${new URLSearchParams(params)}`, tk);
export const createScriptRun      = (pid, b, tk)       => post(`/metis/projects/${pid}/script-runs`, b, tk);
export const getScriptRun         = (pid, rid, tk)     => get(`/metis/projects/${pid}/script-runs/${rid}`, tk);
export const interpretScriptRun   = (pid, rid, tk)     => post(`/metis/projects/${pid}/script-runs/${rid}/interpret`, {}, tk);

// ── Emergency Overrides ───────────────────────────────────────────────────────
export const getOverrides      = (pid, params, tk) => get(`/metis/projects/${pid}/overrides?${new URLSearchParams(params)}`, tk);
export const getOverrideOptions= (pid, tk)         => get(`/metis/projects/${pid}/overrides/options`, tk);
export const createOverride    = (pid, b, tk)      => post(`/metis/projects/${pid}/overrides`, b, tk);
export const getOverride       = (pid, oid, tk)    => get(`/metis/projects/${pid}/overrides/${oid}`, tk);

// ── Reports ───────────────────────────────────────────────────────────────────
export const getReportJson     = (pid, params, tk) => get(`/metis/projects/${pid}/report/json?${new URLSearchParams(params || {})}`, tk);
export const getAiSummary      = (pid, tk) => post(`/metis/projects/${pid}/report/ai-summary`, {}, tk);
export const getEntitySummary  = (pid, b, tk) => post(`/metis/projects/${pid}/report/entity-summary`, b, tk);
export const getReportTemplates = (tk) => get('/metis/report-templates', tk);

// ── Audit Log ─────────────────────────────────────────────────────────────────
export const getProjectAuditLog= (pid, params, tk) => get(`/metis/projects/${pid}/audit-log?${new URLSearchParams(params)}`, tk);
export const getGlobalAuditLog = (params, tk)      => get(`/metis/audit-log?${new URLSearchParams(params)}`, tk);

// ── AI Providers ──────────────────────────────────────────────────────────────
export const getAiProviders    = (tk)      => get('/metis/ai-providers', tk);
export const createAiProvider  = (b, tk)   => post('/metis/ai-providers', b, tk);
export const updateAiProvider  = (id, b, tk) => put(`/metis/ai-providers/${id}`, b, tk);
export const deleteAiProvider  = (id, tk)  => del(`/metis/ai-providers/${id}`, tk);

// ── Admin Users ───────────────────────────────────────────────────────────────
export const getUsers          = (params, tk) => get(`/metis/users?${new URLSearchParams(params)}`, tk);
export const createUser        = (b, tk)      => post('/metis/users', b, tk);
export const updateUser        = (id, b, tk)  => put(`/metis/users/${id}`, b, tk);

// ── External Services / Modules ───────────────────────────────────────────────
export const getModules        = (tk)         => get('/metis/modules', tk);
export const updateModule      = (slug, b, tk)=> put(`/metis/modules/${slug}`, b, tk);
export const getExternalServices     = (tk)         => get('/metis/external-services', tk);
export const updateExternalService   = (slug, b, tk)=> put(`/metis/external-services/${slug}`, b, tk);
export const testExternalService     = (slug, tk)   => post(`/metis/external-services/${slug}/test`, {}, tk);
export const getExternalServicesDocs = (tk)         => get('/metis/external-services/docs', tk);
