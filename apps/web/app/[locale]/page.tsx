import { getTranslations } from "next-intl/server";
import { Shield, CheckCircle, Award, Key, TrendingUp, RefreshCw, Cpu, Bot, Phone, Mail, UserPlus, BarChart3, Download, Check, MessageCircle } from "lucide-react";
import Navbar from "@/components/navbar";
import SimulatorAndForm from "@/components/simulator-and-form";
import TestimonialsCarousel from "./TestimonialsCarousel";
import { getActiveRates, getPublicSettings, getVisibleTestimonials, getContentBlock, getActiveLegalPages, getActiveBankPartners } from "@kredix/db";

// =============================================================================
// Landing page Kredix — Server Component SSR.
// Données dynamiques : taux, settings CMS, témoignages, sections CMS, pages lég.
// Override i18n par les données DB quand elles existent.
// =============================================================================

// --- Icon map (CMS ContentBlock items utilisent des noms d'icône string) ---
const ICON_MAP: Record<string, typeof Shield> = {
  shield: Shield, check: Check, 'check-circle': CheckCircle, award: Award, key: Key,
  phone: Phone, mail: Mail, trending: TrendingUp, cpu: Cpu, bot: Bot,
  'user-plus': UserPlus, 'bar-chart': BarChart3, download: Download, 'refresh-cw': RefreshCw,
};

function CmsIcon({ name, size = 32 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name] ?? Check;
  return <Icon size={size} strokeWidth={1.6} />;
}

// Type d'un item CMS (ContentBlock.items est stocké en Json dans Prisma).
type CmsItem = { icon: string; title: string; description: string };

// Cast sécurisé du champ Json Prisma vers CmsItem[] (le seed/admin garantit le format).
function cmsItems(raw: unknown, fallback: CmsItem[]): CmsItem[] {
  if (Array.isArray(raw) && raw.length > 0) return raw as CmsItem[];
  return fallback;
}

