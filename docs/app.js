const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Glass header on every page; parallax on the home hero and on inner page heroes.
const header = $('.site-header');
const homeHero = $('.hero');
const hero = homeHero || $('.page-hero');
let ticking = false;
function onScroll() {
  ticking = false;
  header.classList.toggle('is-scrolled', scrollY > 24);
  // On the home page the quick-contact bar would cover the hero's own buttons, so it appears after the first screen.
  if (homeHero) document.body.classList.toggle('at-top', scrollY < innerHeight * 0.6);
  if (hero && !reducedMotion && scrollY < hero.offsetHeight * 1.2) hero.style.setProperty('--p', Math.min(1, Math.max(0, scrollY / (hero.offsetHeight || 1))).toFixed(3));
}
const requestScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
// Resize too: a page opened in a hidden or collapsed window starts with a zero-height viewport.
if (header) { onScroll(); addEventListener('scroll', requestScroll, {passive:true}); addEventListener('resize', requestScroll); }

// Mega-menu thumbnails load on the first hover or keyboard focus of their menu.
$$('.has-sub').forEach(item => {
  const load = () => $$('img[data-src]', item).forEach(img => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
  item.addEventListener('pointerenter', load, {once:true});
  item.addEventListener('focusin', load, {once:true});
});

// The blurred surround reuses the photograph already loaded by picture.
// No CSS background downloads for all offscreen catalog cards.
$$('.photographic-surface').forEach(surface => {
  const image=$('picture img',surface);
  if (!image) return;
  const sync=()=>{if(image.naturalWidth) surface.style.setProperty('--photograph', `url(${JSON.stringify(image.currentSrc||image.src)})`)};
  image.addEventListener('load',sync);
  if(image.complete) sync();
});

// Pointer spotlight on photo cards (mouse only).
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  $$('[data-spotlight]').forEach(card => card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));
}

// Mobile menu.
const toggle = $('.menu-toggle');
const nav = $('#site-nav');
const menuBackground = new Map();
function setMenu(open, {restoreFocus=true}={}) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
  nav.classList.toggle('is-open', open);
  header.classList.toggle('menu-active', open);
  document.body.classList.toggle('nav-open', open);
  if (open) {
    for (const el of $$('main,.site-footer,.mobile-contact,.site-header .brand,.header-call')) {
      if (!menuBackground.has(el)) menuBackground.set(el, el.inert);
      el.inert = true;
    }
    nav.inert = false;
    const focusMenu = () => {
      if (!nav.classList.contains('is-open')) return;
      const first=$('.nav-link',nav);
      if (!first || getComputedStyle(first).visibility !== 'visible') { requestAnimationFrame(focusMenu); return; }
      first.focus({preventScroll:true});
      if (document.activeElement!==first) requestAnimationFrame(focusMenu);
    };
    requestAnimationFrame(focusMenu);
  } else {
    for (const [el, inert] of menuBackground) el.inert = inert;
    menuBackground.clear();
    nav.inert = !matchMedia('(min-width:1080px)').matches;
    if (restoreFocus) toggle.focus({preventScroll:true});
  }
}
if (toggle && nav) {
  nav.inert = !matchMedia('(min-width:1080px)').matches;
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false, {restoreFocus:false}); });
  document.addEventListener('keydown', e => {
    if (!nav.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); setMenu(false); }
    if (e.key === 'Tab') {
      const items=[...$$('a[href]:not([tabindex="-1"]),button:not([disabled])',nav),toggle].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
      const index=items.indexOf(document.activeElement);
      if (index===-1 || (!e.shiftKey&&index===items.length-1) || (e.shiftKey&&index===0)) {
        e.preventDefault(); items[e.shiftKey?items.length-1:0]?.focus();
      }
    }
  });
  matchMedia('(min-width:1080px)').addEventListener('change', () => {
    const inside=nav.contains(document.activeElement);
    setMenu(false,{restoreFocus:false});
    if (nav.inert&&inside) toggle.focus({preventScroll:true});
  });
}

