Source : https://github.com/nv-tlabs/kimodo
Commit : 1aece8c124d73d255ceff5086d983b844c9f4e94

Sous-ensemble inference SOMA. Pas de demo ni serveur ni poids distants.
Initialisations publiques reduites ; assets squelettes fournis par upstream.

Modifications IA Studio : encodeur bidirectionnel Llama uniquement ; branches Mistral,
Gemma et Qwen supprimees. Modules de telechargement, API distante, registres de
modeles, TMR public et export BVH non atteints retires. Le lecteur de checkpoints
n'accepte que les fichiers safetensors locaux, sans fallback pickle.
Aucune construction dynamique Hydra n'est utilisee : les classes SOMA, Kimodo et
TwostageDenoiser sont instanciees explicitement par motion/plugin.py. OmegaConf
reste requis par le backbone pour reconnaitre ListConfig. Le garde des imports
part de cette entree et n'accorde aucune exception de reachabilite a Kimodo.
Pydantic reste requis par les dataclasses de configuration du backbone ; la
verification d'import couvre TwostageDenoiser, KimodoMotionRep, SOMASkeleton30 et
l'encodeur Llama, avec imports Hydra explicitement refuses pendant le smoke test.
