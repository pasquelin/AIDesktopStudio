# Les secrets du dépôt

**Aucun secret de SIGNATURE n’est configuré à ce jour.** Le pipeline produit des builds non
signés et le signale dans le résumé de chaque run — c’est délibéré, voir
[ADR-04](adr/ADR-04-strategie-de-signature.md). Ce document est la procédure d’activation.

**Les quatre secrets du DÉPLOIEMENT de la vitrine, eux, existent** — ils sont en bas de page. Ne
pas lire la phrase ci-dessus comme « le dépôt n’a aucun secret » : `gh secret list` fait foi.

> **Toutes les valeurs d’exemple de ce document sont FICTIVES.** `2X4B9Q7ZKD`, `a1b2c3d4-…`,
> `MIIKm…` : rien de tout cela n’est réel, ni ne doit être copié tel quel.

Les noms sont figés par [ADR-07](adr/ADR-07-nommage-des-secrets.md). En ajouter un hors de cette
liste demande un amendement.

## Avant d’activer quoi que ce soit

**Épingler les actions au SHA dans `release.yml`.** Elles y sont référencées par tag majeur
(`actions/checkout@v7`), et un tag se redéplace. Sans secret, l’enjeu est nul ; avec du matériel
de signature dans l’environnement d’un job, une action compromise en amont s’exécute dans le même
job que le packaging. Remplacer chaque `@vN` par le SHA du commit, avec la version en commentaire :

```yaml
- uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v7.0.1
```

## Règles

- Un secret se colle **dans l’interface GitHub, et nulle part ailleurs** :
  `Settings → Secrets and variables → Actions → New repository secret`.
- Ne jamais coller le résultat d’un `base64` dans un terminal partagé, un message, un ticket, ni
  dans un fichier du dépôt. `.gitignore` exclut `*.p12`, `*.pfx`, `*.cer`, `*.provisionprofile`
  et `*.mobileprovision`, mais l’exclusion est un filet, pas une permission.
- Un secret absent ne casse rien : le build passe en mode non signé.

---

## macOS — quatre secrets, plus deux

Prérequis : **Apple Developer Program, 99 $/an**. Sans lui, rien de ce qui suit n’est possible, et
Gatekeeper bloque purement et simplement l’application chez l’utilisateur final.

### Le certificat — `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`

1. **Générer une demande de certificat (CSR).**
   Trousseau d’accès → menu *Trousseau d’accès* → *Assistant de certification* → *Demander un
   certificat à une autorité de certification*. Saisir l’adresse électronique du compte
   développeur, cocher **Enregistrer sur le disque**. Produit un `CertificateSigningRequest.certSigningRequest`.