// Keep fixed contact actions clear of page controls. Observe only the bottom strip;
// IntersectionObserver avoids scanning the whole document on every scroll frame.
const contactBar = $('.mobile-contact');
let contactObserver;
function protectPageControls() {
  contactObserver?.disconnect();
  contactBar?.classList.remove('is-obstructing');
  if (!contactBar || innerWidth >= 900 || !('IntersectionObserver' in window)) return;
  const intersecting = new Set();
  contactObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? intersecting.add(entry.target) : intersecting.delete(entry.target));
    contactBar.classList.toggle('is-obstructing', intersecting.size > 0);
  }, {rootMargin:`-${Math.max(0, innerHeight - 100)}px 0px 0px 0px`,threshold:0});
  $$('main a,main button,main input,main select,main summary,main video,.site-footer a').forEach(el=>contactObserver.observe(el));
}
protectPageControls();
addEventListener('resize', protectPageControls);

// Căutarea soiurilor rămâne independentă de cea a categoriilor.
const varietyCategory=$('#variety-category'),varietySearch=$('#variety-search');
function filterVarieties(){
 const category=varietyCategory.value,term=normalize(varietySearch.value);let count=0;
 $$('[data-product-category]').forEach(card=>{card.hidden=!((category==='Toate'||card.dataset.productCategory===category)&&normalize(card.dataset.productName).includes(term));if(!card.hidden)count++;});
 $('#filter-status').textContent=count?`${count} rezultate.`:'Nu am găsit soiul. Încearcă alt nume sau toate categoriile.';
}
varietyCategory?.addEventListener('change',filterVarieties);varietySearch?.addEventListener('input',filterVarieties);

const speciesSearch = $('#species-search');
const speciesFilters = $$('[data-species-filter]');
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
let speciesGroup = 'toate';
function filterSpecies() {
  const term = normalize(speciesSearch.value);
  let count = 0;
  $$('[data-species-card]').forEach(card => {
    card.hidden = !(normalize(card.dataset.name).includes(term) && (speciesGroup === 'toate' || card.dataset.speciesGroup === speciesGroup));
    if (!card.hidden) count++;
  });
  $$('[data-species-section]').forEach(section => { section.hidden = !section.querySelector('[data-species-card]:not([hidden])'); });
  speciesFilters.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.speciesFilter === speciesGroup)));
  $('#species-status').textContent = `${count} ${count === 1 ? 'plantă' : 'plante'} · informații de cultivare`;
  $('#species-empty').hidden = count > 0;
}
if (speciesSearch) {
  speciesSearch.addEventListener('input', filterSpecies);
  speciesFilters.forEach(btn => btn.addEventListener('click', () => { speciesGroup = btn.dataset.speciesFilter; filterSpecies(); }));
  // A collection link must remain usable after a search hid that section.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const destination = new URL(link.href);
    if (destination.pathname !== location.pathname || !destination.hash) return;
    const section = document.getElementById(destination.hash.slice(1));
    if (!section?.hasAttribute('data-species-section')) return;
    speciesSearch.value = '';
    speciesGroup = 'toate';
    filterSpecies();
  });
}

