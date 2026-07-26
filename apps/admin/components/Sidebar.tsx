"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  LayoutDashboard, Users, UserCheck, FolderOpen, Percent,
  Mail, Megaphone, History, Globe, LayoutTemplate,
  Star, LayoutGrid, FileText, Search, Bot, Settings, User, Activity, Building2,
} from "lucide-react";

const ICON_PROPS = { className: "sb-ico", size: 18, strokeWidth: 1.8 } as const;

const ICONS: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard {...ICON_PROPS} />,
  contacts: <Users {...ICON_PROPS} />,
  clients: <UserCheck {...ICON_PROPS} />,
  dossiers: <FolderOpen {...ICON_PROPS} />,
  taux: <Percent {...ICON_PROPS} />,
  emails: <Mail {...ICON_PROPS} />,
  campaigns: <Megaphone {...ICON_PROPS} />,
  pipeline: <Activity {...ICON_PROPS} />,
  history: <History {...ICON_PROPS} />,
  domains: <Globe {...ICON_PROPS} />,
  cms: <LayoutTemplate {...ICON_PROPS} />,
  testimonials: <Star {...ICON_PROPS} />,
  partners: <Building2 {...ICON_PROPS} />,
  content: <LayoutGrid {...ICON_PROPS} />,
  legal: <FileText {...ICON_PROPS} />,
  seo: <Search {...ICON_PROPS} />,
  agents: <Bot {...ICON_PROPS} />,
  settings: <Settings {...ICON_PROPS} />,
  profil: <User {...ICON_PROPS} />,
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
  { id: "pipeline", label: "Pipeline email", group: "Pilotage" },
  { id: "history", label: "Historique emails", group: "Pilotage" },
  { id: "cms", label: "Contenu du site (CMS)", group: "Site web" },
  { id: "testimonials", label: "Avis & témoignages", group: "Site web" },
  { id: "partners", label: "Banques partenaires", group: "Site web" },
  { id: "content", label: "Sections du site", group: "Site web" },
  { id: "legal", label: "Pages légales", group: "Site web" },
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
  brandName?: string;
  logoUrl?: string;
  logoAlt?: string;
}

export function Sidebar({ currentView, onViewChange, open, brandName = 'Kredix', logoUrl, logoAlt }: SidebarProps) {
  const groups = Array.from(new Set(navigation.map((n) => n.group)));

  // Modèle IA actif (chargé depuis les settings DB).
  const [aiModel, setAiModel] = useState<string>('');
  const [aiEngineLabel, setAiEngineLabel] = useState<string>('Modèle local');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/status');
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data ?? json;
        if (cancelled || !data) return;
        setAiModel(data.model || 'Non configuré');
        setAiEngineLabel(data.engineLabel || 'Modèle local');
      } catch {
        // Silencieux : le sidebar garde les valeurs par défaut.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="sb-logo">
        {logoUrl && <img src={logoUrl} alt={logoAlt || brandName} className="sb-logo-img" />}
        <span className="sb-logo-text">{brandName}</span>
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
            <b>{aiModel || 'Chargement…'}</b>
            {aiEngineLabel} · actif
          </div>
        </div>
      </div>
    </aside>
  );
}