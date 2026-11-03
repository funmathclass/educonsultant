/**
 * ============================================================
 * PORTOFOLIO DIRI — Halaman publik (js/app.js)
 * Prinsip gas-instant-ux-pro (edisi REST):
 *  1. Data diambil SEJAK <head> (paralel dengan CSS/JS) — lihat index.html.
 *  2. SWR: kunjungan ulang tampil SEKETIKA dari cache perangkat, lalu
 *     diperiksa di latar belakang memakai hash (server cukup menjawab "sama").
 *  3. Mode Turbo (opsional): pengunjung pertama memuat snapshot dari CDN GitHub.
 *  4. Formulir kontak optimistic + reqId (aman di-retry) + kotak keluar offline.
 *  5. Statistik dikirim berkelompok; saat halaman ditutup memakai keepalive.
 * ============================================================
 */
(function () {
  'use strict';

  const PF = window.PF;
  const { $, $$, esc, icon, safeUrl, initials, accent, toast } = PF;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ls = PF.Store;
  const ssn = { get: (k) => PF.ssn.get(k), set: (k, v) => PF.ssn.set(k, String(v)) };

  // ════════════════════════════════════════════════════════
  // BAGIAN 1: STATE
  // ════════════════════════════════════════════════════════
  const S = {
    data: null,
    h: '',
    started: false,
    skillCat: 'All',
    projCat: 'All',
    projPage: 0,
    lastServer: 0,
    device: PF.deviceType(),
    deviceId: (function () {
      let id = ls.get('device');
      if (!id) { id = PF.uuid().replace(/-/g, '').slice(0, 24); ls.set('device', id); }
      return id;
    })()
  };

  const NAV = [['beranda', 'Home'], ['tentang', 'About'], ['keahlian', 'Expertise'], ['portofolio', 'Services'], ['testimoni', 'Testimonials'], ['kontak', 'Contact']];

  // ════════════════════════════════════════════════════════
  // BAGIAN 3: RENDER BAGIAN-BAGIAN HALAMAN (F1–F9)
  // ════════════════════════════════════════════════════════
  const D = () => S.data;
  const set = () => D().settings || {};
  const prof = () => D().profil || {};
  const kontak = () => (D().kontak || []).filter((k) => safeUrl(k.url));

  function avatarHtml(cls) {
    const p = prof();
    const src = safeUrl(p.url_foto);
    return `<span class="avatar ${cls || ''}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : esc(initials(p.nama_lengkap))}</span>`;
  }

  function waLink(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '0') d = '62' + d.slice(1);
    return 'https:\/\/wa.me/' + d;
  }

  function renderInfobar() {
    const s = set();
    const bar = $('#infobar');
    if (!s.info_bar_aktif) { bar.hidden = true; return; }
    bar.hidden = false;
    const soc = kontak().slice(0, 5).map((k) =>
      `<a href="${esc(k.url)}" target="_blank" rel="noopener" data-kontak="${esc(k.label)}" aria-label="${esc(k.label)}"><i class="bi bi-${icon(k.ikon)}" aria-hidden="true"></i></a>`).join('');
    bar.innerHTML = `<div class="container">
      <div class="infobar-left">
        ${s.email_publik ? `<a class="ib-hide" href="mailto:${esc(s.email_publik)}" target="_blank" rel="noopener" data-kontak="Email (info bar)"><i class="bi bi-envelope" aria-hidden="true"></i>${esc(s.email_publik)}</a>` : ''}
        ${s.telepon ? `<a class="ib-hide" href="${esc(waLink(s.telepon))}" target="_blank" rel="noopener" data-kontak="Telepon (info bar)"><i class="bi bi-telephone" aria-hidden="true"></i>${esc(s.telepon)}</a>` : ''}
        ${s.info_bar_teks ? `<span class="ib-pill"><span class="dot" aria-hidden="true"></span>${esc(s.info_bar_teks)}</span>` : ''}
      </div>
      <div class="infobar-social">${soc}</div></div>`;
  }

  function navItems() {
    const hasTesti = (D().testimoni || []).length > 0;
    return NAV.filter(([id]) => id !== 'testimoni' || hasTesti);
  }

  function renderNav() {
    const p = prof();
    const brand = `${avatarHtml()}<span style="min-width:0"><span class="brand-name">${esc(p.nama_lengkap || 'Education Consultant')}<i class="bi bi-patch-check-fill" aria-hidden="true"></i></span><span class="brand-role" style="display:block">${esc(p.profesi || '')}</span></span>`;
    $('#brand').innerHTML = brand;
    $('#mbrand').innerHTML = `<span class="brand-name" style="color:#fff">${esc(p.nama_lengkap || '')}</span>`;
    $('#navLinks').innerHTML = navItems().map(([id, label]) => `<button type="button" data-go="${id}" data-nav="${id}">${label}</button>`).join('');
    $('#mlinks').innerHTML = navItems().map(([id, label]) => `<button type="button" data-go="${id}">${label}</button>`).join('');
  }

  function videoInfo(url) {
    const u = safeUrl(url);
    if (!u) return null;
    let m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(u);
    if (m) return { embed: `https:\/\/www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` };
    m = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(u);
    if (m) return { embed: `https:\/\/player.vimeo.com/video/${m[1]}?autoplay=1` };
    if (/drive\.google\.com\/file\/d\/([\w-]+)/i.test(u)) return { embed: u.replace(/\/view.*$/, '/preview') };
    return { link: u };
  }

  function renderHero() {
    const p = prof();
    const photo = safeUrl(p.url_foto);
    const years = parseInt(p.tahun_pengalaman, 10) || 0;
    const t1 = p.teks_tombol_1 || 'View My Work';
    const t2 = p.teks_tombol_2 || 'About Me';
    const v = videoInfo(p.url_video_intro);
    const videoBtn = !v ? '' : v.embed
      ? `<button type="button" class="video-chip" id="videoBtn" data-cta="Video Perkenalan"><span class="play"><i class="bi bi-play-fill" aria-hidden="true"></i></span>Watch Introduction Video</button>`
      : `<a class="video-chip" href="${esc(v.link)}" target="_blank" rel="noopener" data-cta="Video Perkenalan"><span class="play"><i class="bi bi-play-fill" aria-hidden="true"></i></span>Watch Introduction Video</a>`;
    $('#heroBox').innerHTML = `
      <div class="hero-text" style="animation:fadeUp .5s var(--ease) both">
        ${p.profesi ? `<span class="hero-label"><span class="dot dot-yellow" aria-hidden="true"></span>${esc(p.profesi)}</span>` : ''}
        <h1>${accent(p.headline || p.nama_lengkap || '', true)}</h1>
        ${p.deskripsi_singkat ? `<p class="hero-desc">${esc(p.deskripsi_singkat)}</p>` : ''}
        <div class="hero-actions">
          <button type="button" class="btn btn-primary" data-go="portofolio" data-cta="${esc(t1)}">${esc(t1)} <i class="bi bi-arrow-right" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-ghost" data-go="tentang" data-cta="${esc(t2)}">${esc(t2)}</button>
        </div>
        ${videoBtn}
      </div>
      <div class="hero-media" style="animation:fadeUp .6s .08s var(--ease) both">
        <div class="hero-blob" aria-hidden="true"></div>
        <div class="hero-photo">${photo
          ? `<img src="${esc(photo)}" alt="Photo of ${esc(p.nama_lengkap || '')}" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" width="440" height="550">`
          : `<span class="initials" aria-hidden="true">${esc(initials(p.nama_lengkap))}</span>`}</div>
        <i class="bi bi-stars hero-spark" aria-hidden="true"></i>
        <i class="bi bi-star-fill hero-spark-2" aria-hidden="true"></i>
        ${years ? `<div class="exp-badge"><span class="num tnum">${years}+</span><div><b>Years of Experience</b><small>Professional experience</small></div></div>` : ''}
      </div>`;
  }

  function renderAbout() {
    const s = set();
    const p = prof();
    const items = D().tentang || [];
    const by = (j) => items.filter((x) => x.jenis === j);
    $('#subTentang').textContent = String(s.sub_tentang || '').replace(/^'/, '');
    const prinsip = String(s.prinsip_kerja || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const tags = String(s.tagar || '').split(',').map((x) => x.trim()).filter(Boolean);
    const list = (arr) => arr.map((x) => `<div class="about-item"><b>${esc(x.judul)}</b><span>${[x.instansi, x.periode].filter(Boolean).map(esc).join(' • ')}</span>${x.deskripsi ? `<span>${esc(x.deskripsi)}</span>` : ''}</div>`).join('');
    const cards = [];
    const pend = by('pendidikan'); const peng = by('pengalaman'); const minat = by('minat'); const tujuan = by('tujuan_karier');
    if (pend.length) cards.push(['mortarboard', 'Education', list(pend)]);
    if (peng.length) cards.push(['briefcase', 'Key Experience', list(peng)]);
    if (minat.length) {
      const desc = minat.map((x) => x.deskripsi).filter(Boolean)[0] || '';
      cards.push(['lightbulb', 'Interests & Research', `${desc ? `<p>${esc(desc)}</p>` : ''}<div class="tag-row">${minat.map((x) => `<span class="chip chip-sky">${esc(x.judul)}</span>`).join('')}</div>`]);
    }
    if (tujuan.length) cards.push(['flag', 'Career Goal', tujuan.map((x) => `<p>${esc(x.deskripsi || x.judul)}</p>`).join('')]);
    $('#aboutBox').innerHTML = `
      <div class="about-me reveal">
        <div class="about-id">${avatarHtml()}<div><b>${esc(p.nama_lengkap || '')}</b><small>${esc(s.lokasi || '')}</small></div></div>
        ${s.kutipan ? `<p class="about-quote">“${esc(s.kutipan)}”</p>` : ''}
        ${prinsip.length ? `<ul class="check-list">${prinsip.map((x) => `<li><i class="bi bi-check-circle" aria-hidden="true"></i><span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
        ${tags.length ? `<div class="tag-row">${tags.map((t) => `<span class="chip chip-white">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="about-cards">${cards.length ? cards.map(([ic, title, body], i) => `
        <article class="card about-card lift reveal" style="--d:${(i * 0.06).toFixed(2)}s">
          <span class="ic"><i class="bi bi-${ic}" aria-hidden="true"></i></span>
          <h3>${title}</h3><div>${body}</div>
        </article>`).join('') : `<div class="empty"><i class="bi bi-journal-text"></i>Background information has not been added yet.</div>`}</div>`;
    // Kartu profil: avatar besar bersudut
    const av = $('#aboutBox .about-id .avatar'); if (av) av.style.borderRadius = '16px';
  }

  function catClass(cat, cats) {
    const i = cats.indexOf(cat);
    return ['chip-yellow', 'chip-sky', 'chip'][i % 3] || 'chip';
  }

  function renderSkills() {
    const s = set();
    $('#subKeahlian').textContent = String(s.sub_keahlian || '').replace(/^'/, '');
    const all = D().keahlian || [];
    const cats = Array.from(new Set(all.map((x) => String(x.kategori || 'Lainnya'))));
    if (S.skillCat !== 'All' && cats.indexOf(S.skillCat) === -1) S.skillCat = 'All';
    $('#skillFilter').innerHTML = ['All'].concat(cats).map((c) => `<button type="button" data-skillcat="${esc(c)}" aria-pressed="${c === S.skillCat}">${esc(c)}</button>`).join('');
    $('#skillFilter').parentElement.hidden = cats.length < 2;
    const list = S.skillCat === 'All' ? all : all.filter((x) => String(x.kategori) === S.skillCat);
    $('#skillsBox').innerHTML = list.length ? list.map((x, i) => {
      const lv = Math.max(0, Math.min(100, parseInt(x.level, 10) || 0));
      return `<article class="card skill-card lift reveal" style="--d:${((i % 4) * 0.05).toFixed(2)}s">
        <div class="skill-top"><span class="ic"><i class="bi bi-${icon(x.ikon)}" aria-hidden="true"></i></span><span class="chip ${catClass(String(x.kategori), cats)}">${esc(x.kategori)}</span></div>
        <h3>${esc(x.nama_skill)}</h3>
        <p>${esc(x.deskripsi || '')}</p>
        <div class="bar" role="progressbar" aria-label="Proficiency in ${esc(x.nama_skill)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lv}"><span style="--w:${lv}%"></span></div>
        <div class="skill-meta"><span>Proficiency</span><b class="tnum">${lv}%</b></div>
      </article>`;
    }).join('') : `<div class="empty" style="grid-column:1/-1"><i class="bi bi-stars"></i>No expertise in this category yet.</div>`;
  }

  function projPageSize() {
    const w = window.innerWidth;
    return w >= 1000 ? 6 : w >= 640 ? 4 : 3;
  }

  function renderProjects() {
    const s = set();
    $('#subPortofolio').textContent = String(s.sub_portofolio || '').replace(/^'/, '');
    const all = D().portofolio || [];
    const cats = Array.from(new Set(all.map((x) => String(x.kategori || 'Lainnya'))));
    if (S.projCat !== 'All' && cats.indexOf(S.projCat) === -1) S.projCat = 'All';
    $('#projFilter').innerHTML = ['All'].concat(cats).map((c) => `<button type="button" data-projcat="${esc(c)}" aria-pressed="${c === S.projCat}">${esc(c)}</button>`).join('');
    $('#projFilter').hidden = cats.length < 2;
    const list = S.projCat === 'All' ? all : all.filter((x) => String(x.kategori) === S.projCat);
    const size = projPageSize();
    const pages = Math.max(1, Math.ceil(list.length / size));
    S.projPage = Math.min(S.projPage, pages - 1);
    const slice = list.slice(S.projPage * size, S.projPage * size + size);
    $('#projBox').innerHTML = slice.length ? slice.map((x, i) => {
      const img = safeUrl(x.url_gambar);
      const link = safeUrl(x.url_tautan);
      const tech = String(x.teknologi || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4);
      return `<article class="card proj-card lift reveal in" style="--d:${((i % 3) * 0.05).toFixed(2)}s">
        <div class="proj-cover" data-popen="${esc(x.id)}" role="button" tabindex="0" aria-label="View details: ${esc(x.judul)}">
          ${img ? `<img src="${esc(img)}" alt="Preview of ${esc(x.judul)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="640" height="360">`
                : `<div class="ph" aria-hidden="true"><i class="bi bi-window-stack"></i><b>${esc(x.kategori)}</b></div>`}
          <span class="proj-tag">${esc(x.kategori)}</span>
          <span class="zoom" aria-hidden="true"><i class="bi bi-arrows-angle-expand"></i></span>
        </div>
        <div class="proj-body">
          <h3>${esc(x.judul)}</h3>
          ${x.deskripsi_singkat ? `<p>${esc(x.deskripsi_singkat)}</p>` : ''}
          ${tech.length ? `<div class="tag-row">${tech.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
          <div class="proj-foot">
            <small>${x.periode ? 'Completed • ' + esc(x.periode) : esc(x.kategori)}</small>
            ${link ? `<a class="proj-go" href="${esc(link)}" target="_blank" rel="noopener" data-proj="${esc(x.judul)}" aria-label="Open project ${esc(x.judul)} (new tab)"><i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>`
                   : `<span class="proj-go off" aria-hidden="true"><i class="bi bi-lock"></i></span>`}
          </div>
        </div>
      </article>`;
    }).join('') : `<div class="empty" style="grid-column:1/-1"><i class="bi bi-folder2-open"></i>No projects in this category yet.</div>`;
    $('#projDots').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) =>
      `<button type="button" data-projpage="${i}" aria-label="Page ${i + 1}" aria-current="${i === S.projPage}"></button>`).join('') : '';
    $('#projPrev').disabled = S.projPage <= 0;
    $('#projNext').disabled = S.projPage >= pages - 1;
    $('.port-arrows').hidden = pages <= 1;
  }

  function stars(n) {
    n = Math.max(1, Math.min(5, parseInt(n, 10) || 5));
    return Array.from({ length: 5 }, (_, i) => `<i class="bi bi-star-fill${i < n ? '' : ' off'}" aria-hidden="true"></i>`).join('');
  }

  function renderTestimonials() {
    const s = set();
    const list = D().testimoni || [];
    const sec = $('#testimoni');
    stopTestiRotation();
    sec.hidden = !list.length;
    if (!list.length) return;
    $('#subTestimoni').textContent = String(s.sub_testimoni || '').replace(/^'/, '');
    if (list.length > 4) { renderTestiFlip(list); return; }
    const box = $('#testiBox');
    box.className = 'testi-track';
    box.setAttribute('tabindex', '0');
    box.style.removeProperty('--slots');
    box.innerHTML = list.map((t, i) => testiCard(t, i, ' reveal', `margin:0;--d:${((i % 3) * 0.06).toFixed(2)}s`)).join('');
    requestAnimationFrame(updateTestiNav);
  }

  function updateTestiNav() {
    const tr = $('#testiBox');
    if (!tr) return;
    $('#testiNav').hidden = tr.scrollWidth <= tr.clientWidth + 4;
  }

  function renderContact() {
    const s = set();
    $('#subKontak').textContent = String(s.sub_kontak || '').replace(/^'/, '');
    const rows = [];
    if (s.email_publik) rows.push(`<a class="ch-row" href="mailto:${esc(s.email_publik)}" target="_blank" rel="noopener" data-kontak="Email"><span class="ic"><i class="bi bi-envelope" aria-hidden="true"></i></span><span><small>Email</small><b>${esc(s.email_publik)}</b></span><i class="bi bi-arrow-up-right go" aria-hidden="true"></i></a>`);
    if (s.telepon) rows.push(`<a class="ch-row" href="${esc(waLink(s.telepon))}" target="_blank" rel="noopener" data-kontak="WhatsApp"><span class="ic"><i class="bi bi-whatsapp" aria-hidden="true"></i></span><span><small>WhatsApp / Telepon</small><b>${esc(s.telepon)}</b></span><i class="bi bi-arrow-up-right go" aria-hidden="true"></i></a>`);
    kontak().forEach((k) => {
      let host = k.url; try { host = new URL(k.url).hostname.replace(/^www\./, ''); } catch (e) { /* biarkan */ }
      rows.push(`<a class="ch-row" href="${esc(k.url)}" target="_blank" rel="noopener" data-kontak="${esc(k.label)}"><span class="ic"><i class="bi bi-${icon(k.ikon)}" aria-hidden="true"></i></span><span><small>${esc(k.label)}</small><b>${esc(host)}</b></span><i class="bi bi-arrow-up-right go" aria-hidden="true"></i></a>`);
    });
    if (s.zona_waktu || s.info_bar_teks) rows.push(`<div class="ch-row"><span class="ic"><i class="bi bi-clock" aria-hidden="true"></i></span><span><small>Time zone & response time</small><b>${esc([s.zona_waktu, s.info_bar_teks].filter(Boolean).join(' • '))}</b></span></div>`);
    if (s.lokasi) rows.push(`<div class="ch-row"><span class="ic"><i class="bi bi-geo-alt" aria-hidden="true"></i></span><span><small>Location</small><b>${esc(s.lokasi)}</b></span>${s.status_tersedia ? `<span class="chip chip-sky go" style="margin-left:auto">${esc(s.status_tersedia)}</span>` : ''}</div>`);
    $('#channelBox').innerHTML = rows.join('') || '<div class="empty">No contact channels yet.</div>';
  }

  function renderFooter() {
    const s = set();
    const p = prof();
    const soc = kontak().map((k) => `<a href="${esc(k.url)}" target="_blank" rel="noopener" data-kontak="${esc(k.label)} (footer)" aria-label="${esc(k.label)}"><i class="bi bi-${icon(k.ikon)}" aria-hidden="true"></i></a>`).join('');
    $('#footer').innerHTML = `<div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <b>${esc(p.nama_lengkap || '')}<span class="accent">portofolio</span></b>
          <p>${esc(s.tagline_footer || '')}</p>
          ${s.status_tersedia ? `<span class="footer-status"><span class="dot dot-yellow" aria-hidden="true"></span>${esc(s.status_tersedia)}</span>` : ''}
        </div>
        <div><h4>Navigation</h4><div class="f-links">${navItems().map(([id, label]) => `<button type="button" data-go="${id}">${label}</button>`).join('')}</div></div>
        <div><h4>Kontak Langsung</h4><div class="f-links">
          ${s.email_publik ? `<a href="mailto:${esc(s.email_publik)}" target="_blank" rel="noopener" data-kontak="Email (footer)"><i class="bi bi-envelope" aria-hidden="true"></i>${esc(s.email_publik)}</a>` : ''}
          ${s.telepon ? `<a href="${esc(waLink(s.telepon))}" target="_blank" rel="noopener" data-kontak="Telepon (footer)"><i class="bi bi-telephone" aria-hidden="true"></i>${esc(s.telepon)}</a>` : ''}
          ${s.lokasi ? `<span style="display:inline-flex;gap:10px;color:rgba(226,232,240,.85);font-size:14.5px"><i class="bi bi-geo-alt" aria-hidden="true"></i>${esc(s.lokasi)}</span>` : ''}
        </div></div>
        <div><h4>Jaringan Sosial</h4>
          <p style="color:rgba(226,232,240,.8);font-size:14px">Terhubung secara profesional melalui kanal berikut:</p>
          <div class="f-social">${soc}</div>
          <div class="to-top"><span>Kembali ke atas</span><button type="button" class="icon-btn" data-go="beranda" aria-label="Kembali ke atas"><i class="bi bi-arrow-up" aria-hidden="true"></i></button></div>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${esc(p.nama_lengkap || '')}. All rights reserved.</span><span>${esc(s.zona_waktu || '')}</span></div>
    </div>`;
  }

  function renderAll() {
    renderInfobar();
    renderNav();
    renderHero();
    renderAbout();
    renderSkills();
    renderProjects();
    renderTestimonials();
    renderContact();
    renderFooter();
    const s = set();
    if (s.judul_situs) document.title = String(s.judul_situs).replace(/^'/, '');
    const md = $('meta[name="description"]');
    if (md && s.meta_deskripsi) md.setAttribute('content', String(s.meta_deskripsi).replace(/^'/, ''));
    // Ikon dari data yang tidak ada di subset → muat ikon lengkap (sekali)
    PF.ensureIcons([].concat((D().keahlian || []).map((x) => x.ikon), (D().kontak || []).map((x) => x.ikon)));
  }

  /** Halaman status (perawatan / gagal memuat / belum dikonfigurasi). */
  function showState(title, msg, ic, retry) {
    const el = $('#statePage');
    el.innerHTML = `<div class="card"><span class="ic"><i class="bi bi-${ic || 'tools'}" aria-hidden="true"></i></span><h1>${esc(title)}</h1><p>${esc(msg)}</p>${retry ? '<button type="button" class="btn btn-primary" id="btnReload"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i>Try again</button>' : ''}</div>`;
    el.hidden = false;
    $('#site').hidden = true;
    document.body.classList.remove('is-loading');
    const b = $('#btnReload');
    if (b) b.addEventListener('click', () => { el.hidden = true; $('#site').hidden = false; document.body.classList.add('is-loading'); fetchFromServer(); });
  }
  function hideState() {
    const el = $('#statePage');
    if (el) el.hidden = true;
    $('#site').hidden = false;
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 4: INTERAKSI (navigasi, menu, filter, carousel, modal)
  // ════════════════════════════════════════════════════════
  function navHeight() { const n = $('#nav'); return n ? n.offsetHeight : 70; }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    closeMenu();
    const top = id === 'beranda' ? 0 : el.getBoundingClientRect().top + window.pageYOffset - navHeight() + 1;
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function openMenu() {
    const m = $('#mmenu');
    m.classList.add('open');
    $('#burger').setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const b = $('#mlinks button'); if (b) b.focus(); }, 60);
  }
  function closeMenu() {
    const m = $('#mmenu');
    if (!m || !m.classList.contains('open')) return;
    m.classList.remove('open');
    $('#burger').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  let lastFocus = null;
  function openVideo() {
    const v = videoInfo(prof().url_video_intro);
    if (!v || !v.embed) return;
    lastFocus = document.activeElement;
    $('#videoWrap').innerHTML = `<iframe src="${esc(v.embed)}" title="Video perkenalan" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    $('#videoModal').classList.add('open');
    setTimeout(() => $('#videoModal [data-close-modal]').focus(), 50);
  }
  function closeVideo() {
    const m = $('#videoModal');
    if (!m.classList.contains('open')) return;
    m.classList.remove('open');
    setTimeout(() => { $('#videoWrap').innerHTML = ''; }, 220);
    if (lastFocus) lastFocus.focus();
  }

  function bindUI() {
    // Delegasi klik tunggal untuk seluruh halaman
    document.addEventListener('click', (e) => {
      const t = e.target;
      const go = t.closest('[data-go]');
      const cta = t.closest('[data-cta]');
      const kon = t.closest('[data-kontak]');
      const proj = t.closest('[data-proj]');
      if (cta) track('klik_cta', cta.getAttribute('data-cta'));
      if (kon) track('klik_kontak', kon.getAttribute('data-kontak'));
      if (proj) track('klik_proyek', proj.getAttribute('data-proj'));
      if (go) { e.preventDefault(); closePopups(); scrollToSection(go.getAttribute('data-go')); return; }
      if (t.closest('[data-focus-form]')) { focusForm(); return; }
      const sc = t.closest('[data-skillcat]');
      if (sc) { S.skillCat = sc.getAttribute('data-skillcat'); renderSkills(); markIn('#skillsBox'); return; }
      const pc = t.closest('[data-projcat]');
      if (pc) { S.projCat = pc.getAttribute('data-projcat'); S.projPage = 0; renderProjects(); return; }
      const pp = t.closest('[data-projpage]');
      if (pp) { S.projPage = parseInt(pp.getAttribute('data-projpage'), 10) || 0; renderProjects(); return; }
      if (t.closest('#videoBtn')) { openVideo(); return; }
      if (t.closest('[data-close-modal]') || t.id === 'videoModal') { closeVideo(); return; }
    });
    $('#projPrev').addEventListener('click', () => { S.projPage = Math.max(0, S.projPage - 1); renderProjects(); });
    $('#projNext').addEventListener('click', () => { S.projPage += 1; renderProjects(); });
    const slide = (dir) => { const tr = $('#testiBox'); const card = $('.testi-card', tr); tr.scrollBy({ left: dir * ((card ? card.offsetWidth : 300) + 24), behavior: reduceMotion ? 'auto' : 'smooth' }); };
    $('#testiPrev').addEventListener('click', () => slide(-1));
    $('#testiNext').addEventListener('click', () => slide(1));
    $('#burger').addEventListener('click', openMenu);
    $('#mclose').addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeVideo(); } });

    // Bayangan navbar saat scroll (rAF, passive)
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { $('#nav').classList.toggle('scrolled', window.pageYOffset > 8); ticking = false; });
    }, { passive: true });

    // Hitung ulang ukuran halaman proyek saat lebar layar berubah
    let lastSize = projPageSize(); let rT;
    window.addEventListener('resize', () => {
      clearTimeout(rT);
      rT = setTimeout(() => { S.device = deviceType(); updateTestiNav(); const sz = projPageSize(); if (sz !== lastSize) { lastSize = sz; S.projPage = 0; renderProjects(); } }, 150);
    });
    bindForm();
  }

  function markIn(sel) { $$(sel + ' .reveal').forEach((el) => el.classList.add('in')); }

  // Animasi fade-up saat elemen masuk layar
  let revealObs = null;
  function initReveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) { $$('.reveal').forEach((el) => el.classList.add('in')); return; }
    revealObs = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); revealObs.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.in)').forEach((el) => revealObs.observe(el));
  }

  // Menu aktif mengikuti bagian yang sedang dibaca
  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const id = en.target.id;
        $$('#navLinks [data-nav]').forEach((b) => {
          const on = b.getAttribute('data-nav') === id;
          b.classList.toggle('active', on);
          if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    NAV.forEach(([id]) => { const el = document.getElementById(id); if (el) obs.observe(el); });
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 5: FORMULIR KONTAK (validasi + draft + optimistic)
  // ════════════════════════════════════════════════════════
  const MARKUP = /<\s*\/?\s*[a-z!]|javascript\s*:/i;
  const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;

  function focusForm() {
    const card = $('#formCard');
    if (!card) return;
    if (card.classList.contains('sent')) card.classList.remove('sent');
    const top = card.getBoundingClientRect().top + window.pageYOffset - navHeight() - 16;
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    setTimeout(() => $('#fNama').focus({ preventScroll: true }), reduceMotion ? 0 : 450);
  }

  function fieldErr(name, msg) {
    const f = $(`.field[data-f="${name}"]`);
    if (!f) return;
    f.classList.toggle('err', !!msg);
    $('.msg span', f).textContent = msg || '';
    const inp = $('.input', f);
    if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
  }

  function formValues() {
    return { nama: $('#fNama').value.trim(), email: $('#fEmail').value.trim(), pesan: $('#fPesan').value.trim(), website: $('#fWeb').value };
  }

  function validate(v) {
    const err = {};
    if (!v.nama) err.nama = 'Name is required.';
    else if (MARKUP.test(v.nama)) err.nama = 'Name must not contain HTML or script code.';
    if (!v.email) err.email = 'Email is required so I can reply.';
    else if (!EMAIL.test(v.email)) err.email = 'Email format is not correct, for example: name@domain.com';
    if (!v.pesan) err.pesan = 'Message is required.';
    else if (v.pesan.length > 1000) err.pesan = 'Message may not exceed 1,000 characters.';
    else if (MARKUP.test(v.pesan)) err.pesan = 'Message must not contain HTML or script code.';
    ['nama', 'email', 'pesan'].forEach((k) => fieldErr(k, err[k]));
    return err;
  }

  function updateCounter() {
    const n = $('#fPesan').value.length;
    const c = $('#fCount');
    c.textContent = n.toLocaleString('id-ID') + '/1.000';
    c.classList.toggle('over', n > 1000);
  }

  function restoreDraft() {
    const d = ls.get('pf_draft');
    if (!d) return;
    $('#fNama').value = d.nama || '';
    $('#fEmail').value = d.email || '';
    $('#fPesan').value = d.pesan || '';
    updateCounter();
  }

  function bindForm() {
    const form = $('#contactForm');
    let dT;
    form.addEventListener('input', (e) => {
      if (e.target.id === 'fPesan') updateCounter();
      const f = e.target.closest('.field');
      if (f && f.classList.contains('err')) fieldErr(f.getAttribute('data-f'), '');
      clearTimeout(dT);
      dT = setTimeout(() => { const v = formValues(); ls.set('pf_draft', { nama: v.nama, email: v.email, pesan: v.pesan }); }, 400);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); submitForm(); });
    $('#sendAnother').addEventListener('click', () => { $('#formCard').classList.remove('sent'); $('#fNama').focus(); });
  }

  function submitForm() {
    const v = formValues();
    const err = validate(v);
    const first = ['nama', 'email', 'pesan'].find((k) => err[k]);
    if (first) { $(`.field[data-f="${first}"] .input`).focus(); return; }

    // Batas lokal 5 pesan/jam (server tetap memeriksa ulang)
    const hour = Date.now() - 3600000;
    const sent = (ls.get('sent', []) || []).filter((t) => t > hour);
    if (sent.length >= 5) { toast('Limit of 5 messages per hour reached. Please try again later.', 'warning'); return; }

    // OPTIMISTIC: konfirmasi tampil seketika, kirim di latar belakang
    const card = $('#formCard');
    $('#fSubmit').classList.add('is-loading');
    $('#sentInfo').innerHTML = `Thank you, <b>${esc(v.nama)}</b>. Your message is being sent… <span class="spinner spin-inline"></span>`;
    card.classList.add('sent');
    const okBox = $('.form-success', card);
    okBox.setAttribute('tabindex', '-1');
    okBox.focus({ preventScroll: true });

    const reqId = PF.rid('msg');   // kunci idempotensi: retry tidak membuat pesan ganda
    const payload = { nama: v.nama, email: v.email, pesan: v.pesan, website: v.website, deviceId: S.deviceId };
    PF.api('contact', payload, { reqId, tries: 3 }).then((res) => {
      $('#fSubmit').classList.remove('is-loading');
      if (res && res.success) {
        ls.del('pf_draft');
        sent.push(Date.now()); ls.set('sent', sent);
        $('#contactForm').reset(); updateCounter();
        $('#sentInfo').innerHTML = `Thank you, <b>${esc(v.nama)}</b>. Your message has arrived and I will reply to <b>${esc(v.email)}</b>.`;
        track('klik_cta', 'Kirim Formulir Kontak');
      } else if (res && res.network) {
        // Sinyal hilang → simpan di perangkat, kirim otomatis saat online (reqId sama → tidak ganda)
        const box = (ls.get('outbox', []) || []).filter((x) => Date.now() - x.at < 3 * 86400000);
        box.push({ reqId, payload, at: Date.now() });
        ls.set('outbox', box.slice(-5));
        ls.del('pf_draft');
        $('#contactForm').reset(); updateCounter();
        $('#sentInfo').innerHTML = `Your connection is offline. The message from <b>${esc(v.nama)}</b> is saved on this device and will be <b>sent automatically</b> when the internet returns.`;
      } else {
        rollback(v, res && res.message, res && res.data && res.data.field);
      }
    });
  }

  function rollback(v, msg, field) {
    const card = $('#formCard');
    card.classList.remove('sent');
    $('#fSubmit').classList.remove('is-loading');
    $('#fNama').value = v.nama; $('#fEmail').value = v.email; $('#fPesan').value = v.pesan;
    updateCounter();
    if (field) { fieldErr(field, msg); $(`.field[data-f="${field}"] .input`).focus(); }
    toast(msg || 'The message could not be sent.', 'error');
  }

  /** Kirim ulang pesan yang tertahan saat offline. */
  let outboxBusy = false;
  async function flushOutbox() {
    if (outboxBusy || !PF.configured) return;
    let box = (ls.get('outbox', []) || []).filter((x) => Date.now() - x.at < 3 * 86400000);
    if (!box.length) { ls.del('outbox'); return; }
    outboxBusy = true;
    for (const item of box.slice()) {
      const res = await PF.api('contact', item.payload, { reqId: item.reqId, tries: 2 });
      if (res && res.network) break;
      box = box.filter((x) => x.reqId !== item.reqId);
      ls.set('outbox', box);
      if (res && res.success) toast('Your pending message has been sent.', 'success');
      else toast('The pending message was rejected by the server: ' + ((res && res.message) || 'failed'), 'error');
    }
    outboxBusy = false;
  }
  window.addEventListener('online', flushOutbox);

  // Hangatkan server saat pengunjung mulai mengisi formulir (kirim terasa cepat).
  let warmed = 0;
  document.addEventListener('focusin', (e) => {
    if (!e.target.closest || !e.target.closest('#contactForm') || !PF.configured) return;
    if (Date.now() - Math.max(warmed, S.lastServer) < 4 * 60000) return;
    warmed = Date.now();
    PF.apiGet({ action: 'ping' }, { tries: 1 }).catch(() => {});
  });

  // ════════════════════════════════════════════════════════
  // BAGIAN 6: STATISTIK — antrean lokal + kirim berkelompok
  // ════════════════════════════════════════════════════════
  const QK = 'evq';
  let flushT = null;
  let flushing = false;

  function track(t, g) {
    if (!S.data || !PF.configured) return;
    const q = ls.get(QK, []) || [];
    q.push({ t, g: String(g || '').slice(0, 120), p: S.device, ts: Date.now() });
    ls.set(QK, q.slice(-150));
    scheduleFlush(2500);
  }
  function scheduleFlush(ms) { clearTimeout(flushT); flushT = setTimeout(() => flushQueue(false), ms); }
  function flushQueue(leaving) {
    if (flushing || !PF.configured) return;
    const q = ls.get(QK, []) || [];
    if (!q.length) return;
    const batch = q.slice(0, 50);
    const data = { events: batch, deviceId: S.deviceId };
    if (leaving) {
      // Halaman ditutup: kirim dengan keepalive (tetap terkirim walau tab tertutup)
      ls.set(QK, q.slice(batch.length));
      PF.api('events', data, { keepalive: true, tries: 1 });
      return;
    }
    flushing = true;
    PF.api('events', data, { tries: 2 }).then((res) => {
      flushing = false;
      if (!res || !res.success) return;
      const cur = ls.get(QK, []) || [];
      ls.set(QK, cur.slice(batch.length));
      if (cur.length > batch.length) scheduleFlush(800);
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushQueue(true); });

  function scheduleVisit() {
    setTimeout(() => {
      if (ssn.get('visit')) return;
      ssn.set('visit', 1);
      track('kunjungan', 'landing');
    }, 1500);
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 9 (v2.1): POPUP PROYEK · TESTIMONI FLIP · MUSIK LATAR · LEBAH
  // ════════════════════════════════════════════════════════
  let modalReturn = null;
  function openModal(sel) {
    modalReturn = document.activeElement;
    $(sel).classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const b = $(sel + ' .modal-head .icon-btn'); if (b) b.focus(); }, 50);
  }
  function closeModal(sel) {
    const m = $(sel);
    if (!m || !m.classList.contains('open')) return false;
    m.classList.remove('open');
    if (!$('.modal.open')) document.body.style.overflow = '';
    if (modalReturn && document.body.contains(modalReturn)) modalReturn.focus({ preventScroll: true });
    return true;
  }
  const closePopups = () => { closeModal('#projModal'); closeModal('#testiModal'); };

  /** Poin 3: klik gambar proyek → popup gambar penuh + deskripsi + tombol CTA menyala. */
  function openProject(id) {
    const x = (D().portofolio || []).find((p) => String(p.id) === String(id));
    if (!x) return;
    const img = safeUrl(x.url_gambar);
    const link = safeUrl(x.url_tautan);
    const tech = String(x.teknologi || '').split(',').map((t) => t.trim()).filter(Boolean);
    $('#pmBody').innerHTML = `
      <div class="pm-media">${img
        ? `<img src="${esc(img)}" alt="${esc(x.judul)}" decoding="async" referrerpolicy="no-referrer">`
        : '<div class="ph" aria-hidden="true"><i class="bi bi-window-stack"></i></div>'}</div>
      <div class="pm-text">
        <div class="pm-meta"><span class="chip chip-sky">${esc(x.kategori)}</span>${x.periode ? `<span class="chip">Completed • ${esc(x.periode)}</span>` : ''}</div>
        <h3 id="pmTitle">${esc(x.judul)}</h3>
        ${x.deskripsi_singkat ? `<p>${esc(x.deskripsi_singkat)}</p>` : ''}
        ${tech.length ? `<div class="tag-row">${tech.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="pm-cta">
          ${link ? `<a class="btn btn-yellow btn-glow" href="${esc(link)}" target="_blank" rel="noopener" data-cta="Lihat Proyek (popup)">View Project <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>` : ''}
          <button type="button" class="btn ${link ? 'btn-ghost' : 'btn-yellow btn-glow'}" data-go="kontak" data-cta="Diskusikan Proyek (popup)">${link ? 'Discuss a Similar Project' : 'Discuss This Project'} <i class="bi bi-chat-square-text" aria-hidden="true"></i></button>
        </div>
      </div>`;
    openModal('#projModal');
    track('klik_proyek', x.judul);
  }

  /** Poin 5: kartu testimoni (klik → popup). */
  function testiCard(t, i, cls, style) {
    const foto = safeUrl(t.url_foto);
    const n = parseInt(t.rating, 10) || 5;
    return `<figure class="card testi-card${cls || ''}" data-tidx="${i}" tabindex="0" role="button" aria-label="Read the full testimonial from ${esc(t.nama)}" style="${style || 'margin:0'}">
        <i class="bi bi-quote q" aria-hidden="true"></i>
        <div class="stars" role="img" aria-label="Rating ${n} out of 5">${stars(t.rating)}</div>
        <blockquote>“${esc(t.isi)}”</blockquote>
        <figcaption class="author"><span class="avatar">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(initials(t.nama))}</span>
          <span><b>${esc(t.nama)}</b><small>${esc(t.jabatan_instansi || '')}</small></span></figcaption>
        <span class="testi-more">Read more <i class="bi bi-arrow-right" aria-hidden="true"></i></span>
      </figure>`;
  }

  function openTesti(i) {
    const t = (D().testimoni || [])[i];
    if (!t) return;
    const foto = safeUrl(t.url_foto);
    $('#tmBody').innerHTML = `<i class="bi bi-quote q" aria-hidden="true"></i>
      <div class="stars" role="img" aria-label="Rating ${parseInt(t.rating, 10) || 5} out of 5">${stars(t.rating)}</div>
      <blockquote>“${esc(t.isi)}”</blockquote>
      <figcaption class="author"><span class="avatar">${foto ? `<img src="${esc(foto)}" alt="" referrerpolicy="no-referrer">` : esc(initials(t.nama))}</span>
        <span><b>${esc(t.nama)}</b><small>${esc(t.jabatan_instansi || '')}</small></span></figcaption>`;
    openModal('#testiModal');
  }

  // Lebih dari 4 testimoni → kartu berganti satu per satu dengan efek flip.
  let testiTimer = null;
  let testiState = null;
  const testiSlots = () => (window.innerWidth >= 1000 ? 4 : window.innerWidth >= 700 ? 2 : 1);
  function stopTestiRotation() { clearInterval(testiTimer); testiTimer = null; testiState = null; }

  function renderTestiFlip(list) {
    const box = $('#testiBox');
    const n = Math.min(testiSlots(), list.length - 1);
    box.className = 'testi-flip';
    box.removeAttribute('tabindex');
    box.style.setProperty('--slots', n);
    box.innerHTML = Array.from({ length: n }, (_, s) =>
      `<div class="flip"><div class="flip-inner"><div class="face front">${testiCard(list[s], s)}</div><div class="face back" aria-hidden="true"></div></div></div>`).join('');
    testiState = { n, shown: Array.from({ length: n }, (_, s) => s), queue: list.map((_, i) => i).slice(n), slot: 0 };
    $('#testiNav').hidden = true;
    testiTimer = setInterval(rotateTesti, 4500);
  }

  function rotateTesti() {
    const st = testiState;
    const list = (S.data && D().testimoni) || [];
    if (!st || !st.queue.length || document.hidden) return;
    const box = $('#testiBox');
    // Jeda saat pengunjung sedang membaca (kursor/fokus di kartu) atau popup terbuka
    if (box.matches(':hover') || box.contains(document.activeElement) || $('#testiModal.open')) return;
    const s = st.slot % st.n; st.slot += 1;
    const inner = box.children[s] && box.children[s].firstElementChild;
    if (!inner) return;
    const flipped = inner.classList.contains('flipped');
    const hidden = $(flipped ? '.face.front' : '.face.back', inner);
    const visible = $(flipped ? '.face.back' : '.face.front', inner);
    const next = st.queue.shift();
    st.queue.push(st.shown[s]);
    st.shown[s] = next;
    hidden.innerHTML = testiCard(list[next], next);
    hidden.removeAttribute('aria-hidden');
    visible.setAttribute('aria-hidden', 'true');
    $$('[tabindex]', visible).forEach((el) => { el.tabIndex = -1; });
    inner.classList.toggle('flipped');
  }

  let lastSlots = testiSlots();
  window.addEventListener('resize', () => {
    const n = testiSlots();
    if (n !== lastSlots) { lastSlots = n; if (S.data && (D().testimoni || []).length > 4) renderTestimonials(); }
  });

  /** Poin 6: musik latar dari YouTube. Pemutar mini SELALU terlihat saat musik berbunyi
   *  (aturan YouTube: pemutar tidak boleh disembunyikan; iklan tidak diblokir). */
  function ytId(u) {
    const m = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(String(u || ''));
    return m ? m[1] : '';
  }
  const Music = {
    id: '', player: null, ready: false, wantPlay: false, el: null,
    muted: ls.get('music-muted', false) === true,
    init(url) {
      const id = ytId(url);
      if (id === this.id) return;
      this.teardown();
      this.id = id;
      if (!id) return;
      this.el = document.createElement('div');
      this.el.className = 'music';
      this.el.id = 'music';
      document.body.appendChild(this.el);
      this.el.addEventListener('click', (e) => this.onClick(e));
      const closedBefore = PF.ssn.get('music-closed') === id;
      // Layar kecil (HP): pemutar 200×200 akan menutupi konten → tunggu pengunjung menekan tombol musik.
      const small = window.innerWidth < 600;
      this.renderPill(!closedBefore);
      if (!closedBefore && !small) {
        // Browser hanya mengizinkan suara setelah interaksi pertama pengunjung.
        // Dimulai SETELAH klik itu selesai, agar klik pertama tetap mengenai tombol/gambar yang dituju.
        this.onGesture = (e) => {
          if (this.el && this.el.contains(e.target)) return;
          this.removeGesture();
          setTimeout(() => this.start(), 0);
        };
        ['click', 'keydown'].forEach((ev) => document.addEventListener(ev, this.onGesture, { capture: true, passive: true }));
      }
    },
    removeGesture() {
      if (!this.onGesture) return;
      ['click', 'keydown'].forEach((ev) => document.removeEventListener(ev, this.onGesture, { capture: true }));
      this.onGesture = null;
    },
    teardown() {
      this.removeGesture();
      try { if (this.player && this.player.destroy) this.player.destroy(); } catch (e) { /* abaikan */ }
      if (this.el) this.el.remove();
      this.el = null; this.player = null; this.ready = false; this.id = '';
    },
    renderPill(waiting) {
      if (this.panel) this.panel.hidden = true;
      let pill = $('#musicPlay', this.el);
      if (!pill) {
        this.el.insertAdjacentHTML('afterbegin', '<button type="button" class="music-pill" id="musicPlay" aria-label="Play background music"><span class="ic"><i class="bi bi-music-note-beamed" aria-hidden="true"></i></span><span>Play music</span></button>');
        pill = $('#musicPlay', this.el);
      }
      pill.hidden = false;
      pill.classList.toggle('wait', !!waiting);
    },
    renderPanel() {
      const pill = $('#musicPlay', this.el);
      if (pill) pill.hidden = true;
      if (!this.panel) {
        this.el.insertAdjacentHTML('beforeend', `<div class="music-panel" role="region" aria-label="Background music">
          <div class="music-top"><b><span class="eq" id="musicEq"><i></i><i></i><i></i></span>Music</b>
            <button type="button" id="musicMute"></button>
            <button type="button" id="musicMin" aria-label="Hide player and pause music" title="Hide (pauses music)"><i class="bi bi-dash-lg" aria-hidden="true"></i></button></div>
          <div class="music-player"><div id="musicYT"></div></div></div>`);
        this.panel = $('.music-panel', this.el);
      }
      this.panel.hidden = false;
      this.syncMute();
    },
    syncMute() {
      const b = $('#musicMute', this.el);
      if (!b) return;
      b.innerHTML = `<i class="bi bi-volume-${this.muted ? 'mute' : 'up'}-fill" aria-hidden="true"></i>`;
      b.setAttribute('aria-label', this.muted ? 'Unmute music' : 'Mute music');
      b.setAttribute('aria-pressed', String(this.muted));
      const eq = $('#musicEq', this.el); if (eq) eq.classList.toggle('off', this.muted || !this.playing);
    },
    start() {
      this.wantPlay = true;
      this.renderPanel();
      if (this.player) { if (this.ready) this.player.playVideo(); return; }
      PF.loadScript('https://www.youtube.com/iframe_api').catch(() => {});
      const make = () => {
        if (!this.el || this.player) return;
        this.player = new window.YT.Player('musicYT', {
          width: 200, height: 200, videoId: this.id,
          playerVars: { autoplay: 1, loop: 1, playlist: this.id, controls: 1, playsinline: 1, rel: 0 },
          events: {
            onReady: (e) => { this.ready = true; if (this.muted) e.target.mute(); if (this.wantPlay) e.target.playVideo(); },
            onStateChange: (e) => { this.playing = e.data === 1; this.syncMute(); }
          }
        });
      };
      if (window.YT && window.YT.Player) make();
      else {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) { /* abaikan */ } make(); };
      }
    },
    onClick(e) {
      if (e.target.closest('#musicPlay')) { this.removeGesture(); PF.ssn.set('music-closed', ''); this.start(); return; }
      if (e.target.closest('#musicMute')) {
        this.muted = !this.muted; ls.set('music-muted', this.muted);
        if (this.ready) { if (this.muted) this.player.mute(); else this.player.unMute(); }
        this.syncMute(); return;
      }
      if (e.target.closest('#musicMin')) {
        // Pemutar disembunyikan → musik WAJIB berhenti (tidak boleh berbunyi tanpa pemutar terlihat)
        this.wantPlay = false;
        if (this.ready) this.player.pauseVideo();
        PF.ssn.set('music-closed', this.id);
        this.renderPill(false);
        const p = $('#musicPlay', this.el); if (p) p.focus();
      }
    }
  };

  /** Poin 7: lebah yang mengikuti kursor dan menghampiri saat kursor berhenti. */
  const BEE_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><clipPath id="beeBody"><ellipse cx="30" cy="38" rx="19" ry="13"/></clipPath></defs>
    <ellipse class="wing" cx="27" cy="17" rx="8" ry="13" fill="#E6F4FF" fill-opacity=".9" stroke="#8EC3EE" stroke-width="1.5"/>
    <ellipse class="wing w2" cx="37" cy="19" rx="7" ry="11" fill="#F2F9FF" fill-opacity=".9" stroke="#8EC3EE" stroke-width="1.5"/>
    <path d="M12 36 L3 38.5 L12 41 Z" fill="#0B1F3A"/>
    <ellipse cx="30" cy="38" rx="19" ry="13" fill="#FFC300"/>
    <g clip-path="url(#beeBody)" fill="#0B1F3A"><rect x="19" y="20" width="5" height="40"/><rect x="29" y="20" width="5" height="40"/><rect x="39" y="20" width="4" height="40"/></g>
    <ellipse cx="30" cy="38" rx="19" ry="13" fill="none" stroke="#0B1F3A" stroke-width="2"/>
    <circle cx="50" cy="34" r="9" fill="#0B1F3A"/>
    <circle cx="53" cy="31.5" r="2.6" fill="#fff"/><circle cx="53.8" cy="31.5" r="1.2" fill="#0B1F3A"/>
    <path d="M50 26 Q50 18 45 15 M54 26 Q57 18 61 17" stroke="#0B1F3A" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
  const Bee = {
    on: false, el: null, raf: 0,
    x: 0, y: 0, mx: null, my: null, last: 0, face: 1,
    init(enabled) {
      const ok = enabled !== false && !reduceMotion && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (ok && !this.on) this.start();
      else if (!ok && this.on) this.stop();
    },
    start() {
      this.on = true;
      this.el = document.createElement('div');
      this.el.className = 'bee';
      this.el.setAttribute('aria-hidden', 'true');
      this.el.innerHTML = BEE_SVG;
      document.body.appendChild(this.el);
      this.x = window.innerWidth - 90; this.y = 140;
      this.onMove = (e) => { this.mx = e.clientX; this.my = e.clientY; this.last = performance.now(); };
      this.onVis = () => { if (document.hidden) cancelAnimationFrame(this.raf); else this.loop(); };
      window.addEventListener('mousemove', this.onMove, { passive: true });
      document.addEventListener('visibilitychange', this.onVis);
      this.loop();
    },
    stop() {
      this.on = false;
      cancelAnimationFrame(this.raf);
      window.removeEventListener('mousemove', this.onMove);
      document.removeEventListener('visibilitychange', this.onVis);
      if (this.el) this.el.remove();
      this.el = null;
    },
    loop() {
      cancelAnimationFrame(this.raf);
      const step = (t) => {
        if (!this.on) return;
        const px = this.x;
        let tx, ty, k;
        if (this.mx === null) {                       // belum ada kursor: melayang santai
          tx = window.innerWidth - 90 + Math.cos(t / 900) * 30; ty = 140 + Math.sin(t / 700) * 20; k = 0.03;
        } else if (t - this.last > 450) {             // kursor berhenti: lebah menghampiri & berputar kecil
          tx = this.mx + 22 + Math.cos(t / 380) * 12; ty = this.my - 26 + Math.sin(t / 290) * 9; k = 0.075;
        } else {                                      // kursor bergerak: mengikuti dari belakang
          tx = this.mx - 44; ty = this.my - 30; k = 0.035;
        }
        this.x += (tx - this.x) * k;
        this.y += (ty - this.y) * k;
        const vx = this.x - px;
        if (vx > 0.35) this.face = 1; else if (vx < -0.35) this.face = -1;
        const tilt = Math.max(-18, Math.min(18, vx * 3));
        const bob = Math.sin(t / 110) * 1.8;
        this.el.style.transform = `translate3d(${(this.x - 23).toFixed(1)}px, ${(this.y - 23 + bob).toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg) scaleX(${this.face})`;
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }
  };

  /** Dipanggil setiap data tampil (idempoten): menyalakan/mematikan fitur sesuai Pengaturan. */
  function initExtras(s) {
    Music.init(s.musik_youtube);
    Bee.init(s.animasi_lebah);
  }

  function bindExtras() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-close-pm]') || t.id === 'projModal') { closeModal('#projModal'); return; }
      if (t.closest('[data-close-tm]') || t.id === 'testiModal') { closeModal('#testiModal'); return; }
      const pc = t.closest('[data-popen]');
      if (pc && !t.closest('.proj-go')) { openProject(pc.getAttribute('data-popen')); return; }
      const tc = t.closest('[data-tidx]');
      if (tc && !t.closest('.modal')) { openTesti(parseInt(tc.getAttribute('data-tidx'), 10)); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePopups(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-popen], [data-tidx]')) {
        e.preventDefault();
        e.target.click();
      }
    });
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 7: MEMUAT DATA (cache → Turbo → server, tanpa layar kosong)
  // ════════════════════════════════════════════════════════
  /** Tampilkan data. Render hanya jika hash berbeda dari yang sedang tampil. */
  function show(data, h, src) {
    if (!data || !data.settings || (S.h && h === S.h)) return;
    S.data = data; S.h = h || '';
    if (src !== 'cache') ls.set('pub', { h: S.h, data, t: Date.now() });
    PF.applyTheme(data.settings);
    if (data.settings.situs_aktif === false) {
      showState('Site under maintenance', 'This page is briefly under maintenance. Please come back in a few moments.', 'tools');
      return;
    }
    hideState();
    renderAll();
    document.body.classList.remove('is-loading');
    initExtras(data.settings);
    if (!S.started) {
      S.started = true;
      initReveal();
      initScrollSpy();
      restoreDraft();
      scheduleVisit();
      setTimeout(() => flushQueue(false), 4000);   // kirim sisa antrean kunjungan sebelumnya
      setTimeout(flushOutbox, 2500);
    } else {
      markIn('#site');                               // data baru: tampil tanpa animasi ulang
    }
  }

  function onServer(res) {
    S.lastServer = Date.now();
    if (!res || !res.success) throw new Error((res && res.message) || 'Could not load the data.');
    if (res.data && res.data.same) {
      const c = ls.get('pub', null);
      if (c && c.h === res.h) { c.t = Date.now(); ls.set('pub', c); }
      return;
    }
    show(res.data, res.h, 'server');
  }

  let waitingTurbo = false;
  function fetchFromServer() {
    PF.apiGet({ action: 'public', h: S.h || '' }).then(onServer).catch((e) => {
      if (!S.data && !waitingTurbo) showState('Could not load the page', (e && e.message) || 'Connection problem.', 'wifi-off', true);
    });
  }

  function load() {
    if (!PF.configured) {
      const c0 = ls.get('pub', null);
      if (c0 && c0.data) { show(c0.data, c0.h, 'cache'); return; }
      showState('Site not configured', 'The site owner has not set GAS_URL in js/config.js yet. See PANDUAN-INSTALASI.md.', 'gear');
      return;
    }
    const c = window.__PF_CACHE && window.__PF_CACHE.data && window.__PF_CACHE.h ? window.__PF_CACHE : null;
    if (c) show(c.data, c.h, 'cache');

    const turbo = window.__PF_TURBO;
    if (turbo && !S.data) {
      waitingTurbo = true;
      turbo.then((j) => { waitingTurbo = false; if (j && j.h && j.data && !S.data) show(j.data, j.h, 'turbo'); })
        .catch(() => { waitingTurbo = false; })
        .then(() => { if (!S.data && serverFailed) showState('Could not load the page', 'Connection to the server failed.', 'wifi-off', true); });
    }

    let serverFailed = false;
    const early = window.__PF_GAS;   // permintaan yang sudah dimulai di <head>
    if (early) {
      early.then(onServer).catch(() => {
        // Percobaan pertama gagal → ulangi dengan retry bertahap
        PF.apiGet({ action: 'public', h: S.h || '' }).then(onServer).catch((e) => {
          serverFailed = true;
          if (!S.data && !waitingTurbo) showState('Could not load the page', (e && e.message) || 'Connection problem.', 'wifi-off', true);
        });
      });
    } else if (!c || Date.now() - (c.t || 0) > 30000) {
      fetchFromServer();
    }
  }

  // Kembali ke tab setelah lama → periksa konten terbaru (murah: server cukup menjawab "sama")
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (S.data && PF.configured && hiddenAt && Date.now() - hiddenAt > 10 * 60000) PF.apiGet({ action: 'public', h: S.h }, { tries: 1 }).then(onServer).catch(() => {});
  });

  // Akses diagnosis di Console (mis. PFApp.state)
  window.PFApp = { state: S, reload: fetchFromServer };

  bindUI();
  bindExtras();
  load();
})();
