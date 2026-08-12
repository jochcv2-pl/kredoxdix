"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard, Users, UserCheck, UserCog, FolderOpen, Percent,
  Mail, Megaphone, History, Globe, LayoutTemplate,
  Star, LayoutGrid, FileText, Search, Bot, Settings, User, Activity, Building2,
  Route, Send, Tag, Shield, ClipboardCheck,
} from "lucide-react";

const ICON_PROPS = { className: "sb-ico", size: 18, strokeWidth: 1.8 } as const;

const ICONS: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard {...ICON_PROPS} />,
  contacts: <Users {...ICON_PROPS} />,
  clients: <UserCheck {...ICON_PROPS} />,
  parcours: <Route {...ICON_PROPS} />,
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
  conseillers: <UserCog {...ICON_PROPS} />,
  content: <LayoutGrid {...ICON_PROPS} />,
  legal: <FileText {...ICON_PROPS} />,
  seo: <Search {...ICON_PROPS} />,
  agents: <Bot {...ICON_PROPS} />,
  settings: <Settings {...ICON_PROPS} />,
  'loan-types': <Tag {...ICON_PROPS} />,
  'mes-smtp': <Send {...ICON_PROPS} />,
  'audit': <Shield {...ICON_PROPS} />,
  'suivi-dossier': <ClipboardCheck {...ICON_PROPS} />,
  profil: <User {...ICON_PROPS} />,
};

const navigation = [
  { id: "dashboard", label: "Vue d'ensemble", group: "Pilotage" },
  { id: "conseillers", label: "Gestion des conseillers", group: "Pilotage" },
  { id: "contacts", label: "Prospects & clients", group: "Pilotage" },
  { id: "clients", label: "Clients", group: "Pilotage" },
  { id: "parcours", label: "Parcours client", group: "Pilotage" },
  { id: "dossiers", label: "Dossiers", group: "Pilotage" },
  { id: "taux", label: "Taux & barèmes", group: "Pilotage" },
  { id: "loan-types", label: "Types de prêt", group: "Pilotage" },
  { id: "emails", label: "Modèles d'emails", group: "Pilotage" },
  { id: "documents", label: "Documents modèles", group: "Pilotage" },
  { id: "campaigns", label: "Campagnes", group: "Pilotage" },
  { id: "pipeline", label: "Pipeline email", group: "Pilotage" },
  { id: "suivi-dossier", label: "Suivi dossier", group: "Pilotage" },
  { id: "history", label: "Historique emails", group: "Pilotage" },
  { id: "audit", label: "Journal d'audit", group: "Pilotage" },
  { id: "cms", label: "Contenu du site (CMS)", group: "Site web" },
  { id: "testimonials", label: "Avis & témoignages", group: "Site web" },
  { id: "partners", label: "Banques partenaires", group: "Site web" },
  { id: "content", label: "Sections du site", group: "Site web" },
  { id: "legal", label: "Pages légales", group: "Site web" },
  { id: "seo", label: "SEO", group: "Site web" },
  { id: "domains", label: "Domaines", group: "Site web" },
  { id: "agents", label: "Agents IA", group: "Intelligence" },
  { id: "settings", label: "Configuration", group: "Intelligence" },
  { id: "mes-smtp", label: "Mes SMTP", group: "Compte" },
  { id: "profil", label: "Mon profil", group: "Compte" },
];

// DEC-K5 — items de menu réservés au super-admin (role 'admin').
const SUPER_ADMIN_ONLY = new Set([
  'conseillers', 'pipeline', 'cms', 'testimonials', 'partners',
  'content', 'legal', 'seo', 'domains', 'agents', 'settings', 'loan-types',
  'audit',
]);

interface SidebarProps {
  currentView: string;
  onViewChange: (viewId: string) => void;
  open?: boolean;
  brandName?: string;
  logoUrl?: string;
  logoAlt?: string;
}

export function Sidebar({ currentView, onViewChange, open, brandName = 'Kredix', logoUrl, logoAlt }: SidebarProps) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === 'admin';
  const visibleNav = isSuperAdmin ? navigation : navigation.filter((n) => !SUPER_ADMIN_ONLY.has(n.id));
  const groups = Array.from(new Set(visibleNav.map((n) => n.group)));

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
          {visibleNav
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