-- N5: idempotência do alerta de trial para o OPERADOR.
--
-- Sem isto, o cron diário reemitiria a MESMA notificação todo dia enquanto o
-- trial estivesse na janela — o sino viraria ruído e o operador aprenderia a
-- ignorá-lo.
--
-- 🔑 O unique é sobre ("adminId", "type", "periodKey") e NÃO sobre
-- ("type", "periodKey"):
--
--   (a) a notificação é DIRECIONADA (uma linha por admin). Um unique global
--       faria o primeiro admin ganhar a linha e os demais colidirem — só um
--       seria avisado.
--   (b) notificação GLOBAL (adminId NULL) não serve para este alerta: as rotas
--       de "marcar como lida" excluem adminId NULL de propósito (marcar uma
--       global a esconderia de todos os outros admins), então ela voltaria como
--       não-lida para sempre.
--
-- ⚠️ No Postgres cada NULL é DISTINTO num índice unique. Isso é exatamente o
-- que queremos aqui: as notificações legadas e as futuras sem periodKey (dunning,
-- tickets) têm periodKey NULL e NÃO colidem entre si. O unique só morde quando
-- periodKey é preenchido — ou seja, só nos fluxos que pedem idempotência.
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "periodKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "admin_notifications_adminId_type_periodKey_key"
  ON "admin_notifications" ("adminId", "type", "periodKey");