// Photo gallery: group filters and lightbox.
const galleryFilters = $$('[data-gallery-filter]');
const photos = $$('[data-photo]');
galleryFilters.forEach(btn => btn.addEventListener('click', () => {
  const group = btn.dataset.galleryFilter;
  photos.forEach(item => { item.hidden = group !== 'toate' && item.dataset.group !== group; });
  galleryFilters.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  $('#gallery-status').textContent = `${photos.filter(p => !p.hidden).length} fotografii afișate.`;
}));
const dialog = $('#photo-dialog');
if (dialog) {
  let index = 0;
  let opener = null;
  const thumbnails = $$('[data-photo-index]');
  const rail = $('.photo-thumbnails');
  const visible = () => photos.filter(p => !p.hidden);
  const show = i => {
    const list = visible(); index = (i + list.length) % list.length;
    const btn = list[index], image = $('#expanded-photo');
    const stage = $('.photo-stage');
    stage.classList.remove('is-zoomed');
    const zoomButton = $('.photo-zoom');
    if (zoomButton) { zoomButton.setAttribute('aria-pressed','false'); zoomButton.setAttribute('aria-label','Mărește detaliile'); zoomButton.textContent='+'; }
    stage.setAttribute('aria-busy','true');
    image.onload = image.onerror = () => stage.setAttribute('aria-busy','false');
    image.src = btn.dataset.photo; image.alt = btn.querySelector('img').alt;
    $('#photo-caption').textContent = btn.dataset.caption;
    $('#photo-count').textContent = `${index + 1} / ${list.length}`;
    thumbnails.forEach((thumb, originalIndex) => {
      thumb.hidden = photos[originalIndex].hidden;
      const selected = photos[originalIndex] === btn;
      thumb.setAttribute('aria-current',String(selected));
      const preview = thumb.querySelector('img');
      if (!thumb.hidden && preview.dataset.src) { preview.src = preview.dataset.src; delete preview.dataset.src; }
      if (selected) rail.scrollTo({left:thumb.offsetLeft-(rail.clientWidth-thumb.offsetWidth)/2,behavior:'instant'});
    });
  };
  photos.forEach(btn => btn.addEventListener('click', () => { opener=btn; dialog.showModal(); document.body.classList.add('dialog-open'); show(visible().indexOf(btn)); }));
  thumbnails.forEach(thumb => thumb.addEventListener('click', () => show(visible().indexOf(photos[Number(thumb.dataset.photoIndex)]))));
  $('.photo-prev').addEventListener('click', () => show(index - 1));
  $('.photo-next').addEventListener('click', () => show(index + 1));
  $('.photo-zoom')?.addEventListener('click', event => {
    const zoomed=$('.photo-stage').classList.toggle('is-zoomed');
    event.currentTarget.setAttribute('aria-pressed',String(zoomed));
    event.currentTarget.setAttribute('aria-label',zoomed?'Revino la imaginea întreagă':'Mărește detaliile');
    event.currentTarget.textContent=zoomed?'−':'+';
  });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show(index + (e.key === 'ArrowRight' ? 1 : -1)); }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); show(e.key==='Home'?0:visible().length-1); }
  });
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    const r = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); if(opener&&!opener.hidden)opener.focus({preventScroll:true}); });
}

// Share only the permanent public URL; clipboard failures leave a selectable link.
const cultivarUrl = $('#cultivar-url');
if (cultivarUrl) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(cultivarUrl.value);
      $('#share-status').textContent='Link copiat. Îl poți trimite mai departe.';
    } catch {
      cultivarUrl.focus(); cultivarUrl.select();
      $('#share-status').textContent='Selectează și copiază linkul din câmp.';
    }
  };
  $('[data-copy-url]').addEventListener('click', copyLink);
  $('[data-share-url]').addEventListener('click', async () => {
    if (!navigator.share) { await copyLink(); return; }
    try { await navigator.share({title:document.title,url:cultivarUrl.value}); }
    catch (error) { if(error.name!=='AbortError') await copyLink(); }
  });
}

// "Din pepinieră, până în grădina ta": the step in the middle of the screen is highlighted in the index.
const journeySteps = $$('.journey-step');
if (journeySteps.length && 'IntersectionObserver' in window) {
  const index = $$('.journey-index li');
  const activate = i => { journeySteps.forEach((s, k) => s.classList.toggle('is-active', k === i)); index.forEach((li, k) => li.classList.toggle('is-active', k === i)); };
  activate(0);
  const stepObserver = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) activate(Number(e.target.dataset.step)); }), {rootMargin:'-45% 0px -45% 0px'});
  journeySteps.forEach(s => stepObserver.observe(s));
}

// Video files are attached only on an explicit play request; one stream at a time.
function loadVideoCover(cover) {
  if (!cover || cover.dataset.loaded) return;
  cover.dataset.loaded='true';
  $$('source[data-srcset]',cover).forEach(source=>{source.srcset=source.dataset.srcset;source.removeAttribute('data-srcset')});
  const image=$('img',cover);
  image.srcset=image.dataset.srcset; image.src=image.dataset.src;
  image.removeAttribute('data-src'); image.removeAttribute('data-srcset');
}
const videoCovers=$$('[data-video-cover]');
if ('IntersectionObserver' in window) {
  const coverObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){loadVideoCover(entry.target);coverObserver.unobserve(entry.target)}
  }),{rootMargin:'300px 0px'});
  videoCovers.forEach(cover=>coverObserver.observe(cover));
} else videoCovers.forEach(loadVideoCover);