2. **Créer le certificat.**
   [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
   → `+` → **Developer ID Application** (surtout pas « Mac App Distribution », qui ne sert qu’au
   Mac App Store). Téléverser la CSR, télécharger le `.cer`, double-cliquer pour l’installer.

3. **Exporter en `.p12`.**
   Trousseau d’accès → catégorie *Mes certificats* → clic droit sur « Developer ID Application:
   … » → *Exporter*. Format **Échange d’informations personnelles (.p12)**. **Choisir un mot de
   passe fort** : c’est lui qui devient `MAC_CERT_PASSWORD`.

4. **Encoder en base64.** Un secret GitHub est du texte ; un binaire brut n’y survit pas.

   ```bash
   base64 -i ~/Desktop/developer-id.p12 | pbcopy
   ```

   Le contenu est dans le presse-papier. **Le coller directement dans le champ GitHub**, puis
   vider le presse-papier et supprimer le `.p12` du disque.

5. **Créer les deux secrets** : `MAC_CERT_P12_BASE64` (le base64) et `MAC_CERT_PASSWORD`.

**Expiration : 5 ans.** Le certificat expiré ne révoque pas les binaires déjà signés — Apple
horodate la signature — mais empêche d’en signer de nouveaux.

### La notarisation — `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`

Signer ne suffit pas : sans notarisation, Gatekeeper refuse quand même. On utilise une **clé API
App Store Connect** plutôt qu’un mot de passe applicatif — révocable, sans lien avec le mot de
passe du compte, et stable en CI.

1. [appstoreconnect.apple.com/access/integrations/api](https://appstoreconnect.apple.com/access/integrations/api)
   → *Clés d’API* → `+`. Le rôle **Developer** suffit ; ne pas donner *Admin*.

2. Noter les deux identifiants affichés :
   - **Key ID** → `APPLE_API_KEY_ID` (exemple fictif : `2X4B9Q7ZKD`)
   - **Issuer ID** → `APPLE_API_ISSUER` (exemple fictif : `a1b2c3d4-5e6f-7890-abcd-ef1234567890`)

3. Télécharger le fichier `AuthKey_XXXXXXXXXX.p8`. **Apple ne le propose qu’une fois.**

4. Encoder :

   ```bash
   base64 -i ~/Downloads/AuthKey_2X4B9Q7ZKD.p8 | pbcopy
   ```

   → `APPLE_API_KEY_P8_BASE64`.

5. **Team ID** → `APPLE_TEAM_ID`. Visible en haut à droite du portail développeur, ou :

   ```bash
   security find-identity -v -p codesigning
   # "Developer ID Application: Prénom Nom (TEAMID1234)" — la valeur entre parenthèses
   ```

**Expiration : aucune**, mais la clé se révoque depuis le portail. La révoquer et en créer une
autre est la bonne réaction au moindre doute.

**Ne pas oublier** : la notarisation ne s’active que si l’application a d’abord été **signée**.
Ajouter les secrets Apple sans `MAC_CERT_P12_BASE64` ne produit rien.

---

## Windows — `WIN_CERT_P12_BASE64`, `WIN_CERT_PASSWORD`

Pas de certificat aujourd’hui, et pas d’entité juridique pour en obtenir un facilement. Sans
signature, **SmartScreen affiche un avertissement à l’installation** — acceptable en phase de
test, pas en distribution publique.

Deux voies, selon la situation juridique :

### Azure Artifact Signing — si une société existe

Environ **9,99 $/mois**, sans token matériel à gérer. Accessible aux **organisations** de l’UE ;
les développeurs en nom propre restent restreints aux États-Unis et au Canada. C’est la voie la
plus simple **dès qu’une SASU, EURL ou SAS est immatriculée**.

Elle n’utilise pas `WIN_CERT_P12_BASE64` mais un jeu de variables Azure, et exige un
`azureSignOptions` dans `electron-builder.yml` — **donc un amendement d’ADR-07 et d’ADR-04**
avant toute mise en œuvre.

### Certificat OV — en nom propre

Auprès d’une autorité de certification (DigiCert, Sectigo, SSL.com…). Depuis juin 2023, la clé
privée doit résider sur un **token matériel ou un HSM cloud** : en CI, cela impose une offre de
signature cloud (eSigner de SSL.com, KeyLocker de DigiCert). Compter 250 à 600 $/an.

Une fois le certificat obtenu, la procédure d’encodage est la même que pour macOS :

```bash
base64 -i certificat-ov.pfx | pbcopy
```

→ `WIN_CERT_P12_BASE64`, et son mot de passe dans `WIN_CERT_PASSWORD`.

**Expiration : 460 jours maximum depuis mars 2026.** Prévoir la rotation **annuelle** : poser un
rappel de calendrier à 11 mois. Un certificat expiré ne casse pas les installeurs déjà signés,
mais fait repasser les nouveaux sous l’avertissement SmartScreen.

---

## Linux

**Aucun secret.** `AppImage` et `deb` ne demandent pas de signature de code.

---

## Vérifier que l’activation a pris

Après avoir ajouté les secrets :

```bash
gh secret list
gh workflow run release.yml -f dry_run=true
gh run watch
```

Dans le résumé du run, l’avertissement **« UNSIGNED build »** doit avoir disparu pour la
plateforme concernée. Puis, sur le `.dmg` téléchargé :

```bash
codesign --verify --deep --strict --verbose=2 /Applications/AI\ Desktop\ Studio.app
spctl --assess --type execute --verbose /Applications/AI\ Desktop\ Studio.app
# attendu : "accepted", "source=Notarized Developer ID"
```

En cas d’échec, voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## La vitrine — quatre secrets, et ils sont posés

`pages.yml` ne passe plus par GitHub Pages : il pousse le rendu par `rsync` sur le serveur qui
sert `www.aidesktopstudio.com`.

**Sur leur nommage, une dette est ouverte plutôt que cachée.** La règle en tête de page dit qu’un
nom hors de la liste d’[ADR-07](adr/ADR-07-nommage-des-secrets.md) demande un amendement ; ces
quatre-là sont arrivés sans. La lecture retenue est qu’ADR-07 ne statue que sur la SIGNATURE — son
contexte, sa table et ses alternatives ne parlent que d’elle — et que le déploiement n’entre donc
pas dans son périmètre. C’est à confirmer par un amendement ou par un ADR à lui.

| Secret               | Ce que c’est                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_SSH_KEY`     | La clé privée du dépôt de la vitrine, écrite dans `~/.ssh/deploy`. Côté serveur, `authorized_keys` l’enferme par `command="rrsync -wo <dossier>"` : elle n’ouvre **aucun shell** et n’atteint aucun autre répertoire |
| `DEPLOY_KNOWN_HOSTS` | L’empreinte du serveur. `ssh` tourne en `StrictHostKeyChecking=yes` : sans elle la connexion est refusée, plutôt qu’acceptée à l’aveugle                                                                             |
| `DEPLOY_TARGET`      | `utilisateur@hôte` de destination. Le `/` qui suit dans la commande `rsync` est relatif au dossier où la clé est enfermée, pas la racine du serveur                                                                  |
| `DEPLOY_SSH_PORT`    | Le port SSH, le serveur n’écoutant pas sur 22                                                                                                                                                                        |

**Un secret manquant fait échouer le job à la première clé, APRÈS le build** : le tag existe
alors, la draft aussi, et le site annonce encore la version d’avant. Le contrôle est dans
[RELEASE.md](RELEASE.md) :

```bash
gh secret list --json name --jq '.[].name' | grep '^DEPLOY_'   # attendu : les quatre
```

**Rotation** : régénérer la paire, poser la publique dans `authorized_keys` du serveur **avec sa
contrainte `command=`**, puis remplacer `DEPLOY_SSH_KEY`. L’ordre compte — remplacer le secret
d’abord coupe le déploiement jusqu’à ce que le serveur suive.
