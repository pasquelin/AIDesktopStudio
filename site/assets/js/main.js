/* =========================================================================
   Moteur de mouvement
   Une seule boucle rAF, lecture des positions puis écriture des styles :
   jamais de lecture après écriture, donc pas de recalcul de mise en page.

   Vocabulaire du balisage :
     data-fx                 élément animé
       data-speed="0.10"     parallaxe verticale, en fraction de hauteur d'écran
                             positif = l'élément traîne, négatif = il devance
       data-speedx="0.02"    parallaxe horizontale, même échelle
       data-rise="30"        décalage d'entrée vertical, en pixels
       data-shift="-24"      décalage d'entrée horizontal, en pixels
       data-zoom="0.04"      échelle d'entrée
       data-delay="120"      retard en ms
     data-split              titre révélé mot à mot, derrière un masque
     data-stagger            les enfants directs entrent en cascade
       data-stagger-rise     décalage vertical appliqué à la cascade
       data-stagger-shift    décalage horizontal appliqué à la cascade
     data-depth              image qui glisse dans son cadre (profondeur)
     data-stage              scène épinglée qui s'ouvre au scroll
   ========================================================================= */

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');
  root.classList.add('fx-ready');

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var out = function (t) { return 1 - Math.pow(1 - t, 4); };   /* départ franc, dépôt lent */
  var DUR = 1000;
  var cube = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* ------------------------------------------------- découpage des titres */

  Array.prototype.forEach.call(document.querySelectorAll('[data-split]'), function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (w, i) {
      var mask = document.createElement('span');
      mask.className = 'sw';
      var inner = document.createElement('i');
      inner.textContent = w;
      mask.appendChild(inner);
      el.appendChild(mask);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });

  /* -------------------------------------------------- collecte des cibles */

  var items = [];

  function register(el, extra) {
    var d = el.dataset;
    var still = el.hasAttribute('data-still');   /* parallaxe seule, sans fondu */
    items.push({
      el: el,
      still: still,
      speed: parseFloat(d.speed || 0),
      speedx: parseFloat(d.speedx || 0),
      rise: still ? 0 : (extra && extra.rise !== undefined ? extra.rise
            : (d.rise !== undefined ? parseFloat(d.rise) : 26)),
      shift: still ? 0 : (extra && extra.shift !== undefined ? extra.shift
             : parseFloat(d.shift || 0)),
      line: el.classList.contains('eyebrow'),
      zoom: parseFloat(d.zoom || 0),
      delay: (extra && extra.delay) || parseFloat(d.delay || 0),
      words: el.hasAttribute('data-split')
        ? Array.prototype.slice.call(el.querySelectorAll('.sw > i'))
        : null,
      t0: 0,
      done: false
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-fx]'), function (el) { register(el); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-stagger]'), function (parent) {
    var step = parseFloat(parent.dataset.stagger) || 70;
    var shift = parseFloat(parent.dataset.staggerShift || 0);
    var rise = parent.dataset.staggerRise !== undefined ? parseFloat(parent.dataset.staggerRise) : 26;
    Array.prototype.forEach.call(parent.children, function (child, i) {
      if (child.hasAttribute('data-fx')) return;
      child.setAttribute('data-fx', '');
      child.style.opacity = '0';
      register(child, { delay: i * step, shift: shift, rise: rise });
    });
  });

  var depths = Array.prototype.map.call(document.querySelectorAll('[data-depth]'), function (img) {
    return { img: img, box: img.closest('.frame') || img.parentElement };
  });

  /* ------------------------------------------------------------ héros */

  var heroWrap = document.querySelector('.hero .wrap');
  var veil = document.getElementById('veil');

  /* Le champ de particules lit cette valeur pour s'écarter du contenu :
     0 = champ au repos, 1 = trou grand ouvert autour de la capture centrée.
     Écrit ici parce que c'est la mise en page qui sait où sont les cadres. */
  window.__fxHole = 0;
  var smooth = function (t) { return t * t * (3 - 2 * t); };

  /* --------------------------------------------------- scène épinglée */

  var stage = document.querySelector('[data-stage]');
  var stagePin = stage && stage.querySelector('.stage__pin');
  var stageFrame = stage && stage.querySelector('.stage__frame');
  var stageImg = stageFrame && stageFrame.querySelector('img');
  var wide = window.matchMedia('(min-width: 861px)');

  /* --------------------------------------------- onglets & barre de statut */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  var sections = tabs
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  var elTime = document.querySelector('[data-timecode]');
  var elCur = document.querySelector('[data-current]');
  var elProgress = document.querySelector('.progress');

  function setActive(id) {
    tabs.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + id;
      a.setAttribute('aria-current', on ? 'true' : 'false');
      if (on && elCur && elCur.textContent !== a.dataset.tab) elCur.textContent = a.dataset.tab;
    });
  }

  if ('IntersectionObserver' in window && sections.length) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.intersectionRatio; });
      var best = null, top = 0;
      Object.keys(seen).forEach(function (id) { if (seen[id] > top) { top = seen[id]; best = id; } });
      if (best) setActive(best);
    }, { threshold: [0, .1, .25, .5, .75], rootMargin: '-14% 0px -34% 0px' });
    sections.forEach(function (s) { io.observe(s); });
  }

  tabs.forEach(function (a) {
    a.addEventListener('click', function () {
      setTimeout(function () {
        a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }, 60);
    });
  });

  var FPS = 25, TOTAL = 60 * FPS;
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function timecode(p) {
    var f = Math.round(p * TOTAL);
    return '00:' + pad(Math.floor(f / (60 * FPS))) + ':' + pad(Math.floor(f / FPS) % 60) + ':' + pad(f % FPS);
  }

  /* ------------------------------------------------- bandeau horizontal */
  /* Le contenu est dupliqué : translater de 50 % de la largeur totale
     revient exactement sur la première copie, donc pas de couture. */

  var ticker = document.querySelector('[data-ticker]');
  var tickerRow = ticker && ticker.querySelector('.ticker__row');

  /* ---------------------------------------------------------- boucle */

  if (reduced) {
    items.forEach(function (it) { it.el.style.opacity = '1'; it.el.style.transform = 'none'; });
    var maxR = document.documentElement.scrollHeight - window.innerHeight;
    if (elTime) elTime.textContent = timecode(maxR > 0 ? clamp(window.scrollY / maxR, 0, 1) : 0);
  } else {
  var reads = [];

  function readFrame(vh) {
    reads.length = 0;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      reads.push(item.done && !item.speed ? null : item.el.getBoundingClientRect());
    }
    var dRects = [];
    for (var j = 0; j < depths.length; j++) dRects.push(depths[j].box.getBoundingClientRect());
    var scrollY = window.scrollY;
    var maxScroll = document.documentElement.scrollHeight - vh;
    return {
      dRects: dRects,
      scrollY: scrollY,
      page: maxScroll > 0 ? clamp(scrollY / maxScroll, 0, 1) : 0,
      stageRect: stage ? stage.getBoundingClientRect() : null,
      pinH: stagePin ? stagePin.offsetHeight : 0,
      stageH: stage ? stage.offsetHeight : 0
    };
  }

  function transformItem(item, e, parx, par, now) {
    if (item.line && e > 0.05) item.el.classList.add('is-in');
    if (item.words) {
      for (var w = 0; w < item.words.length; w++) {
        var ew = item.t0 ? out(clamp((now - item.t0 - w * 42) / DUR, 0, 1)) : 0;
        item.words[w].style.transform = 'translate3d(0,' + ((1 - ew) * 105).toFixed(2) + '%,0)';
      }
      if (item.speed || item.speedx) {
        item.el.style.transform = 'translate3d(' + parx.toFixed(2) + 'px,' + par.toFixed(2) + 'px,0)';
      }
      return;
    }
    var y = par + (1 - e) * item.rise;
    var x = parx + (1 - e) * item.shift;
    var sc = item.zoom ? (1 - item.zoom * (1 - e)) : 1;
    item.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)' +
      (item.zoom ? ' scale(' + sc.toFixed(4) + ')' : '');
    if (!item.still) item.el.style.opacity = e.toFixed(3);
  }

  function animateItem(item, rect, now, vh) {
    if (!rect) return;
    if (rect.bottom < -260 || rect.top > vh + 260) {
      if (rect.bottom < 0 && !item.t0) item.t0 = now - 4000;
      return;
    }
    if (!item.t0 && rect.top < vh * 0.9 && rect.bottom > vh * 0.02) item.t0 = now + item.delay;
    var e = item.t0 ? out(clamp((now - item.t0) / DUR, 0, 1)) : 0;
    if (e === 1 && (!item.words || now - item.t0 > DUR + item.words.length * 42)) item.done = true;
    var off = (rect.top + rect.height / 2 - vh / 2) / (vh + rect.height);
    var par = -off * item.speed * vh * 1.6;
    var parx = -off * item.speedx * vh * 1.6;
    if (item.px === undefined) { item.px = parx; item.py = par; }
    item.px += (parx - item.px) * 0.11;
    item.py += (par - item.py) * 0.11;
    transformItem(item, e, item.px, item.py, now);
  }

  function animateItems(now, vh) {
    for (var i = 0; i < items.length; i++) animateItem(items[i], reads[i], now, vh);
  }

  function animateDepths(dRects, vh) {
    for (var d = 0; d < depths.length; d++) {
      var rect = dRects[d];
      if (rect.bottom < -200 || rect.top > vh + 200) continue;
      var off = (rect.top + rect.height / 2 - vh / 2) / (vh + rect.height);
      var amp = depths[d].img.offsetHeight * 0.052;
      depths[d].img.style.transform =
        'translate3d(0,' + (off * amp * 2).toFixed(2) + 'px,0) scale(1.115)';
    }
  }

  function animateHero(scrollY, vh) {
    if (!heroWrap) return;
    var hp = clamp(scrollY / vh, 0, 1);
    heroWrap.style.transform = 'translate3d(0,' + (hp * 90).toFixed(1) + 'px,0)';
    heroWrap.style.opacity = clamp(1 - hp * 1.35, 0, 1).toFixed(3);
    if (veil) veil.style.opacity = smooth(hp).toFixed(3);
  }

  function frameHole(dRects, vh) {
    var hole = 0;
    for (var i = 0; i < dRects.length; i++) {
      var rect = dRects[i];
      if (rect.bottom < 0 || rect.top > vh) continue;
      var centred = 1 - Math.min(1, Math.abs(rect.top + rect.height / 2 - vh / 2) / (vh * 0.75));
      if (centred > hole) hole = centred;
    }
    return hole;
  }

  function animateStage(frame, vh) {
    if (stage && stageFrame && wide.matches && frame.stageH > frame.pinH) {
      var q = clamp(-frame.stageRect.top / (frame.stageH - frame.pinH), 0, 1);
      var opened = cube(clamp(q / 0.78, 0, 1));
      var scale = 0.60 + 0.40 * opened;
      stageFrame.style.transform = 'scale(' + scale.toFixed(4) + ')';
      stageFrame.style.borderRadius = (30 - 17 * opened).toFixed(1) + 'px';
      if (stageImg) stageImg.style.transform = 'scale(' + (1.10 - 0.10 * opened).toFixed(4) + ')';
      return opened * Math.min(
        clamp((vh - frame.stageRect.top) / (vh * 0.5), 0, 1),
        clamp(frame.stageRect.bottom / (vh * 0.8), 0, 1)
      );
    }
    if (stageFrame && !wide.matches) {
      stageFrame.style.transform = '';
      stageFrame.style.borderRadius = '';
      if (stageImg) stageImg.style.transform = '';
    }
    return 0;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) return;

    var vh = window.innerHeight;

    var frame = readFrame(vh);

    animateItems(now, vh);

    animateDepths(frame.dRects, vh);

    animateHero(frame.scrollY, vh);

    window.__fxHole = Math.max(animateStage(frame, vh), frameHole(frame.dRects, vh) * 0.42);

    /* ---- bandeau horizontal : dérive lente + poussée du scroll ---- */
    if (tickerRow) {
      var tx = (now * 0.0015 + frame.scrollY * 0.018) % 50;
      tickerRow.style.transform = 'translate3d(' + (-tx).toFixed(3) + '%,0,0)';
    }

    /* ---- barre de statut ---- */
    if (elTime) elTime.textContent = timecode(frame.page);
    if (elProgress) elProgress.style.transform = 'scaleX(' + frame.page + ')';
  }

  requestAnimationFrame(loop);

  /* --------------------------------------------------- version publiée */
  /* `assets/release.json` est écrit par la chaîne de publication au moment du tag :
     le site n'a donc aucun numéro de version ni aucun nom de fichier en dur, et rien
     à rééditer à la main. Le fichier ABSENT est le cas normal tant qu'aucune version
     n'est sortie — les cartes gardent alors ce que le HTML porte. */

  /* Relatif à la RACINE du site, pas à la page : `/AIDesktopStudio/fr/` aurait demandé
     `/AIDesktopStudio/fr/assets/release.json`, qui n'existe pas. Le gabarit pose la racine
     sur <html>, parce que lui seul sait à quelle profondeur la page est rendue. */
  var root = document.documentElement.dataset.root || '';

  fetch(root + 'assets/release.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (release) {
      if (!release || !release.tag) return;

      var tag = document.querySelector('[data-release-tag]');
      if (tag) {
        var dot = tag.querySelector('.dot');
        tag.textContent = release.tag;
        if (dot) tag.insertBefore(dot, tag.firstChild);
      }

      Array.prototype.forEach.call(document.querySelectorAll('[data-dl]'), function (card) {
        var asset = (release.assets || {})[card.dataset.dl];
        var state = card.querySelector('.state');
        if (!asset || !asset.url) {
          if (state) state.textContent = 'Non publié pour cette version';
          return;
        }
        card.href = asset.url;
        card.setAttribute('download', '');
        if (state) state.textContent = asset.size ? 'Télécharger · ' + asset.size : 'Télécharger';
      });
    })
    .catch(function () { /* pas de version publiée, ou hors ligne : le HTML fait foi */ });
}