async function loadData(locale: string) {
  const [rates, settings, testimonials, engagementsBlock, servicesBlock, legalPages, bankPartners] = await Promise.all([
    getActiveRates(),
    getPublicSettings(),
    getVisibleTestimonials(locale),
    getContentBlock('engagements', locale),
    getContentBlock('services', locale),
    getActiveLegalPages(locale),
    getActiveBankPartners(),
  ]);
  return { rates, settings, testimonials, engagementsBlock, servicesBlock, legalPages, bankPartners };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Hero");
  const tHow = await getTranslations("HowItWorks");
  const tEng = await getTranslations("Engagements");
  const tServices = await getTranslations("Services");
  const tTesti = await getTranslations("Testimonials");
  const tPartners = await getTranslations("Partners");
  const tContact = await getTranslations("Contact");
  const tFooter = await getTranslations("Footer");

  const { rates, settings, testimonials, engagementsBlock, servicesBlock, legalPages, bankPartners } = await loadData(locale);

  // Override dynamique du contenu via settings DB (si la clé est non vide).
  // hero_title / hero_subtitle : i18n uniquement (les settings sont monolingues → on ne surcharge pas)
  const heroCtaPrimary = settings.cms_hero_cta_primary || null;
  const heroCtaSecondary = settings.cms_hero_cta_secondary || null;

  // Coordonnées dynamiques (section contact).
  const whatsapp = settings.whatsapp_number || "";
  const contactEmail = settings.contact_email || "contact@votredomaine.com";
  const contactPhone = settings.contact_phone || "";

  // WhatsApp link : nettoie tout sauf les chiffres pour wa.me.
  const waLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/[^\d]/g, "")}`
    : "https://wa.me/33600000000";
  const telLink = contactPhone
    ? `tel:${contactPhone.replace(/\s/g, "")}`
    : "tel:+33600000000";

  // Marque : site_name alimente le footer et <title>.
  const siteName = settings.site_name || "Kredix";

  return (
    <>
      {/* ===== NAV ===== */}
      <Navbar siteName={siteName} logoUrl={settings.cms_logo_url || undefined} />

      {/* ===== HERO ===== */}
      <section className="hero" id="top">
        <div className="blob1"></div>
        <div className="blob2"></div>
        <div className="grid-bg"></div>
        <div className="wrap">
          <div className="hero-inner">
            <span className="hero-eyebrow">{t("eyebrow")}</span>
            <h1>
              {t.rich("title", {
                highlight: (chunks) => <span className="mark">{chunks}</span>,
              })}
            </h1>
            <p className="hero-sub">{t("subtitle")}</p>
            <div className="hero-ctas">
              <a href="#simulateur" className="btn btn-orange">{heroCtaPrimary ?? t("cta1")}</a>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">{heroCtaSecondary ?? t("cta2")}</a>
            </div>
            <div className="hero-stats">
              <div className="hstat"><b>{t("stat1Value")}</b><span>{t("stat1Label")}</span></div>
              <div className="hstat"><b>{t("stat2Value")}</b><span>{t("stat2Label")}</span></div>
              <div className="hstat"><b>{t("stat3Value")}</b><span>{t("stat3Label")}</span></div>
              <div className="hstat"><b>{t("stat4Value")}</b><span>{t("stat4Label")}</span></div>
            </div>
            {/* Trust strip — badges visuels sous les stats */}
            <div className="hero-trust">
              <div className="hero-trust-item">
                <Shield size={18} strokeWidth={1.8} />
                <span>{t("badgeSecure")}</span>
              </div>
              <div className="hero-trust-item">
                <CheckCircle size={18} strokeWidth={1.8} />
                <span>{t("badgeNoCommitment")}</span>
              </div>
              <div className="hero-trust-item">
                <Award size={18} strokeWidth={1.8} />
                <span>{t("badgeCertified")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMMENT ÇA MARCHE ===== */}
      <section className="section" id="comment">
        <div className="wrap">
          <p className="section-eyebrow">{tHow("eyebrow")}</p>
          <h2 className="section-title">{tHow("title")}</h2>
          <p className="section-lead">{tHow("lead")}</p>
          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h3>{tHow("step1Title")}</h3>
              <p>{tHow("step1Text")}</p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3>{tHow("step2Title")}</h3>
              <p>{tHow("step2Text")}</p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3>{tHow("step3Title")}</h3>
              <p>{tHow("step3Text")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== NOS ENGAGEMENTS (CMS-driven, fallback i18n) ===== */}
      <section className="section" id="engagements">
        <div className="wrap">
          <p className="section-eyebrow">{engagementsBlock?.eyebrow ?? tEng("eyebrow")}</p>
          <h2 className="section-title">{engagementsBlock?.title ?? tEng("title")}</h2>
          <p className="section-lead">{engagementsBlock?.lead ?? tEng("lead")}</p>
          <div className="engagements-grid">
            {cmsItems(engagementsBlock?.items, [
              { icon: 'shield', title: tEng("item1Title"), description: tEng("item1Desc") },
              { icon: 'check-circle', title: tEng("item2Title"), description: tEng("item2Desc") },
              { icon: 'award', title: tEng("item3Title"), description: tEng("item3Desc") },
              { icon: 'trending', title: tEng("item4Title"), description: tEng("item4Desc") },
              { icon: 'key', title: tEng("item5Title"), description: tEng("item5Desc") },
              { icon: 'bar-chart', title: tEng("item6Title"), description: tEng("item6Desc") },
            ]).map((item, i) => (
              <div className="engagement-card" key={i}>
                <div className="engagement-icon">
                  <CmsIcon name={item.icon} size={28} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SIMULATEUR + FORMULAIRE (wrapper client) ===== */}
      <SimulatorAndForm rates={rates} whatsappNumber={whatsapp} />

      {/* ===== NOS SERVICES (CMS-driven, fallback i18n) ===== */}
      <section
        className="section"
        id="services"
        style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--line-soft)" }}
      >
        <div className="wrap">
          <p className="section-eyebrow">{servicesBlock?.eyebrow ?? tServices("eyebrow")}</p>
          <h2 className="section-title">{servicesBlock?.title ?? tServices("title")}</h2>
          <p className="section-lead">{servicesBlock?.lead ?? tServices("lead")}</p>
          <div className="services">
            {cmsItems(servicesBlock?.items, [
              { icon: 'trending', title: settings.cms_service_1 || tServices("card1Title"), description: tServices("card1Text") },
              { icon: 'cpu', title: settings.cms_service_2 || tServices("card2Title"), description: tServices("card2Text") },
              { icon: 'refresh-cw', title: settings.cms_service_3 || tServices("card3Title"), description: tServices("card3Text") },
              { icon: 'bot', title: settings.cms_service_4 || tServices("card4Title"), description: tServices("card4Text") },
            ]).map((item, i) => (
              <div className="service" key={i}>
                <div className="service-icon">
                  <CmsIcon name={item.icon} size={26} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== NOS PARTENAIRES BANCAIRES (carousel animé, masqué si vide) ===== */}
      {bankPartners.length > 0 && (
        <section className="section partners-section" id="partenaires">
          <div className="wrap">
            <p className="section-eyebrow">{tPartners("eyebrow")}</p>
            <h2 className="section-title">{tPartners("title")}</h2>
            <p className="section-lead">{tPartners("lead")}</p>
          </div>
          <div className="partners-marquee">
            <div className="partners-marquee-track">
              {[...bankPartners, ...bankPartners].map((bank, i) => (
                <div className="partner-logo" key={`${bank.id}-${i}`}>
                  {bank.logoUrl ? (
                    <img src={bank.logoUrl} alt={bank.name} />
                  ) : (
                    <span className="partner-name">{bank.name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== AVIS & TÉMOIGNAGES (Carousel animé CMS-driven, masqué si vide) ===== */}
      {testimonials.length > 0 && (
        <section className="section tst-section" id="avis">
          <div className="wrap">
            <p className="section-eyebrow">{tTesti("eyebrow")}</p>
            <h2 className="section-title">{tTesti("title")}</h2>
            <p className="section-lead">{tTesti("lead")}</p>
          </div>
          <TestimonialsCarousel testimonials={testimonials} />
        </section>
      )}

      {/* ===== CONTACT ===== */}
      <section className="section contact-section" id="contact">
        <div className="wrap">
          <div className="contact-inner">
            <h2>
              {tContact.rich("title", {
                highlight: (chunks) => <em>{chunks}</em>,
              })}
            </h2>
            <p className="csub">{tContact("subtitle")}</p>
            <div className="contact-actions">
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="contact-btn"
              >
                <div className="cmark"><MessageCircle size={20} strokeWidth={1.8} /></div>
                <div>
                  <div className="ctitle">{tContact("whatsappTitle")}</div>
                  <div className="cdesc">{whatsapp || tContact("whatsappDesc")}</div>
                </div>
              </a>
              <a
                href="https://m.me/kredix"
                target="_blank"
                rel="noopener noreferrer"
                className="contact-btn"
              >
                <div className="cmark">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                    <path d="M12 2C6.36 2 1.8 6.13 1.8 11.25c0 2.88 1.42 5.45 3.65 7.18V22l3.33-1.83c.95.26 1.96.4 3 .4 5.64 0 10.2-4.13 10.2-9.25S17.64 2 12 2zm1.07 12.25l-2.65-2.83-5.18 2.83 5.69-6.04 2.71 2.83 5.13-2.83-5.7 6.04z" />
                  </svg>
                </div>
                <div>
                  <div className="ctitle">{tContact("messengerTitle")}</div>
                  <div className="cdesc">{tContact("messengerDesc")}</div>
                </div>
              </a>
              <a href={telLink} className="contact-btn">
                <div className="cmark"><Phone size={20} strokeWidth={1.8} /></div>
                <div>
                  <div className="ctitle">{tContact("phoneTitle")}</div>
                  <div className="cdesc">{contactPhone || "+33 6 00 00 00 00"}</div>
                </div>
              </a>
              <a href={`mailto:${contactEmail}`} className="contact-btn">
                <div className="cmark"><Mail size={20} strokeWidth={1.8} /></div>
                <div>
                  <div className="ctitle">{tContact("emailTitle")}</div>
                  <div className="cdesc">{contactEmail}</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer-top">
            <div>
              <div className="footer-logo">{siteName}</div>
              <p className="footer-desc">{tFooter("description")}</p>
            </div>
            <div className="footer-cols">
              <div className="footer-col">
                <h4>{tFooter("col1Title")}</h4>
                <a href="#services">{tFooter("col1Link1")}</a>
                <a href="#services">{tFooter("col1Link2")}</a>
                <a href="#services">{tFooter("col1Link3")}</a>
                <a href="#services">{tFooter("col1Link4")}</a>
              </div>
              <div className="footer-col">
                <h4>{tFooter("col2Title")}</h4>
                <a href="#comment">{tFooter("col2Link1")}</a>
                <a href="#simulateur">{tFooter("col2Link2")}</a>
                <a href="#contact">{tFooter("col2Link3")}</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p className="footer-legal">{tFooter("legal")}</p>
            <div className="footer-links">
              {legalPages.length > 0 ? (
                legalPages.map((page) => {
                  // Map slug → i18n key pour traduire le titre selon la langue
                  const slugKeyMap: Record<string, string> = {
                    'mentions-legales': 'legalMentions',
                    'cgu': 'legalCgu',
                    'politique-confidentialite': 'legalPrivacy',
                    'cookies': 'legalCookies',
                    'cgv': 'legalCgv',
                  }
                  const i18nKey = slugKeyMap[page.slug]
                  return (
                    <a key={page.id} href={`/${locale}/legal/${page.slug}`}>
                      {i18nKey ? tFooter(i18nKey as any) : page.title}
                    </a>
                  )
                })
              ) : (
                <>
                  <a href={`/${locale}/legal/mentions-legales`}>{tFooter("legalMentions")}</a>
                  <a href={`/${locale}/legal/cgu`}>{tFooter("legalCgu")}</a>
                  <a href={`/${locale}/legal/politique-confidentialite`}>{tFooter("legalPrivacy")}</a>
                  <a href={`/${locale}/legal/cookies`}>{tFooter("legalCookies")}</a>
                  <a href={`/${locale}/legal/cgv`}>{tFooter("legalCgv")}</a>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
