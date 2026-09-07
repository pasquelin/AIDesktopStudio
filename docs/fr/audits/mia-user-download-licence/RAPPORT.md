# Make-It-Animatable — téléchargement direct par l’utilisateur

Audit vérifié le 4 septembre 2026. Ce document analyse uniquement le scénario où IA Studio est
une application commerciale payante, référence le dépôt officiel et laisse l’utilisateur déclencher
le téléchargement direct. Il s’agit d’une analyse documentaire, pas d’un avis juridique.

## Résumé exécutif

**Verdict : POSSIBLE BUT LEGALLY UNCERTAIN**

IA Studio ne réalise aucune transmission matérielle des checkpoints dans l’architecture examinée :
il ne les incorpore pas à son dépôt ou à son application, ne les héberge pas et ne sert pas leurs
octets. Le clic de l’utilisateur demande les fichiers au dépôt Hugging Face officiel. Aucun texte
trouvé ne tranche si cette orchestration constitue juridiquement une forme de redistribution ou de
facilitation ; le rapport ne l’assimile donc ni automatiquement à une redistribution, ni à une
absence juridiquement certaine de redistribution.

Le dépôt officiel est public, non gated et déclare `apache-2.0` dans la model card. Si cette licence
a été valablement accordée aux quatre checkpoints, elle permet leur usage local et commercial, leur
modification et même leur redistribution sous ses conditions. Hugging Face documente explicitement
les téléchargements programmatiques et ses API ; aucune condition spéciale propre à MIA n’a été
trouvée.

L’incertitude ne porte donc pas sur le bouton Télécharger. Elle porte sur l’autorité de l’auteur à
accorder Apache-2.0 aux checkpoints : Adobe interdit explicitement depuis le 23 juin 2021 d’utiliser
le contenu reçu ou dérivé de Mixamo pour créer ou entraîner des modèles ou poids ML, tandis que le
papier et le dépôt MIA déclarent un entraînement sur Mixamo. Le texte Adobe ne dit pas que
l’utilisateur aval d’un checkpoint ainsi créé ne peut pas l’utiliser en inférence. Il révèle
cependant un conflit de provenance que la model card ne résout pas.

## Architecture et acteurs

Schéma illustratif, non exécutable :

```text
Auteur MIA publie les checkpoints sous son compte
  → Hugging Face les héberge et sert les octets
    → IA Studio affiche une référence et orchestre la requête
      → l’utilisateur clique et reçoit les fichiers de Hugging Face
        → le runtime IA Studio les utilise localement
```

- **Auteur MIA** : publie le code et les checkpoints, choisit les métadonnées de licence et décrit
  les données d’entraînement.
- **Hugging Face** : héberge le repository public et délivre les fichiers, directement ou par son
  CDN, sous ses conditions de service et la licence accompagnant le contenu.
- **IA Studio** : fournit le catalogue, le lien épinglé, le gestionnaire de téléchargement, la
  vérification SHA-256 et le runtime. Il ne reçoit ni ne retransmet les octets.
- **Utilisateur** : décide de télécharger, devient le destinataire des checkpoints, les conserve
  sur sa machine et lance l’inférence locale.

Le caractère payant d’IA Studio ne change pas le texte d’Apache-2.0, qui n’interdit pas l’usage
commercial. Il augmente en revanche l’enjeu pratique d’une provenance non clarifiée.

## Code MIA

Le repository GitHub officiel contient une licence MIT au commit audité
`d60cc7e01ff8da46448e458dbf450e8967b34e77`. Elle permet l’utilisation, la copie, la modification,
la publication, la distribution, la sous-licence et la vente du code sous réserve de conserver la
notice. Cette licence du code ne prouve rien sur la licence des checkpoints ou des datasets.

Statut : **CLEAR — EXPLICITLY ALLOWED**, avec notice MIT.

## Checkpoints et portée de la déclaration Apache-2.0

Révision vérifiée : `eb12b71253361fd1a7216625a95144af3c58263e` du repository public
`jasongzy/Make-It-Animatable`.

La model card contient exactement les métadonnées `license: apache-2.0` et
`datasets: jasongzy/Mixamo`. L’API officielle renvoie la même licence, `private: false`,
`gated: false` et la même révision. Les quatre fichiers sont présents sous :

- `output/best/new/bw.pth` ;
- `output/best/new/joints.pth` ;
- `output/best/new/joints_coarse.pth` ;
- `output/best/new/pose.pth`.

