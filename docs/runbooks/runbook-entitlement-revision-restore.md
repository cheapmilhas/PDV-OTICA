# Runbook — restore/PITR do banco Vis com EntitlementRevision (V3a)

> ⚠️ LER ANTES de recolocar em produção qualquer banco Vis restaurado/clonado (PITR do Neon, restore de backup, clone). Relacionado ao incidente de banco zerado (2026-07-17).

## O risco

O relógio `EntitlementRevision.revision` vem da sequence `entitlement_revision_seq`. O Domus (D1.2) ordena os snapshots por essa revisão: uma revisão **menor** que a última já recebida é descartada como stale.

Um restore/PITR volta a sequence para um valor **anterior** ao que o Domus já observou. Depois do restore, novos eventos do Vis nasceriam com revisão **menor** que a que o Domus já tem gravada → **o Domus rejeitaria TODOS os snapshots novos como stale, indefinidamente** (até o valor da sequence ultrapassar de novo o que o Domus viu — pode levar muito tempo). Efeito: bloqueios/desbloqueios de assinatura param de refletir no Domus silenciosamente.

## O que fazer APÓS um restore, ANTES de repontar prod

1. **Descobrir a maior revisão que o Domus já recebeu.** No banco do Domus:
   ```sql
   SELECT max(source_revision) AS max_rev FROM clinic_entitlements
   WHERE source_revision IS NOT NULL;
   ```
   (Se todas forem NULL, o Domus ainda não recebeu revisão nenhuma — pule para o passo 3, mas confirme.)

2. **Reseedar a sequence do Vis ACIMA desse valor** (com folga). No banco Vis restaurado:
   ```sql
   -- margem de segurança: +1.000.000 acima do maior que o Domus viu.
   SELECT setval('entitlement_revision_seq', <max_rev_do_domus> + 1000000, true);
   ```
   `is_called = true` (3º arg) garante que o próximo `nextval` retorna o valor +1.

3. **Rebump de todas as companies VIS_MEDICAL vinculadas** para forçar revisões novas (acima do restaurado) e republicar:
   ```sql
   -- opção A: forçar bump via um UPDATE no-op que dispara o trigger
   -- (touca um campo publicavel de volta pro mesmo valor NAO dispara o WHEN;
   --  usar o helper diretamente e mais seguro):
   SELECT bump_entitlement_revision("id")
   FROM "Company"
   WHERE "platformProduct" = 'VIS_MEDICAL' AND "domusClinicId" IS NOT NULL;
   ```
   Depois republicar cada uma (backfill do publisher — ver Fase 5 do plano de tiers).

4. **Só então** repontar o app para o banco restaurado.

## Alternativa mais robusta (dívida futura)

Um **epoch** prefixado à revisão (`epoch << 40 | seq`), incrementado a cada restore, torna a revisão monotônica mesmo através de restores sem precisar consultar o Domus. Não implementado na V3a (complexidade); este runbook é a mitigação operacional.

## Por que a app nunca escreve EntitlementRevision

A tabela é mantida SÓ pelos triggers. Escrever manualmente (fora deste runbook) quebraria a monotonicidade. Se precisar corrigir, use `bump_entitlement_revision(companyId)` ou `setval` na sequence — nunca um UPDATE direto na `revision`.
