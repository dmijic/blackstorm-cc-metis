import React from "react";

import Dashboard          from "views/Dashboard.js";
import IntelInbox         from "views/IntelInbox.js";
import IntelSubjects      from "views/IntelSubjects.js";
import ResponseActionRuns from "views/ResponseActionRuns.js";
import ResponsePlaybooks  from "views/ResponsePlaybooks.js";
import AdminUsers         from "views/AdminUsers.js";
import AuditLog           from "views/AuditLog.js";

// Metis views
import MetisProjects    from "views/Metis/MetisProjects.js";
import MetisOverview    from "views/Metis/MetisOverview.js";
import MetisScope       from "views/Metis/MetisScope.js";
import MetisWizard      from "views/Metis/MetisWizard.js";
import MetisEntities    from "views/Metis/MetisEntities.js";
import MetisRuns        from "views/Metis/MetisRuns.js";
import MetisFindings    from "views/Metis/MetisFindings.js";
import MetisReport      from "views/Metis/MetisReport.js";
import MetisModules     from "views/Metis/MetisModules.js";
import MetisAiProviders from "views/Metis/MetisAiProviders.js";
import MetisExternalServices from "views/Metis/MetisExternalServices.js";

const routes = [
  // Core
  {
    path: "/dashboard",
    route: "dashboard",
    name: "Dashboard",
    icon: "tim-icons icon-chart-pie-36",
    component: <Dashboard />,
    group: "core",
  },

  // Metis Command Center
  {
    path: "/metis/projects",
    route: "metis/projects",
    name: "Projects",
    icon: "tim-icons icon-book-bookmark",
    component: <MetisProjects />,
    group: "metis",
    groupLabel: "Metis · Recon & ASM",
  },
  // Project sub-pages (hidden from sidebar, routed via Admin layout)
  { path: "/metis/projects/:id/overview", route: "metis/projects/:id/overview", name: "Overview",  component: <MetisOverview />,  hidden: true },
  { path: "/metis/projects/:id/scope",    route: "metis/projects/:id/scope",    name: "Scope",     component: <MetisScope />,     hidden: true },
  { path: "/metis/projects/:id/wizard",   route: "metis/projects/:id/wizard",   name: "Wizard",    component: <MetisWizard />,    hidden: true },
  { path: "/metis/projects/:id/entities", route: "metis/projects/:id/entities", name: "Entities",  component: <MetisEntities />,  hidden: true },
  { path: "/metis/projects/:id/entities/domains", route: "metis/projects/:id/entities/domains", name: "Domains", component: <MetisEntities />, hidden: true },
  { path: "/metis/projects/:id/entities/hosts",   route: "metis/projects/:id/entities/hosts",   name: "Hosts",   component: <MetisEntities />, hidden: true },
  { path: "/metis/projects/:id/entities/urls",    route: "metis/projects/:id/entities/urls",    name: "URLs",    component: <MetisEntities />, hidden: true },
  { path: "/metis/projects/:id/runs",     route: "metis/projects/:id/runs",     name: "Runs",      component: <MetisRuns />,      hidden: true },
  { path: "/metis/projects/:id/modules",  route: "metis/projects/:id/modules",  name: "Modules",   component: <MetisModules />,   hidden: true },
  { path: "/metis/projects/:id/findings", route: "metis/projects/:id/findings", name: "Findings",  component: <MetisFindings />,  hidden: true },
  { path: "/metis/projects/:id/report",   route: "metis/projects/:id/report",   name: "Report",    component: <MetisReport />,    hidden: true },

  // Intel (existing)
  {
    path: "/intel/inbox",
    route: "intel/inbox",
    name: "Inbox",
    icon: "tim-icons icon-email-85",
    component: <IntelInbox />,
    group: "intel",
    groupLabel: "Intel",
  },
  {
    path: "/intel/subjects",
    route: "intel/subjects",
    name: "Subjects",
    icon: "tim-icons icon-vector",
    component: <IntelSubjects />,
    group: "intel",
  },

  // Response (existing)
  {
    path: "/response/playbooks",
    route: "response/playbooks",
    name: "Playbooks",
    icon: "tim-icons icon-settings",
    component: <ResponsePlaybooks />,
    group: "response",
    groupLabel: "Response",
  },
  {
    path: "/response/action-runs",
    route: "response/action-runs",
    name: "Action Runs",
    icon: "tim-icons icon-refresh-02",
    component: <ResponseActionRuns />,
    group: "response",
  },

  // Settings
  {
    path: "/settings/modules",
    route: "settings/modules",
    name: "External Services",
    icon: "tim-icons icon-link-72",
    component: <MetisExternalServices />,
    group: "settings",
  },
  {
    path: "/settings/ai-providers",
    route: "settings/ai-providers",
    name: "AI Providers",
    icon: "tim-icons icon-spaceship",
    component: <MetisAiProviders />,
    group: "settings",
    groupLabel: "Settings",
  },
  {
    path: "/settings/users",
    route: "settings/users",
    name: "Users",
    icon: "tim-icons icon-single-02",
    component: <AdminUsers />,
    group: "settings",
  },
  {
    path: "/settings/audit-log",
    route: "settings/audit-log",
    name: "Audit Log",
    icon: "tim-icons icon-notes",
    component: <AuditLog />,
    group: "settings",
  },
];

export default routes;