La révision ne contient aucun fichier `LICENSE`, `NOTICE` ou conditions supplémentaires. La
documentation Hugging Face précise que le champ `license` de la card sert à déclarer la licence du
repository et à informer les utilisateurs des permissions voulues par son créateur. La déclaration
porte donc normalement sur le contenu du repository, checkpoints compris. Elle reste toutefois une
déclaration de l’uploader : Hugging Face ne garantit pas sa chaîne de droits.

Statut de la déclaration : **licence Apache-2.0 explicitement déclarée**. Autorité du déclarant sur
tous les droits amont : **AMBIGUOUS**.

## Ce qu’Apache-2.0 accorde si la déclaration est valide

La section 2 accorde une licence de copyright perpétuelle, mondiale, non exclusive, gratuite et
irrévocable pour reproduire, créer des œuvres dérivées, afficher, exécuter, sous-licencier et
distribuer l’œuvre. La section 3 ajoute une licence de brevets limitée aux revendications que le
contributeur peut licencier. La licence ne distingue pas usage personnel et commercial.

Pour le destinataire des checkpoints :

| Action | Résultat sous Apache-2.0 valide |
| --- | --- |
| téléchargement / reproduction locale | **ALLOWED BY LICENSE** par le droit de reproduction |
| utilisation locale et inférence | **NO RESTRICTION IDENTIFIED** dans Apache-2.0 |
| utilisation dans une application commerciale | **NO COMMERCIAL RESTRICTION** dans Apache-2.0 |
| modification | **ALLOWED BY LICENSE** par le droit de créer des œuvres dérivées |
| distribution du checkpoint ou d’une œuvre dérivée | **ALLOWED BY LICENSE**, obligations de la section 4 |
| service d’inférence sans remise du checkpoint | pas une distribution régie par la section 4 ; aucune restriction d’usage identifiée |

L’usage local non redistribué n’active pas les obligations de remise de licence aux destinataires
de la section 4. Montrer avant téléchargement l’auteur, la licence, la source et un lien vers les
termes reste recommandé : l’utilisateur sait quel contenu tiers il acquiert et sous quelles règles.

Apache-2.0 n’accorde que les droits que le licensor/contributeur est habilité à accorder. Elle est
fournie sans garantie et ne constitue pas une certification de la provenance. Une licence claire et
l’autorité pour l’accorder sont deux questions distinctes.

## Mixamo

### Ce qui est permis

La FAQ Adobe officielle autorise les personnages et animations Mixamo, sans royalties, dans des
projets personnels, commerciaux et non lucratifs, notamment illustrations, films et jeux. Les
conditions générales Adobe autorisent la modification des « Content Files » et leur reproduction ou
distribution seulement incorporées dans une œuvre finale ; elles interdisent leur distribution
autonome.

### Ce qui est interdit ou non documenté

Les conditions additionnelles Mixamo, effectives depuis le 23 juin 2021 et remplaçant les versions
antérieures, interdisent expressément d’utiliser les Services, le Software ou tout contenu, donnée,
output ou information reçu ou dérivé de ceux-ci pour créer, entraîner, tester ou améliorer un
système AI/ML, y compris ses modèles ou poids.

| Question | Constat documentaire |
| --- | --- |
| usage commercial de personnages/animations dans une œuvre finale | **EXPLICITLY ALLOWED** |
| modification avant incorporation | **EXPLICITLY ALLOWED** |
| redistribution autonome des assets | **EXPLICITLY FORBIDDEN** |
| entraînement ML avec contenu Mixamo reçu ou dérivé | **EXPLICITLY FORBIDDEN** depuis le 23 juin 2021 |
| distribution de poids déjà entraînés par un tiers | **NOT DOCUMENTED** |
| inférence locale par un destinataire de ces poids | **NOT DOCUMENTED** |
| droits sur les rigs produits par ces poids | **NOT DOCUMENTED** |

Le papier MIA indique avoir utilisé 95 personnages Mixamo et 2 453 séquences de mouvement. Le dépôt
officiel décrit également un pipeline d’entraînement qui associe ces personnages et animations pour
extraire poids, os et transformations de pose. Les sources publiques ne donnent ni date
d’acquisition des données, ni accord distinct d’Adobe, ni exception applicable aux auteurs.

