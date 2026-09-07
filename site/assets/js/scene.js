/* =========================================================================
   Champ de particules — fond fixe de toute la page

   Le canevas ne défile pas : il reste en place et c'est le champ qui réagit.

   Les particules ne s'éteignent jamais : elles changent de rôle.
     · héros    une coquille sphérique au-dessus de la grille du viewport
     · lecture  un champ large et profond qui occupe toute la page, creusé
                au centre pour laisser passer le texte

   Et surtout, le champ s'écarte du contenu : quand une capture arrive au
   centre de l'écran, un trou s'ouvre autour d'elle et les particules
   glissent sur ses bords. La mise en page écrit cette valeur dans
   window.__fxHole, lue ici à chaque image.

   Le passage de l'un à l'autre suit le scroll sur la première hauteur
   d'écran. Ensuite, seule la vitesse de défilement fait bouger le champ :
   chaque particule a son propre retard, ce qui creuse la profondeur.

   Les tailles sont réparties en loi de puissance : beaucoup de très
   petites, quelques grosses en avant-plan. C'est ce qui donne l'échelle.
   ========================================================================= */

import * as THREE from 'three';

var canvas = document.getElementById('scene');
if (canvas) {

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.innerWidth < 760;

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.25 : 1.6));
  /* Depuis three 0.152 la sortie est convertie en sRGB par défaut, ce qui éclaircirait
     ces grains additifs déjà réglés à l'œil. On garde la sortie linéaire d'origine : le
     champ rend exactement ce qu'il rendait, la version seule a changé. */
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(58, 1, 0.1, 320);
  camera.position.set(0, 5.2, 26);

  var world = new THREE.Group();
  scene.add(world);

  /* -------------------------------------------- grille, propre au héros */

  /* Les couleurs peintes ici sont les mêmes que celles du CSS, et le sont en le lisant :
     une valeur recopiée dériverait au premier changement de palette. */
  var token = function (name) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new THREE.Color(value || '#000000');
  };
  var ACCENT = token('--accent');

  var grid = new THREE.GridHelper(240, 120, token('--edge'), token('--panel'));
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.position.y = -6;
  world.add(grid);

  /* ------------------------------------------------------ les particules */

  var COUNT = small ? 1400 : 3000;
  var shell = new Float32Array(COUNT * 3);   /* état héros */
  var field = new Float32Array(COUNT * 3);   /* état lecture */
  var live = new Float32Array(COUNT * 3);    /* positions envoyées au GPU */
  var aSize = new Float32Array(COUNT);
  var aAlpha = new Float32Array(COUNT);
  var aLag = new Float32Array(COUNT);
  var seed = new Float32Array(COUNT);

  var R = 9.4;                 /* rayon de la coquille */
  var FW = 88, FH = 40, FD = 54;  /* largeur, hauteur, profondeur du champ */

  for (var i = 0; i < COUNT; i++) {
    var k = i * 3;

    /* coquille : distribution sphérique uniforme, légèrement bruitée */
    var u = Math.random() * 2 - 1;
    var th = Math.random() * Math.PI * 2;
    var s = Math.sqrt(1 - u * u);
    var r = R * (0.82 + Math.random() * 0.18);
    shell[k] = s * Math.cos(th) * r;
    shell[k + 1] = u * r * 0.86;
    shell[k + 2] = s * Math.sin(th) * r;

    /* champ : densité repoussée vers les bords, le centre reste lisible */
    var side = Math.random() < 0.5 ? -1 : 1;
    /* densité creusée au centre : c'est ce qui garde la colonne de texte
       lisible sans avoir à éteindre les particules */
    var push = 0.34 + 0.66 * Math.sqrt(Math.random());
    field[k] = side * push * FW * 0.5;
    field[k + 1] = (Math.random() * 2 - 1) * FH * 0.5;
    field[k + 2] = 6 - Math.random() * FD;

    /* beaucoup de poussière, quelques grains en avant-plan */
    aSize[i] = 1.0 + Math.pow(Math.random(), 2.6) * 5.4;
    aAlpha[i] = 0.26 + Math.random() * 0.74;
    aLag[i] = 0.22 + Math.random() * 0.78;
    seed[i] = Math.random() * Math.PI * 2;

    live[k] = shell[k]; live[k + 1] = shell[k + 1]; live[k + 2] = shell[k + 2];
  }

  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(live, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
  geo.setAttribute('aLag', new THREE.BufferAttribute(aLag, 1));

  var uniforms = {
    uColor:   { value: ACCENT },
    uOpacity: { value: 1 },
    uSize:    { value: 1 },
    uFlow:    { value: 0 },
    uHole:    { value: new THREE.Vector3(23, 12.5, 0) },  /* rayon x, rayon y, force */
    uPix:     { value: renderer.getPixelRatio() }
  };

  var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: [
      'attribute float aSize;',
      'attribute float aAlpha;',
      'attribute float aLag;',
      'uniform float uFlow;',
      'uniform float uPix;',
      'uniform float uSize;',
      'uniform vec3 uHole;',
      'varying float vA;',
      'void main() {',
      '  vec3 p = position;',
      '  p.y += uFlow * aLag;',                    /* retard propre à chaque grain */
      /* écartement autour du contenu : les grains contournent le cadre */
      '  float k = length(p.xy / vec2(uHole.x, uHole.y));',
      '  float f = 1.0 - smoothstep(0.0, 1.7, k);',
      '  vec2 dir = length(p.xy) > 0.0001 ? normalize(p.xy) : vec2(1.0, 0.0);',
      '  p.xy += dir * uHole.z * f * (0.55 + 0.45 * aLag);',
      '  p.z -= uHole.z * f * 0.35;',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  float d = max(-mv.z, 0.001);',
      '  gl_PointSize = aSize * uSize * uPix * (26.0 / d);',
      '  gl_Position = projectionMatrix * mv;',
      '  vA = aAlpha * smoothstep(165.0, 14.0, d);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision mediump float;',
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'varying float vA;',
      'void main() {',
      '  vec2 c = gl_PointCoord - 0.5;',
      '  float dd = dot(c, c);',
      '  if (dd > 0.25) discard;',
      '  float a = smoothstep(0.25, 0.0, dd);',    /* disque doux, pas de carré */
      '  gl_FragColor = vec4(uColor, a * vA * uOpacity);',
      '}'
    ].join('\n')
  });

  var points = new THREE.Points(geo, material);
  points.position.y = 1.4;
  world.add(points);

  /* structure filaire, uniquement dans l'état héros */
  var wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(6.2, 1)),
    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16 })
  );
  wire.position.copy(points.position);
  world.add(wire);

  /* ------------------------------------------------------------- état */

  var pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 };
  var lastY = window.scrollY, flow = 0, morph = 0, hole = 0;
  var t0 = performance.now();

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    uniforms.uPix.value = renderer.getPixelRatio();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  window.addEventListener('pointermove', function (e) {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  function build(t) {
    var m = morph;
    var sway = 0.9 + 1.5 * m;   /* le champ ondule plus large que la coquille */
    for (var i = 0; i < COUNT; i++) {
      var k = i * 3, sd = seed[i];
      var breathe = Math.sin(t * 0.5 + sd) * 0.28;
      var g = 1 + breathe * 0.055 * (1 - m);

      var sx = shell[k] * g;
      var sy = shell[k + 1] * g + breathe * 0.34;
      var sz = shell[k + 2] * g;

      /* deux fréquences décalées : la dérive ne se referme jamais sur
         elle-même, donc rien ne paraît bouclé */
      var wx = Math.sin(t * 0.16 + sd) * sway + Math.sin(t * 0.069 + sd * 2.3) * sway * 0.55;
      var wy = Math.cos(t * 0.125 + sd * 1.7) * sway * 0.42 + Math.sin(t * 0.052 + sd * 0.7) * sway * 0.3;
      var wz = Math.sin(t * 0.088 + sd * 1.3) * sway * 0.45;

      live[k]     = sx + (field[k] - sx) * m + wx;
      live[k + 1] = sy + (field[k + 1] - sy) * m + wy;
      live[k + 2] = sz + (field[k + 2] - sz) * m + wz * m;
    }
    geo.attributes.position.needsUpdate = true;
  }

  function render(now) {
    var t = (now - t0) * 0.001;
    var vh = window.innerHeight;

    /* passage héros -> lecture sur la première hauteur d'écran */
    morph = smooth(clamp(window.scrollY / vh, 0, 1));

    /* réaction à la vitesse de défilement : le champ traîne, puis revient */
    var y = window.scrollY;
    var target_flow = clamp(-(y - lastY) * 0.020, -1.5, 1.5);
    lastY = y;
    flow += (target_flow - flow) * 0.055;
    uniforms.uFlow.value = flow;

    pointer.x += (target.x - pointer.x) * 0.045;
    pointer.y += (target.y - pointer.y) * 0.045;

    build(t);

    /* elles ne disparaissent pas : elles s'affinent. 100 % -> 64 % d'opacité,
       et des grains plus petits, pour rester présentes sans peser. */
    uniforms.uOpacity.value = 1 - 0.36 * morph;
    uniforms.uSize.value = 1 - 0.26 * morph;

    hole += ((window.__fxHole || 0) - hole) * 0.055;
    uniforms.uHole.value.z = hole * 7.5;

    grid.material.opacity = 0.5 * (1 - morph);
    grid.visible = morph < 0.99;
    wire.material.opacity = 0.16 * (1 - morph);
    wire.visible = morph < 0.99;
    wire.rotation.y = -t * 0.07;
    wire.rotation.x = t * 0.03;

    world.rotation.y = (1 - morph) * (t * 0.045) + pointer.x * (0.16 - 0.11 * morph);
    world.rotation.x = pointer.y * (0.06 - 0.04 * morph);

    camera.position.y = 5.2 * (1 - morph) - pointer.y * 1.1;
    camera.position.z = 26 + morph * 9;
    camera.lookAt(0, 1.2 * (1 - morph), 0);

    renderer.render(scene, camera);
  }

  if (reduced) {
    morph = 1;
    uniforms.uOpacity.value = 0.55;
    uniforms.uSize.value = 0.74;
    grid.visible = false; wire.visible = false;
    build(0);
    renderer.render(scene, camera);
    window.addEventListener('resize', function () { resize(); renderer.render(scene, camera); }, { passive: true });
  } else {
    (function loop(now) {
      requestAnimationFrame(loop);
      if (document.hidden) return;
      render(now || performance.now());
    })();
  }
}
