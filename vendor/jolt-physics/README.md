# jolt-physics, recompilé

Ce paquet n'est pas celui de npm. Il porte **le même code**, à la révision épinglée par
`artefact.json`, compilé avec deux drapeaux que les publications mono-thread de l'amont ne
passent pas :

- **`-DENABLE_SIMD=ON`** — les flavours mono-thread publiées sont compilées SANS SIMD (`build.sh`
  ne le passe qu'à la cible multi-thread, et le `README` amont le dit). Mesuré le 2026-09-01 : le
  binaire npm est **2,7 fois plus lent**, ce qui est toute la différence entre passer la porte de
  bascule et la manquer.
- **`-DALLOW_MEMORY_GROWTH=ON`** — sans lui le tas WebAssembly est figé à 128 Mo et un dépassement
  **abort** le moteur, ce qui est un crash dur dans un éditeur. Coût mesuré sur la série
  d'échelle : entre −4,4 % et +1,5 %, donc sous le bruit.

Rien ici ne s'écrit à la main. `node scripts/build-jolt.mjs` régénère `dist/` et `artefact.json`,
et `main/joltArtefact.test.ts` rougit si l'empreinte ne correspond plus.

Licence MIT, celle de l'amont, dans `LICENSE`.