Conséquence pour le scénario E : le téléchargement et l’inférence par l’utilisateur ne sont pas
explicitement interdits par Adobe. La clause AI/ML interdit ce type d’entraînement en général, mais
son applicabilité factuelle aux auteurs MIA demeure **AMBIGUOUS** faute de date d’acquisition et
d’éventuel accord distinct. Cette contradiction documentaire suffit à rendre incertaine l’autorité
du producteur à proposer les poids sous Apache-2.0 ; elle ne prouve pas à elle seule une violation.

## 3DBiCar et RaBit

Le papier RaBit et son repository officiel décrivent 3DBiCar comme 1 500 modèles texturés créés
manuellement par six artistes à partir de références 2D collectées sur Internet. Le repository MIA
dit avoir inclus certains échantillons 3DBiCar, riggés par Mixamo, pour améliorer la généralisation.

Au 4 septembre 2026 :

- le repository officiel RaBit n’a pas de licence déclarée et ne contient pas de fichier de
  licence à sa racine ;
- la page officielle 3DBiCar fournit un lien OneDrive, sans conditions d’utilisation visibles ;
- le papier décrit l’entraînement et les usages de recherche, mais n’accorde pas une licence de
  dataset ;
- aucune permission explicite sur usage commercial, redistribution, œuvres dérivées, entraînement
  ML ou poids entraînés n’a été trouvée.

Toutes ces questions sont donc **UNKNOWN / NOT DOCUMENTED**, et non « interdites ». Pour IA Studio,
l’utilisateur ne reçoit aucun asset 3DBiCar/RaBit. Le défaut de licence concerne la provenance des
checkpoints publiés, pas une obligation directe de téléchargement du dataset par l’utilisateur.

## Hugging Face et le téléchargement programmatique

Hugging Face documente officiellement `hf download`, `hf_hub_download`, ses clients Python/JS et
ses endpoints ouverts. Les téléchargements suivent des redirections vers son stockage/CDN et sont
soumis aux rate limits du Hub. Les conditions du Hub indiquent qu’un repository public accorde aux
utilisateurs une licence d’accès et d’usage via les fonctionnalités du service, tout en maintenant
les licences usuelles qui accompagnent le contenu. Le contenu téléchargé reste utilisé aux risques
du destinataire et selon sa licence.

La révision MIA auditée est publique et **non gated**. Une requête anonyme sur l’URL officielle de
`bw.pth` répond par une redirection de téléchargement public, annonce la révision exacte, les plages
HTTP et la taille liée. Aucun compte, token ou acceptation de conditions MIA supplémentaires n’est
requis actuellement.

| Mode | Constat |
| --- | --- |
| lien ouvrant la page HF | autorisé par les fonctionnalités publiques documentées |
| téléchargement programmatique officiel | mécanisme explicitement prévu par la documentation HF ; droits du contenu séparés |
| client tiers avec clic utilisateur | mécanisme non interdit identifié ; rate limits et licence du contenu applicables |
| modèle gated à l’avenir | demande initiale dans le navigateur ; téléchargements ultérieurs possibles avec le token utilisateur |

Le gestionnaire IA Studio ne devient pas, par sa seule orchestration, l’hébergeur ou le serveur des
octets. La qualification juridique plus large de cette facilitation n’est pas documentée par les
sources consultées. Il doit préserver la source et la licence, respecter les limites de service et
ne pas contourner un éventuel gating futur.

## Comparaison des scénarios A à E

| Scénario | Qui transmet les checkpoints à l’utilisateur ? | Analyse |
| --- | --- | --- |
| A — checkpoints dans IA Studio | IA Studio | redistribution directe ; obligations Apache et provenance à assumer |
| B — copie hébergée par IA Studio | IA Studio | redistribution directe ; mêmes enjeux, plus rôle d’hébergeur |
| C — téléchargement automatique depuis HF | Hugging Face, initié sans choix ponctuel | pas une copie hébergée par IA Studio, mais consentement et transparence plus faibles |
| D — page HF puis téléchargement manuel | Hugging Face, action entièrement sur son site | séparation la plus nette ; expérience utilisateur fragmentée |
| E — catalogue + clic Télécharger + URL HF | Hugging Face, à la demande explicite de l’utilisateur | architecture actuelle ; IA Studio ne sert pas les octets, qualification juridique plus large non tranchée |

L’épinglage de révision, le SHA-256, le stockage local et l’absence de modification améliorent la
reproductibilité et la sécurité. Ils ne changent pas l’identité de l’hébergeur et ne guérissent pas
un éventuel défaut de droits amont.

