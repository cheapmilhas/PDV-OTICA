-- "Ocultar por hoje" da fila "Prontos pra avisar" (OS pronta parada).
-- Aditiva: coluna nullable, sem default destrutivo, sem tocar dados existentes.
ALTER TABLE "ServiceOrder" ADD COLUMN "notifySnoozedUntil" TIMESTAMP(3);
