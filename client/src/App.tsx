import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadCommandCenterPage } from "./pages/LeadCommandCenterPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { LeadsPage } from "./pages/LeadsPage";
import { ImportLeadsPage } from "./pages/ImportLeadsPage";
import { LeadDetailPage } from "./pages/LeadDetailPage";
import { OutreachCampaignsPage } from "./pages/OutreachCampaignsPage";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ApiSetupPage } from "./pages/ApiSetupPage";
import { SeoDashboardPage } from "./pages/SeoDashboardPage";
import { SeoWorkspacePage } from "./pages/seo/SeoWorkspacePage";
import { SeoClientsListPage } from "./pages/seo/SeoClientsListPage";
import { SeoClientDetailPage } from "./pages/seo/SeoClientDetailPage";
import { SeoBusinessDetailPage } from "./pages/seo/SeoBusinessDetailPage";
import { SeoTeamPage } from "./pages/seo/SeoTeamPage";
import { SeoChecklistTemplatesPage } from "./pages/seo/SeoChecklistTemplatesPage";
import { AuditToolsPage } from "./pages/AuditToolsPage";
import { AuditWorkspacePage } from "./pages/AuditWorkspacePage";
import { UnifiedWebsiteAuditorPage } from "./pages/UnifiedWebsiteAuditorPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { AutomationPage } from "./pages/AutomationPage";
import { EmailDashboardPage } from "./pages/EmailDashboardPage";
import { EmailCampaignsPage } from "./pages/EmailCampaignsPage";
import { EmailSequencesPage } from "./pages/EmailSequencesPage";
import { EmailSendersPage } from "./pages/EmailSendersPage";
import { EmailSuppressionPage } from "./pages/EmailSuppressionPage";
import { AuthProvider, useAuth, type SaaSPermission } from "./contexts/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { ClientPitchPage } from "./pages/ClientPitchPage";
import { ClientPortalPage } from "./pages/ClientPortalPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { PlatformAdminPage } from "./pages/PlatformAdminPage";


function PermissionRoute({ permission, children }: { permission: SaaSPermission; children: JSX.Element }) {
  const { can } = useAuth();
  return can(permission) ? children : <Navigate to="/dashboard" replace />;
}

function ProtectedLayout() {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-8 w-8 animate-spin text-[#5e6ad2]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider">Loading SMBify OS...</span>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <AppLayout />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="/pitch/:leadId" element={<ClientPitchPage />} />
          <Route path="/portal/:clientId" element={<ClientPortalPage />} />
          <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/command-center" replace />} />
        <Route path="command-center" element={<LeadCommandCenterPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="seo/dashboard" element={<SeoWorkspacePage />} />
        <Route path="seo/clients" element={<SeoClientsListPage />} />
        <Route path="seo/clients/:clientId" element={<SeoClientDetailPage />} />
        <Route path="seo/clients/:clientId/businesses/:businessId" element={<SeoBusinessDetailPage />} />
        <Route path="seo/team" element={<SeoTeamPage />} />
        <Route path="seo/checklist-templates" element={<SeoChecklistTemplatesPage />} />
        <Route path="seo/businesses" element={<Navigate to="/seo/clients" replace />} />
        <Route path="seo/finance" element={<SeoDashboardPage initialTab="finance" />} />
        <Route path="seo/email-ops" element={<SeoDashboardPage initialTab="email" />} />
        <Route path="seo/*" element={<Navigate to="/seo/dashboard" replace />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="lead-engine" element={<ImportLeadsPage />} />
        <Route path="leads/import" element={<Navigate to="/lead-engine" replace />} />
        <Route path="leads/:leadId" element={<LeadDetailPage />} />
        <Route path="leads/scoring" element={<Navigate to="/leads" replace />} />
        <Route path="outreach/campaigns" element={<Navigate to="/email/campaigns" replace />} />
        <Route path="outreach/campaigns/:campaignId" element={<Navigate to="/email/campaigns" replace />} />
        <Route path="outreach/manager" element={<Navigate to="/email/campaigns" replace />} />
        <Route path="outreach/*" element={<Navigate to="/email/campaigns" replace />} />
        <Route path="automation" element={<PermissionRoute permission="automation.manage"><AutomationPage /></PermissionRoute>} />
        {/* ── Email Marketing ── */}
        <Route path="email/dashboard" element={<EmailDashboardPage />} />
        <Route path="email/campaigns" element={<EmailCampaignsPage />} />
        <Route path="email/sequences" element={<EmailSequencesPage />} />
        <Route path="email/senders" element={<EmailSendersPage />} />
        <Route path="email/suppression" element={<EmailSuppressionPage />} />
        <Route path="email/*" element={<Navigate to="/email/dashboard" replace />} />
        {/* ── Audit Tools ── */}
        <Route path="audit-tools" element={<Navigate to="/audit-tools/hub" replace />} />
        <Route path="audit-tools/hub" element={<AuditToolsPage />} />
        <Route path="audit-tools/gmb" element={<AuditWorkspacePage />} />
        <Route path="audit-tools/website" element={<UnifiedWebsiteAuditorPage />} />
        <Route path="audit-tools/website-advanced" element={<Navigate to="/audit-tools/website" replace />} />
        <Route path="audit-tools/eeat" element={<Navigate to="/audit-tools/website" replace />} />
        {/* Redirect old sub-audits to consolidate into Master platforms */}
        <Route path="audit-tools/local-presence" element={<Navigate to="/audit-tools/gmb?tab=ai-local" replace />} />
        <Route path="audit-tools/website-quality" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=content" replace />} />
        <Route path="audit-tools/trust-conversion" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=trust" replace />} />
        <Route path="audit-tools/competitor" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=competitor" replace />} />
        <Route path="audit-tools/accessibility" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=accessibility" replace />} />
        <Route path="audit-tools/content" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=content" replace />} />
        <Route path="audit-tools/design" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=design" replace />} />
        <Route path="audit-tools/local-seo" element={<Navigate to="/audit-tools/gmb?tab=ai-local" replace />} />
        <Route path="audit-tools/reputation" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=trust" replace />} />
        <Route path="audit-tools/customer-conversion" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=trust" replace />} />
        <Route path="audit-tools/competitor-organic" element={<Navigate to="/audit-tools/website?tab=ai-specialist&type=competitor" replace />} />
        <Route path="audits/website" element={<Navigate to="/audit-tools/website" replace />} />
        <Route path="audits/gmb" element={<Navigate to="/audit-tools/gmb" replace />} />
        <Route path="audits/*" element={<Navigate to="/audit-tools/hub" replace />} />
        <Route path="crm/*" element={<Navigate to="/leads" replace />} />
        <Route path="clients/all" element={<Navigate to="/leads" replace />} />
        <Route path="clients/*" element={<Navigate to="/leads" replace />} />
        <Route path="settings/users" element={<PermissionRoute permission="users.manage"><UserManagementPage /></PermissionRoute>} />
        <Route path="platform" element={<PermissionRoute permission="platform.manage"><PlatformAdminPage /></PermissionRoute>} />
        <Route path="settings/profile" element={<PermissionRoute permission="settings.manage"><SettingsPage /></PermissionRoute>} />
        <Route path="settings/api" element={<PermissionRoute permission="integrations.manage"><ApiSetupPage /></PermissionRoute>} />
        <Route path="settings/*" element={<Navigate to="/settings/profile" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