## Outputs : skeleton, skin weights et GLB

Ni la model card MIA, ni le papier, ni le README officiel, ni les conditions HF consultées
n’imposent de licence particulière aux rigs, skin weights ou GLB produits par inférence. Le papier
présente précisément la génération d’« animation assets » sans définir de restriction sur leur
exploitation.

Conclusion documentaire : **aucune restriction sur les outputs identifiée**. Leur usage commercial
et leur redistribution ne sont cependant pas confirmés explicitement par les auteurs : **NOT
DOCUMENTED**, avec un risque résiduel lié à la même provenance des checkpoints. Cette absence de
restriction n’est pas présentée comme une cession de droits.

## Matrice de risque

| Élément | Statut | Qualification | Pourquoi |
| --- | --- | --- | --- |
| Code MIA | CLEAR | EXPLICITLY ALLOWED | MIT officielle, notice requise |
| Checkpoints | UNCERTAIN | AMBIGUOUS | Apache-2.0 explicite, autorité amont non établie |
| Mécanisme de téléchargement HF | CLEAR | SUPPORTED BY HF | repository public non gated et mécanisme programmatique documenté |
| Usage commercial local | UNCERTAIN | AMBIGUOUS | permis par Apache si valide ; provenance Mixamo non clarifiée |
| Mixamo | HIGH RISK | EXPLICITLY FORBIDDEN pour ce type d’entraînement ; applicabilité factuelle AMBIGUOUS | clause AI/ML Adobe ; date/accord des auteurs inconnus ; inférence aval non documentée |
| 3DBiCar/RaBit | UNCERTAIN | NOT DOCUMENTED | aucune licence dataset publique trouvée |
| Outputs | UNCERTAIN | NOT DOCUMENTED / aucune restriction identifiée | aucune clause d’output trouvée, provenance amont non résolue |
| Redistribution par IA Studio | HIGH RISK, hors scénario | AMBIGUOUS | Apache la permettrait, mais la provenance devrait d’abord être clarifiée |

## Recommandation produit

**POSSIBLE BUT LEGALLY UNCERTAIN**

L’architecture suivante est matériellement distincte d’une copie hébergée et servie par IA Studio :
afficher MIA, laisser l’utilisateur cliquer, télécharger depuis le repository HF officiel, puis
exécuter localement. Les termes Apache déclarés et les fonctions publiques HF soutiennent ce
parcours. Aucune restriction explicite visant ce téléchargement ou cette inférence aval n’a été
identifiée, mais les sources ne tranchent pas toute qualification juridique de la facilitation.

La seule question décisive encore ouverte est :

> Les auteurs peuvent-ils confirmer et étayer qu’ils disposaient des autorisations nécessaires —
> notamment au regard de la restriction AI/ML Mixamo et des conditions non publiées de
> 3DBiCar/RaBit — pour placer ces quatre checkpoints sous Apache-2.0, autoriser leur usage commercial
> local et permettre l’exploitation commerciale des rigs générés ?

Une réponse écrite qui identifie l’autorisation ou la base de droits amont permettrait une nouvelle
évaluation vers **YES WITH NOTICES**. Une affirmation non étayée ou une simple répétition de
`license: apache-2.0` sans réponse sur Mixamo/RaBit ne lèverait pas cette incertitude.

## Message prêt à envoyer aux auteurs

> Subject: Commercial local use of Make-It-Animatable checkpoints downloaded from your official Hub
>
> Hello, we are evaluating Make-It-Animatable as an optional local Auto Rig backend in a paid
> desktop application. We do not bundle, mirror, host, or redistribute your checkpoints. Our app
> lists your official Hugging Face repository; after the user explicitly clicks Download, the four
> files `bw.pth`, `joints.pth`, `joints_coarse.pth`, and `pose.pth` are downloaded directly from
> your pinned Hugging Face revision to that user’s machine and used only for local inference.
>
> Could you confirm that (1) you authorize this commercial local-use scenario under the
> Apache-2.0 declaration, (2) you had the necessary permissions for the Mixamo and 3DBiCar/RaBit
> material used to train these checkpoints, including in light of Adobe’s Mixamo AI/ML restriction,
> and (3) users may commercially use and distribute the generated skeletons, skin weights, and
> rigged GLB files? We are not asking for permission to redistribute the checkpoints ourselves.

