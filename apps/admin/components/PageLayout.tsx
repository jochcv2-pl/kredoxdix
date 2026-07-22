"use client";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const pageTitles: Record<string, [string, string]> = {
  dashboard: ["Vue d'ensemble", "Activité de votre agence en temps réel"],
  contacts: ["Prospects & clients", "Gérez et validez vos contacts"],
  clients: ["Clients", "Parcours d'accompagnement en 7 niveaux"],
  dossiers: ["Dossiers", "Tous les dossiers"],
  taux: ["Taux & barèmes", "Pilotez les taux affichés sur le simulateur"],
  emails: ["Modèles d'emails", "Les emails utilisés par vos agents"],
  cms: ["Contenu du site (CMS)", "Modifiez le site public depuis le CRM"],
  seo: ["SEO", "Audit et référencement du site"],
  agents: ["Agents IA", "Créez et configurez vos agents"],
  settings: ["Configuration", "Modèle d'IA, passerelles, cadence et sécurité"],
};

interface PageLayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (viewId: string) => void;
}

export function PageLayout({ children, currentView, onViewChange }: PageLayoutProps) {
  const [title, subtitle] = pageTitles[currentView] || ["", ""];

  return (
    <div className="body">
      <Sidebar currentView={currentView} onViewChange={onViewChange} />
      <div className="main">
        <Topbar title={title} subtitle={subtitle} />
        <main className="view-content">{children}</main>
      </div>
    </div>
  );
}