const videos = $$('video');
const videoPositions = new WeakMap();
function releaseVideo(video) {
  const source = $('source[data-src]', video);
  if (!source?.hasAttribute('src')) { video.pause(); return; }
  videoPositions.set(video, video.ended ? 0 : video.currentTime);
  video.pause(); source.removeAttribute('src'); video.controls = false; video.load();
  video.closest('.video-card')?.classList.remove('is-playing');
  const start = $('[data-video-play]', video.closest('.video-card'));
  if (start) { start.hidden = false; start.disabled = false; }
}
videos.forEach(video => {
  const card = video.closest('.video-card');
  const start = card && $('[data-video-play]', card);
  const status = card && $('.video-status', card);
  const fallback = card && $('.video-fallback', card);
  start?.addEventListener('click', async () => {
    videos.forEach(other => { if (other !== video) releaseVideo(other); });
    status.textContent = ''; fallback.hidden = true; start.disabled = true;
    const cover=$('[data-video-cover]',card); loadVideoCover(cover);
    const coverImage=cover && $('img',cover);
    if(coverImage) video.poster=coverImage.currentSrc||coverImage.src;
    video.controls = true;
    const source = $('source[data-src]', video);
    if (!source.hasAttribute('src')) {
      source.src = source.dataset.src;
      video.addEventListener('loadedmetadata', () => {
        const saved = videoPositions.get(video) || 0;
        if (saved > 0 && saved < video.duration - .5) video.currentTime = saved;
      }, {once:true});
      video.load();
    }
    else if (video.error || video.networkState === 3) video.load();
    try { await video.play(); }
    catch (error) {
      if (error.name !== 'AbortError') {
        status.textContent = 'Clipul nu a pornit. Încearcă din nou sau deschide-l separat.';
        video.controls = false;
        fallback.hidden = false;
      }
    } finally { start.disabled = false; }
  });
  video.addEventListener('play', () => {
    card?.classList.add('is-playing');
    videos.forEach(other => { if (other !== video) releaseVideo(other); });
    if (start) start.hidden = true;
  });
  const showVideoError = () => {
    card?.classList.remove('is-playing');
    if (!start || !$('source[src]', video)) return;
    start.hidden = false; start.disabled = false;
    video.controls = false;
    status.textContent = 'Clipul nu s-a încărcat. Încearcă din nou sau deschide-l separat.';
    fallback.hidden = false;
  };
  video.addEventListener('error', showVideoError);
  $('source[data-src]', video)?.addEventListener('error', showVideoError);
});
$$('[data-video-filter]').forEach(button => button.addEventListener('click', () => {
  const filter = button.dataset.videoFilter;
  $$('[data-video-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $$('[data-video-section]').forEach(section => {
    section.hidden = filter !== 'toate' && section.dataset.videoSection !== filter;
    if (section.hidden) $$('video', section).forEach(releaseVideo);
  });
  $('#video-gallery-status').textContent = filter === 'toate' ? 'Toate videoclipurile.' : button.textContent;
}));
document.addEventListener('visibilitychange', () => { if (document.hidden) videos.forEach(v => v.pause()); });

// Scroll storytelling: elements reveal as they enter, siblings in a grid follow each other (max 0.45 s).
// Content is visible without JavaScript or with reduced motion.
const reveals = $$('.reveal');
reveals.forEach(el => {
  const siblings = [...el.parentElement.children].filter(c => c.classList.contains('reveal'));
  if (siblings.length > 1) el.style.setProperty('--d', `${Math.min(siblings.indexOf(el) * 90, 450)}ms`);
});
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let revealObserver;
function observeReveals() {
  revealObserver?.disconnect();
  if (!('IntersectionObserver' in window) || motionPreference.matches) {
    reveals.forEach(el => el.classList.add('is-visible'));
    return;
  }
  // The observed container has no reveal transform (see CSS). Only its children
  // move, so animation itself cannot move the observation boundary.
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
    } else if (!entry.isIntersecting) {
      // Re-arm only when fully outside. A threshold crossing while visible cannot
      // restart the animation, even while the user reverses scroll direction.
      entry.target.classList.remove('is-visible');
    }
  }), {threshold:0, rootMargin:'0px'});
  reveals.forEach(el => revealObserver.observe(el));
}
observeReveals();
motionPreference.addEventListener('change', observeReveals);
