"use client";

import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  contacts: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  clients: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m17 11 2 2 4-4" />
    </svg>
  ),
  dossiers: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  taux: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  ),
  emails: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  ),
  campaigns: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  history: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  ),
  domains: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  cms: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  ),
  seo: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M8 11h6M11 8v6" />
    </svg>
  ),
  agents: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4M8 4h8M9 14h.01M15 14h.01" />
    </svg>
  ),
  settings: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  profil: (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

const navigation = [
  { id: "dashboard", label: "Vue d'ensemble", group: "Pilotage" },
  { id: "contacts", label: "Prospects & clients", group: "Pilotage" },
  { id: "clients", label: "Clients", group: "Pilotage" },
  { id: "dossiers", label: "Dossiers", group: "Pilotage" },
  { id: "taux", label: "Taux & barèmes", group: "Pilotage" },
  { id: "emails", label: "Modèles d'emails", group: "Pilotage" },
  { id: "documents", label: "Documents modèles", group: "Pilotage" },
  { id: "campaigns", label: "Campagnes", group: "Pilotage" },
  { id: "history", label: "Historique emails", group: "Pilotage" },
  { id: "cms", label: "Contenu du site (CMS)", group: "Site web" },
  { id: "seo", label: "SEO", group: "Site web" },
  { id: "domains", label: "Domaines", group: "Site web" },
  { id: "agents", label: "Agents IA", group: "Intelligence" },
  { id: "settings", label: "Configuration", group: "Intelligence" },
  { id: "profil", label: "Mon profil", group: "Compte" },
];

interface SidebarProps {
  currentView: string;
  onViewChange: (viewId: string) => void;
  open?: boolean;
}

export function Sidebar({ currentView, onViewChange, open }: SidebarProps) {
  const groups = Array.from(new Set(navigation.map((n) => n.group)));

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="sb-logo">
        Kredi<span>x</span>
      </div>

      {groups.map((group) => (
        <div key={group} className="sb-group">
          <div className="sb-group-label">{group}</div>
          {navigation
            .filter((n) => n.group === group)
            .map((nav) => (
              <button
                key={nav.id}
                className={`sb-item ${currentView === nav.id ? "active" : ""}`}
                onClick={() => onViewChange(nav.id)}
              >
                {ICONS[nav.id]}
                <span>{nav.label}</span>
              </button>
            ))}
        </div>
      ))}

      <div className="sb-foot">
        <div className="sb-model">
          <span className="sb-dot" />
          <div>
            <b>Qwen3-8B</b>
            Modèle local · actif
          </div>
        </div>
      </div>
    </aside>
  );
}