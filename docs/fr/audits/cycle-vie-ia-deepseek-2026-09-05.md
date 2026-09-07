# Audit runtime IA — cycle de vie et essai DeepSeek — 5 septembre 2026

## Périmètre

Mesures réalisées depuis la branche `feat/assistant-resource-lifecycle`, commit de départ
`d63fd41b9`. Aucun document, projet, souvenir ou fichier utilisateur n'a été envoyé au fournisseur.
Les secrets sont restés dans `safeStorage` et ne figurent ni dans la sortie ni dans ce rapport.

## DeepSeek réel

Configuration lue par le même magasin que l'application : rôle assistant servi par `deepseek`, modèle
par défaut `deepseek-chat`. Le test traverse `createHttpChatBrain`, `briefingFor`, le transport HTTP
réel et `answeredTurn`.

Prompt utilisateur synthétique : demande de confirmer le succès du diagnostic sans appeler
d'action. Réponse structurée obtenue : `Test DeepSeek réussi. Aucune action requise.` avec zéro
appel.

| Temps | Événement | Observation |
|---:|---|---|
| 0 ms | démarrage du harnais | processus Electron réel |
| 78 ms | Electron prêt | profil IA Studio réel |
| 95 ms | compte prêt | `deepseek-chat`, secret non journalisé |
| 99 ms | requête composée | 108 426 caractères envoyés |
| 1 764 ms | réponse reçue | 76 caractères bruts, JSON lisible |
| 1 765 ms | réponse validée | phrase attendue, aucun appel |

Le premier essai avait semblé bloqué plus de deux minutes, mais ce résultat était invalide : un
`await app.whenReady()` au niveau module empêchait Electron d'émettre `ready`. Des jalons écrits en
temps réel ont isolé ce défaut du harnais avant le transport. Une fois le harnais corrigé, le réseau
et DeepSeek ont répondu normalement.

Le transport streamé a été vérifié séparément avec deux petits messages synthétiques, sans briefing
interne. Premier fragment à 574 ms, fin à 696 ms, réponse `{"status": "streaming-ok"}`. Le dernier
fragment rapporte 44 jetons d'entrée et 9 de sortie. Le lecteur SSE, l'assemblage des fragments et
les compteurs fonctionnent donc contre le vrai fournisseur.

Le chemin streamé complet de l'interface n'a pas été rejoué en une seule requête : il exige une
autorisation explicite, car il transmet les règles internes et le catalogue d'actions. Les deux
moitiés ont été validées séparément : briefing, parseur et réponse finale en non-streamé ; transport
SSE réel avec un contenu synthétique minimal.

## llama.cpp réel

Modèle disponible sur la machine : `qwen2.5-0.5b-instruct-q4`, GGUF de 491 400 032 octets. Le test
traverse le vrai `electronLlamaPort`, `llamaLocalRuntime`, `AiManager.ensureLoaded`, le timer one-shot
et `AiManager.unload`. Le délai de dix minutes n'est pas modifié en production ; le harnais le ramène
à trois secondes.

### Chronologie stabilisée

| Temps | État | RSS | Résultat |
|---:|---|---:|---|
| 37 ms | avant le premier chat | 117 Mo | aucun modèle chargé |
| 1 731 ms | premier chat terminé | 955 Mo | GGUF résident, réponse produite |
| 5 732 ms | après expiration idle | 457 Mo | `loaded() === null` |
| 11 733 ms | dix secondes après le chat | 457 Mo | toujours déchargé |
| 31 736 ms | trente secondes après le chat | 379 Mo | toujours déchargé |
| 33 370 ms | second chat terminé | 936 Mo | rechargement réussi, même réponse |
| 33 397 ms | déchargement explicite | 439 Mo | `loaded() === null` |

Le premier lancement observé lors d'un essai antérieur a pris 13,2 secondes ; les chargements
suivants ont pris environ 1,2 seconde. Ce coût initial appartient à l'ouverture de l'addon et de
Metal, pas à chaque rechargement.

### Lecture des chiffres

Mesuré : environ 500 Mo quittent le RSS après chaque `model.dispose()`, ce qui correspond aux poids
du GGUF, et une nouvelle conversation recharge puis répond normalement.

Mesuré : trente secondes après le déchargement, le processus reste environ 262 Mo au-dessus de son
RSS initial. `loaded() === null`, donc aucun poids n'est encore déclaré résident.

Déduit : ce reliquat vient du module natif chargé dynamiquement, de l'allocateur et des caches Metal.
JavaScript ne peut pas décharger une bibliothèque native du processus principal. Le supprimer
entièrement demanderait d'isoler llama.cpp dans un processus jetable, ce qui constituerait un
changement d'architecture hors du présent lot. Ces pages restent récupérables par le système sous
pression, mais le RSS seul ne prouve pas quand macOS les reprend.

## Fermeture de l'embedder

Le worker reçoit toujours `close`, puis dispose contexte, modèle et addon avant sa terminaison. La
fermeture est désormais bornée à quinze secondes par un timer one-shot non référencé. Si le code
natif ne répond jamais, `kill()` termine le processus et débloque la prochaine demande. Le délai
d'inactivité du modèle reste exactement 120 secondes.

## Workers ActionIndex et Memory

Les workers réels ont été ouverts ensemble pendant cinq minutes sur des copies temporaires des
données utilisateur : index d'actions vide et mémoire globale contenant une entrée. Les originaux
n'ont pas été modifiés.

| Fenêtre | RSS total | CPU ActionIndex | CPU Memory |
|---:|---:|---:|---:|
| 0–30 s | 145 Mo | 4,993 ms | 4,705 ms |
| 30–60 s | 147 Mo | 2,276 ms | 3,544 ms |
| 1–5 min | 147 Mo | 0,047 ms | 0,019 ms |

Le premier minuteur reflète surtout le démarrage et les appels de mesure. Sur les quatre dernières
minutes, le RSS passe seulement de 147 177 472 à 147 357 696 octets et les deux workers cumulent
66 microsecondes de CPU. Aucun travail périodique n'est démontré. Leur terminaison idle coûterait un
redémarrage pour économiser une mémoire stable et légère ; elle n'est donc pas ajoutée.

## Failles et points de vigilance

1. **Corrigé — fermeture embedding non bornée.** Un dispose natif suspendu pouvait empêcher le
   `kill()` et tout redémarrage ultérieur.
2. **Confirmé — mémoire native llama.cpp partiellement résidente.** Les poids lourds sont libérés,
   mais environ 262 Mo restent mappés après trente secondes. Une correction totale contredirait la
   contrainte de ne pas changer l'architecture.
3. **À investiguer — briefing cloud disproportionné.** Une demande triviale sans contexte produit
   108 426 caractères. Cela contredit le commentaire affirmant que le catalogue large ne voyage
   plus et que le plus grand briefing atteignable fait 23 607 caractères. Réduire ce briefing sans
   rejouer le banc fonctionnel risquerait toutefois de dégrader le taux de réussite.
4. **À mesurer — chemin DeepSeek streamé complet.** Le transport SSE et le parcours complet
   non-streamé sont validés séparément ; leur composition exacte attend l'autorisation de
   transmettre le briefing interne complet.

## Verdict

Le cycle llama.cpp corrigé fonctionne réellement : chargement, réponse, expiration idle,
déchargement des poids, rechargement et nouvelle réponse. Le stand-by reste résident mais dormant,
avec un reliquat natif mesurable et sans travail périodique ajouté.
