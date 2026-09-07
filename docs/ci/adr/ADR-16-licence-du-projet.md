# ADR-16 — Licence du projet et des composants qu’il embarque

- **Statut** : Accepté
- **Date** : 2026-08-08

## Contexte

Le dépôt `pasquelin/IAStudio` est **public** et ne portait aucun fichier `LICENSE`.
`package.json` déclarait `"license": "UNLICENSED"`, ce qui vaut pour npm et pour rien d’autre.

En droit d’auteur l’absence de licence signifie « tous droits réservés », donc le projet était
protégé — mais rien ne le disait, et le dépôt sert deux objectifs contradictoires en apparence :

1. **être lu**, c’est une pièce de portfolio ;
2. **rester commercialisable**, l’application est destinée à être vendue.

En face, 36 composants tiers sont redistribués. Trente-deux sous licence permissive — leurs
obligations d’attribution étaient déjà satisfaites par `pnpm licences:collect`, la fenêtre
Aide ▸ Licences et le test qui la verrouille. Deux familles demandent davantage :

- **mediabunny**, en MPL-2.0 : copyleft *par fichier*, compatible avec un produit propriétaire
  (§3.3, « Larger Work »), mais qui oblige à indiquer où obtenir la source.
- **FFmpeg**, en GPL-3.0 sur macOS et LGPL-2.1 ailleurs : l’ADR-12 avait tranché l’usage —
  programme séparé, jamais lié — et **laissé ouverte** l’obligation de fournir les sources.
  `NOTICE.txt` renvoyait vers `https://ffmpeg.org/download.html`, une page générique. La GPLv3
  §6 exige la source **correspondant au binaire distribué**, pas la dernière version publiée.

## Décision

**Trois textes, trois portées, jamais confondues.**

| Fichier | Ce qu’il couvre | Contenu |
|---|---|---|
| `LICENSE` | le code source du dépôt | PolyForm Noncommercial 1.0.0 |
| `EULA.md` | l’application compilée distribuée | conditions d’utilisation propriétaires |
| `THIRD-PARTY-NOTICES.md` | les 36 composants tiers | généré, jamais écrit à la main |

**PolyForm Noncommercial 1.0.0 pour le code.** Lecture, compilation, étude et usage non
commercial autorisés ; tout usage commercial réservé à l’auteur. Rédigée par des juristes,
identifiant SPDX reconnu, courte et lisible. C’est la seule forme qui serve les deux objectifs
ci-dessus sans en sacrifier un.

L’en-tête du fichier dit explicitement ce qu’il ne couvre **pas** : les composants tiers gardent
leurs licences, et le binaire relève de l'`EULA.md`. Sans cette précision, le fichier prétendrait
licencier du code MIT, MPL et GPL sous des conditions qui ne sont pas les leurs.

**`package.json` déclare `PolyForm-Noncommercial-1.0.0`**, et `private: true` reste — il
n’empêche pas la licence, il empêche une publication npm accidentelle.

**L’offre de sources est épinglée au binaire, pas à un site.** Chaque cible de `TARGETS` déclare
son archive : le tarball `7.1.1` pour les builds macOS, le **commit** que BtbN a compilé pour les
autres — dérivé de `BTBN_BUILD`, puisque BtbN construit douze commits après le tag `n7.1.5` et que
le tarball du tag ne serait donc pas la source correspondante.

**Par cible, et non par version.** Un numéro de version n’identifie pas un build : `darwin-arm64`
et `darwin-x64` portent tous deux 7.1.1 aujourd’hui, mais viennent de deux mainteneurs sans
rapport, osxexperts et evermeet. Les deux sont réputés être des builds vanilla du même tarball —
si l’un porte un jour un correctif, c’est sa propre entrée qui l’enregistre, et `sourceArchives()`
joindra deux archives au lieu d’une. Indexer par version aurait rendu cette divergence
indétectable : la build passerait au vert en offrant la mauvaise source.

**Les archives sont jointes à chaque release**, par `node scripts/fetch-ffmpeg.mjs --sources dist`
dans le job `release`. Une offre par lien seul survit mal à un site tiers qui bouge ; l’archive
posée à côté de l’installeur, non.

**`NOTICE.txt` renvoie vers `ffmpeg -buildconf`** pour la configuration de compilation. Chaque
binaire porte la sienne : la lire depuis le binaire distribué vaut mieux qu’en recopier une, qui
finirait par diverger.

**Le collecteur refuse de passer** si un composant copyleft n’a pas d’offre de sources, ou si un
composant copyleft est patché — auquel cas la mention « unmodified » deviendrait fausse et le
fichier modifié devrait lui-même être publié.

## Alternatives écartées

- **« Tous droits réservés » sec.** Protection maximale, mais un lecteur du dépôt n’a alors pas
  le droit de compiler ce qu’il regarde. Perd la moitié de l’intérêt d’un dépôt public.
- **BUSL-1.1.** Bascule automatiquement en open source après quatre ans au plus. Incompatible
  avec l’intention de garder le projet propriétaire.
- **Passer le dépôt en privé.** Règle la question juridique en supprimant l’objectif portfolio.
- **Chercher un FFmpeg LGPL pour macOS**, comme sur les trois autres cibles : déjà écarté par
  l’ADR-12 faute de source fiable pour `darwin-arm64`, et sans effet ici — la LGPL demande elle
  aussi la source correspondante. Le travail à faire est le même.
- **Ne rien joindre et garder un lien.** C’est ce qui existait, et c’est ce que la GPLv3 §6
  n’accepte pas.

## Conséquences

- Chaque release porte **environ 26 Mo** de sources FFmpeg en plus des installeurs.
- Le job `release` a désormais besoin d’un `checkout` et de Node : il ne faisait que rassembler
  des artefacts. S’il ne peut pas télécharger les sources, **la release échoue** — c’est voulu,
  publier sans elles serait la violation.
- Faire tourner un build de FFmpeg impose de mettre à jour son `sources` en même temps que son
  entrée. Le commit BtbN suit tout seul, dérivé de `BTBN_BUILD` ; `MACOS_VERSION` porte l’autre.
- **Ce que le dispositif ne vérifie pas** : que les builds macOS soient bien vanilla. Personne ne
  compare l’archive offerte au binaire distribué, et rien ne le pourrait sans reconstruire.
  L’hypothèse est désormais écrite là où elle se corrige.
- Un composant copyleft ajouté sans offre de sources casse `pnpm licences:collect`, donc la
  build. C’est le point de contrôle : il ne dépend de la vigilance de personne.
- **Le nom était un sujet ouvert ; il est clos depuis le 21/08.** « Scenario Studio » et
  `com.scenario.app` reprenaient la marque d’un tiers, et l’`EULA.md` n’y opposait qu’une clause
  de non-affiliation — ce qui atténuait sans régler. La décision produit a été rendue : le studio
  s’appelle **IA Studio**, son `appId` est `com.pasquelin.aidesktopstudio`, et plus aucun identifiant du
  dépôt ne porte le mot. Ce qui subsiste est technique et nominatif — le paquet
  `@scenario-labs/sdk`, les URL `*.scenario.com`, et les valeurs que leur API RENVOIE
  (`PROVIDER_MAINTAINER`, les tags `sc:*`) — tant que l’application appelle cette API. Les
  variables d’environnement, elles, sont les nôtres : elles ont suivi, en `PROVIDER_API_*`.