Personne n’a été contacté pendant cet audit.

## Sources primaires

Toutes les sources ont été consultées le **4 septembre 2026**.

| Source | Ce qu’elle établit | Ce qu’elle n’établit pas |
| --- | --- | --- |
| [MIA — model card, révision auditée](https://huggingface.co/jasongzy/Make-It-Animatable/blob/eb12b71253361fd1a7216625a95144af3c58263e/README.md) | métadonnées Apache-2.0 et Mixamo | chaîne de droits, termes d’outputs |
| [MIA — API de la révision](https://huggingface.co/api/models/jasongzy/Make-It-Animatable/revision/eb12b71253361fd1a7216625a95144af3c58263e) | révision, fichiers, public/non gated | validité juridique de la licence déclarée |
| [MIA — repository officiel épinglé](https://github.com/jasongzy/Make-It-Animatable/tree/d60cc7e01ff8da46448e458dbf450e8967b34e77) | code, pipeline Mixamo, ajout 3DBiCar riggé par Mixamo | accord Adobe/RaBit |
| [MIA — licence du code](https://github.com/jasongzy/Make-It-Animatable/blob/d60cc7e01ff8da46448e458dbf450e8967b34e77/LICENSE) | licence MIT du code | licence des poids |
| [Papier MIA, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/papers/Guo_Make-It-Animatable_An_Efficient_Framework_for_Authoring_Animation-Ready_3D_Characters_CVPR_2025_paper.pdf) | entraînement sur 95 personnages et 2 453 mouvements Mixamo | permission contractuelle d’entraînement |
| [Adobe — conditions additionnelles Mixamo](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Mixamo-Addl-Terms-en_US-20210623.pdf) | interdiction explicite AI/ML depuis le 23 juin 2021 | traitement des destinataires aval de poids |
| [Adobe — FAQ Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | usages commerciaux d’œuvres finales autorisés | ML, poids, outputs de modèles |
| [Adobe — conditions générales, page vivante](https://www.adobe.com/legal/terms.html) | règles consultées à la date d’audit sur modification/incorporation et assets autonomes | conditions applicables historiquement aux auteurs MIA |
| [RaBit — repository officiel épinglé](https://github.com/zhongjinluo/RaBit/tree/169fdbafe62863db01eae02b1c1f4cec6140753b) | origine et composition de 3DBiCar ; absence de licence à la racine | droits commerciaux/ML |
| [3DBiCar — page officielle](https://gaplab.cuhk.edu.cn/projects/RaBit/dataset.html) | lien de téléchargement du dataset | licence et conditions d’utilisation |
| [Papier RaBit, CVPR 2023](https://openaccess.thecvf.com/content/CVPR2023/papers/Luo_RaBit_Parametric_Modeling_of_3D_Biped_Cartoon_Characters_With_a_CVPR_2023_paper.pdf) | création et usages scientifiques du dataset | octroi d’une licence commerciale |
| [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.html) | droits accordés, obligations, limites | autorité factuelle de l’uploader MIA |
| [Hugging Face — licences des repositories](https://huggingface.co/docs/hub/repositories-licenses) | rôle du champ licence d’une card | vérification des droits du créateur |
| [Hugging Face — téléchargement](https://huggingface.co/docs/hub/models-downloading) | clients et téléchargements programmatiques officiels | licence propre de MIA |
| [Hugging Face — API Hub](https://huggingface.co/docs/hub/api) | endpoints ouverts et rate limits | autorisation sur les datasets amont |
| [Hugging Face — modèles gated](https://huggingface.co/docs/hub/models-gated) | consentement navigateur requis uniquement si gated | chaîne de droits MIA |
| [Hugging Face — conditions de service](https://huggingface.co/terms-of-service) | repositories publics, maintien des licences, risque utilisateur | garantie de non-contrefaçon du contenu |

## État de vérification documentaire

- **VÉRIFIÉ** : révision, métadonnées, liste de fichiers, absence de `LICENSE`/`NOTICE`, état public
  non gated, réponse HTTP publique, conditions Apache, Adobe, HF et sources MIA/RaBit.
- **NON APPLICABLE** : exécution de blocs ; le seul bloc est explicitement illustratif.
- **NON VÉRIFIABLE** : autorisations privées éventuellement obtenues par les auteurs MIA et termes
  non publiés de 3DBiCar/RaBit.

Les deux points non vérifiables constituent le blocker documentaire du verdict.
