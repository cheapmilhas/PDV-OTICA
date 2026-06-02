<!-- Checklist da Fase 3 (prevenção de bugs). Marque o que se aplica. -->

## O que muda
<!-- Descreva em 1-3 linhas o que este PR faz e por quê. -->

## Checklist

### Qualidade
- [ ] `npx tsc --noEmit` passa (sem erros de tipo)
- [ ] `npm test` passa (testes verdes)
- [ ] Build local OK (`npm run build`) quando há mudança de UI/rota

### Regressão (lição do dogfood)
- [ ] **Bug corrigido?** Tem um teste que FALHA sem o fix e passa com ele.
- [ ] **Backend novo?** Tem a UI correspondente (não criar feature "morta" — ver T3/T8/T13).
- [ ] Lógica de decisão nova (preço, estoque, cashback, crédito) foi extraída para função pura testável quando fazia sentido.

### Multi-tenant (SaaS — funciona para TODOS os clientes)
- [ ] Toda query nova filtra por `companyId` (ou é global justificado).
- [ ] Operação testada/considerada com 2 empresas — a de uma não afeta a outra.
- [ ] Sem log do tenant-guard reclamando "query sem companyId" para esta mudança.

### Banco
- [ ] Precisa de migration? Se sim, foi criada e é segura (destrutiva → backup/SELECT antes; documentar).

## Como testei
<!-- Passos manuais ou automatizados que comprovam que funciona. -->
