# Spike Semantic Action Search

## Statut

Expérience close, sans intégration produit. Le verdict est `ROUTING AND E5 BOTTLENECK`.

## Résultats reproductibles

Les métriques portent sur 40 attentes unitaires validées. Deux attentes erronées et huit workflows ambigus restent hors métriques principales.

| Configuration                 |   R@12 |    MRR |
| ----------------------------- | -----: | -----: |
| E5-small Q0, 297 actions      | 17,5 % | 0,0750 |
| E5-small Q4, contexte runtime | 22,5 % | 0,0679 |
| Q4 + domaine top-1            | 62,5 % | 0,1070 |
| Oracle domaine E5-small       | 72,5 % | 0,2666 |

Le routeur top-1 retient le domaine correct dans 45 % des cas Q4 et un sous-ensemble moyen de 27,5 actions. Top-2 et top-3 augmentent la couverture de domaine mais font régresser le ranking : les familles ajoutées introduisent des candidats au cosine supérieur.

## Conclusion

L'architecture à évaluer lors d'une future intégration est : contexte runtime, routage de domaine, sous-ensemble d'actions, retrieval sémantique, puis reranking métier. Le routeur et E5-small sont tous deux des goulots : même avec le domaine oracle, E5-small n'atteint pas la gate de 80 %.

## Reproduction

Le banc est dans `scripts/banc/semanticActionSearch.mission-banc.ts`. Il exige `SEMANTIC_ACTION_MODEL` et écrit les rapports locaux ignorés dans `.agents/loop-todo/` :

```sh
SEMANTIC_ACTION_MODEL=/chemin/vers/multilingual-e5-small.gguf \
SEMANTIC_ACTION_OUTPUT=.agents/loop-todo \
SEMANTIC_DEEP_DIAGNOSTIC=1 \
pnpm exec vitest run --config vitest.mission-banc.config.ts scripts/banc/semanticActionSearch.mission-banc.ts
node scripts/banc/semanticDeepDiagnosticReport.mjs
node scripts/banc/semanticRetrievalPhase2Report.mjs
node scripts/banc/semanticRetrievalPhase3Report.mjs
node scripts/banc/semanticRoutingPhase3c.mjs
```

Le GGUF reconstruit est une sonde, pas la baseline historique : SHA-256 `167b404b82b1cd3a2d4ebd0af3a21c5c317cc9497841d1bc7e4cf0f312e58b42`.
