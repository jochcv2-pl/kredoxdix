-- =============================================================================
-- Kredix — Nettoyage des données mock
-- =============================================================================
-- Garde : EmailTemplate, Rate (Taux & barèmes), Setting, EmailGateway,
--         Agent, AgentMemory, LegalPage, ContentBlock, Testimonial,
--         BankPartner, Domain, AdminUser
-- Supprime : Lead, Campaign, CampaignRecipient, EmailLog, ClientStep
-- =============================================================================

BEGIN;

-- 1. EmailLogs (historique d'envoi)
DELETE FROM "EmailLog";

-- 2. CampaignRecipient (destinataires de campagnes)
DELETE FROM "CampaignRecipient";

-- 3. Campaign (campagnes d'emailing)
DELETE FROM "Campaign";

-- 4. ClientStep (étapes client dans le pipeline)
DELETE FROM "ClientStep";

-- 5. Lead (prospects/dossiers de démo)
DELETE FROM "Lead";

-- 6. SuppressionList (reset — sera repeuplée par les désinscriptions réelles)
DELETE FROM "SuppressionList";

COMMIT;

-- Vérification post-nettoyage :
-- SELECT 'EmailTemplate' AS t, COUNT(*) FROM "EmailTemplate"
-- UNION ALL SELECT 'Rate', COUNT(*) FROM "Rate"
-- UNION ALL SELECT 'Lead', COUNT(*) FROM "Lead"
-- UNION ALL SELECT 'Campaign', COUNT(*) FROM "Campaign"
-- UNION ALL SELECT 'EmailLog', COUNT(*) FROM "EmailLog"
-- UNION ALL SELECT 'ClientStep', COUNT(*) FROM "ClientStep";
