# Refonte IA Studio vers AI Desktop Studio

## But et ordre des lots

L'identité visible « IA Studio » devient « AI Desktop Studio ». Le monogramme AID bleu et blanc sur fond graphite est la marque unique. La livraison se fait dans l'ordre suivant, avec validation complète entre chaque lot : A identité visible, B identité publique, C migration technique.

## Lot A — identité visible

### Sources de vérité

`package.json` reste la source du nom produit. `APP_NAME`, les fenêtres, les pages HTML, les chaînes macOS, les associations de fichiers, les bundles i18n, le site et la documentation affichent « AI Desktop Studio ».

Le maître vectoriel AID remplace `build/icon.svg`. `build/icon.png`, le favicon du site et l'Apple Touch Icon sont des rendus dérivés de cette même marque. `WelcomeMark` continue de consommer ce maître ; le welcome affiche le monogramme et lit le nom depuis la source unique.

Le site met à jour ses titres, données OpenGraph, téléchargements et tous ses bundles de traduction. Les documents décrivant le produit sont renommés sans réécrire les faits historiques d'audits ni les notices tierces.

### Mascotte

La source de référence est `/Users/pasquelin/Desktop/game/character.glb` (425 336 triangles). Les optimisations sont `/Users/pasquelin/Desktop/Optimization/Robot_100k.glb`, `Robot_60k.glb` et `Robot_30k.glb`.

Le matériau de poitrine porte la marque AID lisible sur fond graphite. Les ressources livrées restent `HeroUltra.glb`, `HeroHigh.glb`, `HeroMedium.glb` et `HeroLow.glb` ; elles sont reconstruites depuis ces sources, jamais altérées sans traçabilité. Chaque niveau est contrôlé sur ses triangles, son matériau, sa texture embarquée, ses métadonnées et son rendu Blender. Le prototype AID a été validé visuellement.

### Compatibilité

Le lot A ne change pas `ai-desktop-studio://`, `.ai-desktop-studio/`, `.ai-desktop-studio-role`, `aidesktopstudio` dans les exports, `com.pasquelin.aidesktopstudio`, le nom de package, les clés de stockage ni les URL GitHub. Les tests associés restent en place.

### Validation

1. Tests ciblés du nom, des icônes, du welcome, du site et des ressources de mascotte.
2. Rendu Blender de la source et des quatre densités sous le même cadrage.
3. `pnpm check` pendant le lot, relecture adverse et passe de simplification.
4. Rebase sur `develop`, puis `pnpm validate` une fois sur le HEAD final.

## Lot B — identité publique

Une fois A livré, renommer le dépôt et le site public, mettre à jour les liens de téléchargement et OpenGraph, puis installer les redirections depuis les anciennes URLs. Toute mutation GitHub, domaine ou publication attend une autorisation explicite au moment de l'action.

## Lot C — identité technique

Après B, introduire une migration versionnée des protocoles, métadonnées, répertoires projet et appId. Les lecteurs acceptent ancien et nouveau formats ; les écrivains n'émettent le nouveau qu'après migration. Des fixtures d'anciens projets couvrent lecture, migration, export et retour arrière.
