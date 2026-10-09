/* Renders every page of the local Daytona replica from assets/data.js + data-extra.js.
   Every Daytona link and image stays inside this folder, so the site works offline. */
(function () {
  var D = window.DAYTONA;
  var body = document.body;
  var ROOT = body.dataset.root || '';
  var PAGE = body.dataset.page;
  var SLUG = body.dataset.slug || '';
  var RKEY = body.dataset.region;
  var R = D.regions[RKEY];
  var X = R ? (D.extra[RKEY] || {}) : {};
  var ID = new URLSearchParams(location.search).get('id');
  var LIVE = 'https://www.daytonahomes.ca';
  var HERO_IMG = 'corporate/comfort-commercial-stills/livingroom-1080x1920.jpg/31072625043b28350479decc618d9452/livingroom-1080x1920.webp';
  var PER_PAGE = 12;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-CA'); }
  // Images are stored in assets/img (see tools/fetch-assets.js); names must match localName() there.
  function clean(s) { return decodeURIComponent(s).replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '_'); }
  function img(path) {
    if (/^https?:/.test(path)) return path.indexOf(LIVE) === 0 ? ROOT + 'assets/img/' + clean(path.slice(LIVE.length)) : path;
    return ROOT + 'assets/img/' + clean(path.split('/').slice(-2).join('-'));
  }
  function standin(topic) { return 'Stand-in text about ' + topic + '. Replace with the approved Daytona copy.'; }
  function byId(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }

  /* ---------------- Local routes ---------------- */
  function home(key) { return ROOT + (key ? D.regions[key].slug + '/' : '') + 'index.html'; }
  function cp(page) { return ROOT + page + '/index.html'; }                       // corporate page
  function rp(page, id) { return ROOT + R.slug + '/' + page + '/index.html' + (id ? '?id=' + encodeURIComponent(id) : ''); }
  function listings(key) { return ROOT + D.regions[key].slug + '/move-in-ready/index.html'; }
  function a(href, label, cls) { return '<a class="' + (cls || '') + '" href="' + esc(href) + '">' + label + '</a>'; }
  function out(href, label, cls) { return '<a class="' + (cls || '') + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + label + '</a>'; }
  function mapsUrl(address) { return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address); }
  function communityId(name) { var c = (X.communities || []).filter(function (c) { return c.title === name; })[0]; return c ? c.id : null; }

  function logo(href) {
    return '<a class="logo" href="' + href + '"><img src="' + img(LIVE + '/img/favicons/favicon-192x192.png') + '" alt="" width="44" height="44">' +
      '<span><b>Daytona</b><i>HOMES</i></span><span class="sr-only"> Homes</span></a>';
  }

  /* Outlined frame with notches. notches = [[x, y, w, h], ...] in percent. */
  function floor(polygon, notches) {
    var html = '<div class="floor" aria-hidden="true"><div class="shape" style="clip-path:polygon(' + polygon + ')"></div>';
    notches.forEach(function (n) {
      var l = n[0] > 0, t = n[1] > 0, r = n[0] + n[2] < 100, b = n[1] + n[3] < 100;
      var radius = [(t && l) ? '8px' : 0, (t && r) ? '8px' : 0, (b && r) ? '8px' : 0, (b && l) ? '8px' : 0].join(' ');
      html += '<div class="notch" style="left:' + n[0] + '%;top:' + n[1] + '%;width:' + n[2] + '%;height:' + n[3] + '%;' +
        'border-width:' + [t ? 2 : 0, r ? 2 : 0, b ? 2 : 0, l ? 2 : 0].join('px ') + 'px;border-radius:' + radius + '"></div>';
    });
    return html + '</div>';
  }

  /* ---------------- Navigation ---------------- */
  var LANGS = ['English', 'Chinese (Traditional)', 'Chinese (Simplified)', 'Vietnamese', 'Filipino', 'Arabic', 'Urdu', 'Amharic', 'Somali', 'Hindi', 'Punjabi', 'Spanish', 'French'];
  var LABEL_SLUG = {
    'About Us': 'our-company', 'Our Comfort Blueprint': 'comfort-blueprint', 'Daytona Cares': 'daytona-cares',
    'Daytona Homes X Virtuo': 'virtuo', 'Daytona x Virtuo': 'virtuo', 'News': 'blog', 'Mortgage and Approval Process': 'get-pre-approved',
    'Referral Rewards': 'referral-program', 'Realtor Program': 'realtor-program', 'List & Save': 'list-and-save', 'Solara': 'solara'
  };
  function lang() {
    return '<div class="lang"><i class="fas fa-language"></i><select aria-label="Select Language">' +
      LANGS.map(function (l) { return '<option>' + l + '</option>'; }).join('') + '</select></div>';
  }
  function navLink(label, href, current) {
    return '<a class="nav-link' + (current ? ' current' : '') + '" href="' + esc(href) + '">' + esc(label) + '</a>';
  }
  function navGroup(label, children, open) {
    return '<div class="nav-group' + (open ? ' open' : '') + '"><button class="nav-link" type="button" aria-expanded="' + !!open + '">' + esc(label) +
      '<i class="fas fa-chevron-down"></i></button><div class="nav-children">' + children.join('') + '</div></div>';
  }
  function navParts() {
    function at(page, slug) { return PAGE === page || (PAGE === 'content' && SLUG === slug); }
    if (!R) {
      return {
        top: ['our-company:About Us', 'daytona-cares:Daytona Cares', 'careers:Careers'].map(function (s) { s = s.split(':'); return navLink(s[1], cp(s[0]), SLUG === s[0]); }),
        bottom: [navLink('Warranty', cp('warranty'), SLUG === 'warranty')],
        logoHref: home()
      };
    }
    var why = R.whyOrder.map(function (c) { return [c[0], LABEL_SLUG[c[0]]]; });
    var build = [['Mortgage and Approval Process', 'get-pre-approved'], ['Choosing a Home', 'getting-started'], ['Daytona Building Process', 'what-to-expect']];
    function group(label, items) {
      var open = PAGE === 'content' && items.some(function (i) { return i[1] === SLUG; });
      return navGroup(label, items.map(function (i) { return navLink(i[0], rp(i[1]), at('', i[1])); }), open);
    }
    var top = [
      group('Why Daytona', why), group('Build a home', build),
      navLink('Explore our models', rp('explore-our-models'), PAGE === 'models' || PAGE === 'detail-models'),
      navLink(R.listingsLabel, listings(RKEY), PAGE === 'listings' || PAGE === 'detail-homes'),
      navLink('Communities', rp('communities'), PAGE === 'communities' || PAGE === 'detail-community'),
      navLink('Get Pre-Approved!', rp('pre-approved'), at('', 'pre-approved'))
    ];
    var bottom = [navLink(R.showHomes, rp('visit-a-showhome'), PAGE === 'showhomes' || PAGE === 'detail-showhome')];
    if (R.hasNews) bottom.push(navLink('News', rp('blog'), PAGE === 'blog' || PAGE === 'detail-post'));
    bottom.push(navLink('Contact us', rp('contact-us'), at('', 'contact-us')));
    return { top: top, bottom: bottom, logoHref: home(RKEY) };
  }
  function regionPicker() {
    return '<div class="pick-region"><h2>Select a region:</h2><div>' + Object.keys(D.regions).map(function (k) {
      return navLink(D.regions[k].name, home(k));
    }).join('') + '</div></div>';
  }
  function chrome() {
    var n = navParts();
    var tag = R ? '<span class="region-tag">' + esc(R.name) + '</span><br>' : '';
    var banner = R ? '<div class="banner" role="region" aria-label="Promotion"><span>Get ' + a(rp('pre-approved'), 'pre-approved') +
      ' now with our preferred lender program!</span><button type="button" aria-label="Close banner"><i class="fas fa-xmark"></i></button></div>' : '';
    return banner +
      '<aside class="sidebar" aria-label="Main">' + lang() +
        '<div class="side-top">' + tag + logo(n.logoHref) + '<nav class="side-links">' + n.top.join('') + '</nav></div>' +
        '<div class="side-bottom' + (R ? ' navy' : '') + '"><nav class="side-links">' + n.bottom.join('') + '</nav></div>' +
      '</aside>' +
      '<div class="mobile-bar">' + logo(n.logoHref) +
        '<button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mobile-menu"><i class="fas fa-bars"></i></button></div>' +
      '<div class="mobile-menu" id="mobile-menu">' + lang() +
        '<nav class="side-links">' + n.top.join('') + '</nav>' +
        '<div class="side-bottom"><nav class="side-links">' + n.bottom.join('') + '</nav>' + regionPicker() + '</div>' +
      '</div>';
  }

  /* ---------------- Footer ---------------- */
  function legal() {
    return a(cp('privacy-policy'), 'Privacy Policy') + a(cp('bill-s-211-report'), 'Bill S-211 Report') + '<span>&copy; 2026 Daytona Homes. All Rights Reserved</span>';
  }
  function footer() {
    function row(label, href, icon) {
      return '<a class="row" href="' + esc(href) + '">' + esc(label) + (icon ? '<i class="fas fa-arrow-up-right-from-square"></i>' : '') + '</a>';
    }
    var corporate = '<div class="footer-col"><h3>Corporate</h3>' + row('Home', home(), 1) + row('About Us', cp('our-company'), 1) +
      row('Daytona Cares', cp('daytona-cares'), 1) + row('Careers', cp('careers'), 1) + row('Warranty', cp('warranty'), 1) + '</div>';
    var middle, contact, treaty = '';
    if (R) {
      middle = '<div class="footer-col"><h3>' + esc(R.name) + '</h3>' + R.footerLinks.map(function (l) { return row(l[0], rp(LABEL_SLUG[l[0]]), l[2]); }).join('') + '</div>';
      contact = '<div class="footer-col"><h3>Get Connected</h3>' + row('Contact Us', rp('contact-us')) +
        '<div class="contact"><span>Phone: &nbsp;<a href="tel:' + R.phone + '">' + R.phone + '</a></span>' +
        out(mapsUrl(R.address.join(', ')), R.address.map(esc).join('<br>')) +
        '<div class="social">' + R.social.map(function (s) {
          return '<a href="' + s[2] + '" target="_blank" rel="noopener" aria-label="' + s[1] + '"><i class="fab fa-' + s[0] + '"></i></a>';
        }).join('') + '</div></div></div>';
      treaty = '<div class="treaty"><h3>' + esc(R.treaty) + '</h3><p>[Stand-in] The approved land acknowledgement for ' + esc(R.treaty) + ' goes here.</p></div>';
    } else {
      middle = '<div class="footer-col"><h3>Regions</h3>' + Object.keys(D.regions).map(function (k) { return row(D.regions[k].name, home(k)); }).join('') + '</div>';
      contact = '<div class="footer-col"><h3>Get Connected</h3>' + Object.keys(D.regions).map(function (k) {
        return row('Contact ' + D.regions[k].city, ROOT + D.regions[k].slug + '/contact-us/index.html');
      }).join('') + '</div>';
    }
    return '<footer class="footer">' +
      '<div class="footer-top">' + logo(home(RKEY)) + '<a class="btn outline" href="#main"><i class="fas fa-arrow-up"></i> Back to top</a></div>' +
      '<div class="footer-grid">' + corporate + middle + contact +
        '<div class="newsletter"><p>Subscribe to our newsletter</p><button class="btn js-demo" type="button">Subscribe</button></div></div>' +
      treaty + '<div class="legal">' + legal() + '</div></footer>' +
      '<div class="tacada"><b>TACADA</b>' + out('https://tacada.ca/', 'A Tacada Company') + '</div>';
  }

  /* ---------------- Shared building blocks ---------------- */
  function crumbs(trail) {
    var html = '<nav class="crumbs" aria-label="Breadcrumb"><img src="' + img(LIVE + '/img/favicons/favicon-32x32.png') + '" alt="">';
    trail.forEach(function (t, i) {
      html += (i ? '<i class="fas fa-chevron-right"></i>' : '') + (Array.isArray(t) ? a(t[1], esc(t[0])) : '<span>' + esc(t) + '</span>');
    });
    return html + '</nav>';
  }
  function pageHero(title, trail, intro, image) {
    return '<section class="page-hero">' + floor('0% 0%,100% 0%,100% 90%,70% 90%,70% 100%,0% 100%', [[70, 90, 30, 10]]) +
      '<div class="page-hero-copy">' + crumbs(trail) + '<h1>' + esc(title) + '</h1><p>' + esc(intro) + '</p></div>' +
      '<div class="page-hero-img"><img src="' + img(image || HERO_IMG) + '" alt=""></div></section>';
  }
  function trailFor(title) { return [['Home', R ? home(RKEY) : home()], title]; }
  function pills(o) {
    return '<div class="pills" aria-label="home-features">' +
      '<span><i class="fa fa-bed"></i><b>' + esc(o.beds) + '</b> Bed</span>' +
      '<span><i class="fa fa-bath"></i><b>' + esc(o.baths) + '</b> Bath</span>' +
      '<span><i class="fa fa-ruler-horizontal"></i><b>' + esc(o.sqft) + '</b> <span class="sr-only">square feet</span><span aria-hidden="true">sq.ft</span></span></div>';
  }
  function priceHtml(h) {
    if (h.priceGst) return '<span>' + money(h.priceGst) + ' GST Included</span><span>' + money(h.pricePre) + ' Pre-GST</span>';
    if (h.pricePre) return '<span>' + money(h.pricePre) + '</span><span>Pre-GST. Includes home &amp; lot.</span>';
    return '<span>Sale Pending</span>';
  }
  function homeCard(h) {
    var icon = /POSSESSION|COMING/i.test(h.snipe) ? 'fa-calendar-check' : 'fa-tag';
    return '<article class="card-home"><div class="image"><img loading="lazy" src="' + img(h.image) + '" alt="" width="605" height="440">' +
        (h.community ? '<div class="community-tag"><span class="sr-only">Community: </span>' + esc(h.community) + '</div>' : '') +
        (h.snipe ? '<div class="snipe"><i class="fas ' + icon + '"></i><span>' + esc(h.snipe) + '</span></div>' : '') + '</div>' +
      '<h3>' + a(rp('homes', h.id), esc(h.title)) + '</h3>' + pills(h) +
      (h.features.length ? '<p class="feat"><span class="sr-only">Home Type: </span>' + esc(h.features.join(', ')) + '</p>' : '') +
      '<p class="price" aria-label="Price">' + priceHtml(h) + '</p></article>';
  }
  function modelCard(m) {
    return '<article class="card-home"><div class="image"><img loading="lazy" src="' + img(m.image) + '" alt="" width="605" height="440"></div>' +
      '<h3>' + a(rp('models', m.id), esc(m.title)) + '</h3>' + pills(m) + '<p class="feat">' + esc(m.type || '') + '</p></article>';
  }
  function showhomeCard(s) {
    return '<article class="card-home"><div class="image"><img loading="lazy" src="' + img(s.image) + '" alt="" width="605" height="440">' +
        (s.community ? '<div class="community-tag">' + esc(s.community) + '</div>' : '') + '</div>' +
      '<h3>' + a(rp('showhome', s.id), esc(s.title)) + '</h3>' + (s.type ? '<p class="feat">' + esc(s.type) + '</p>' : '') +
      (s.address ? '<p class="addr"><i class="fas fa-map-marker"></i>' + out(mapsUrl(s.address + ', ' + R.city), esc(s.address)) + '</p>' : '') + '</article>';
  }
  function communityCard(c) {
    return '<article class="card-archive"><div class="image"><img loading="lazy" src="' + img(c.image) + '" alt=""></div>' +
      (c.area ? '<span class="region-tag">' + esc(c.area) + '</span>' : '') +
      '<h3 class="purple">' + a(rp('community', c.id), esc(c.title)) + '</h3><p>' + standin('the ' + c.title + ' community') + '</p></article>';
  }
  function postCard(p) {
    return '<article class="card-archive post-card"><div class="image wide"><img loading="lazy" src="' + img(p.image) + '" alt=""></div>' +
      '<h3>' + a(rp('post', p.id), esc(p.title)) + '</h3></article>';
  }
  function grid(cards, cls) { return '<div class="homes ' + (cls || '') + '">' + cards.join('') + '</div>'; }
  function form(title, extraFields) {
    var fields = ['First name', 'Last name', 'Email', 'Phone'].concat(extraFields || []);
    return '<section class="form-block" id="contact-form"><h2>' + esc(title) + '</h2><form class="demo-form" novalidate><div class="form-grid">' +
      fields.map(function (f) {
        var id = 'ff-' + slugify(f);
        return '<div class="field"><label for="' + id + '">' + esc(f) + '</label><input id="' + id + '" type="' + (f === 'Email' ? 'email' : f === 'Phone' ? 'tel' : 'text') + '" autocomplete="off"></div>';
      }).join('') +
      '<div class="field full"><label for="ff-message">Message</label><textarea id="ff-message" rows="4"></textarea></div></div>' +
      '<button class="btn" type="submit">Submit</button><p class="form-note" role="status"></p></form></section>';
  }
  function consultant(context) {
    return '<aside class="consultant"><div class="avatar"><i class="fas fa-user"></i></div><div><h3>Sales Consultant</h3>' +
      '<p>Stand-in consultant details for ' + esc(context) + '.</p><p><a href="tel:' + R.phone + '">' + R.phone + '</a></p></div>' +
      '<div class="consultant-actions">' + a('#contact-form', 'Request Appointment', 'btn') + a('#contact-form', 'Send a Message', 'btn outline') + '</div></aside>';
  }
  function showhomeStrip(title) {
    return '<section class="section wrap"><h2 class="section-title">' + esc(title) + '</h2>' +
      grid((X.showhomes || []).slice(0, 3).map(showhomeCard)) + '<p class="more">' + a(rp('visit-a-showhome'), 'See all show homes', 'btn outline') + '</p></section>';
  }

  /* ---------------- Corporate landing ---------------- */
  function corporate() {
    return '<section class="corp">' +
      '<div class="corp-media"><img src="' + img('edmonton/edmonton-rosemont-discovery-sh-kitchen-city-brantford.png/cdfcdc8767e8fdf3d1435db676fbebdf/edmonton-rosemont-discovery-sh-kitchen-city-brantford.webp') + '" alt="">' +
        '<h1 class="corp-title"><span>Crafted</span><span>with</span><span>care</span></h1></div>' +
      '<div class="corp-band"><h2>Select a region</h2><nav class="corp-regions" aria-label="Regions">' +
        Object.keys(D.regions).map(function (k) { return a(home(k), esc(D.regions[k].name)); }).join('') + '</nav>' +
        '<div class="corp-legal">' + legal() + '</div></div>' +
      floor('0% 0%,100% 0%,100% 30%,80% 30%,80% 70%,100% 70%,100% 100%,10% 100%,10% 60%,0% 60%', [[80, 30, 20, 40], [0, 60, 10, 40]]) +
      '</section>';
  }

  /* ---------------- Region home ---------------- */
  function stack(words) { return words.map(function (w) { return '<span>' + w + '</span>'; }).join(''); }
  function promoHref(p) {
    if (/first-time/i.test(p.title)) return cp('first-time-buyers');
    if (/edgemont/i.test(p.title) && byId(X.showhomes, 'the-flex')) return rp('showhome', 'the-flex');
    if (/solara/i.test(p.title)) return rp('solara');
    if (/townhomes/i.test(p.title)) return rp('communities');
    return rp('blog');
  }
  function caresBlock() {
    return '<section class="cares"><div class="cares-box">' +
      floor('0% 0%,66% 0%,66% 22%,100% 22%,100% 100%,8% 100%,8% 62%,0% 62%', [[66, 0, 34, 22], [0, 62, 8, 38]]) +
      '<div><p class="vlabel">Daytona Cares</p><h2>' + stack(['Giving', 'back is', 'at our', 'core.']) + '</h2></div>' +
      '<div class="cares-side"><h3>People always come first</h3><p>' + standin('supporting local and charitable organizations') + '</p>' +
      a(R ? rp('daytona-cares') : cp('daytona-cares'), '<i class="fas fa-arrow-up-right-from-square"></i> Visit Daytona Cares', 'btn') + '</div></div>' + charityLogos() + '</section>';
  }
  function charityLogos() {
    return '<div class="charities">' + D.charities.map(function (c) { return '<img loading="lazy" src="' + img(LIVE + '/assets/' + c + '.png') + '" alt="">'; }).join('') + '</div>';
  }
  function regionHome() {
    var promos = R.promos.map(function (p) {
      return '<a class="promo" href="' + promoHref(p) + '"><img loading="lazy" src="' + img(p.img) + '" alt="">' +
        '<div>' + (p.tag ? '<span class="tag">' + esc(p.tag) + '</span>' : '') + '<h3>' + esc(p.title) + '</h3><p>' + esc(p.text) + '</p></div></a>';
    }).join('');
    var steps = [
      ['Choose your community', 'picking a neighbourhood', 'Communities', rp('communities')],
      ['Find a floorplan', 'browsing home models', 'Home models', rp('explore-our-models')],
      ['Make it your own', 'visiting a show home', 'Showhomes', rp('visit-a-showhome')]
    ].map(function (s, i) {
      return '<div class="step"><b>' + (i + 1) + '.</b><h3>' + s[0] + '</h3><p>' + standin(s[1]) + '</p>' + a(s[3], s[2] + '<i class="fas fa-arrow-right"></i>') + '</div>';
    }).join('');
    var news = (X.posts || []).slice(0, 3).map(function (n) {
      return '<a class="post" href="' + rp('post', n.id) + '"><img loading="lazy" src="' + img(n.image) + '" alt=""><h3>' + esc(n.title) + '</h3></a>';
    }).join('');

    return '<section class="hero"><img src="' + img(HERO_IMG) + '" alt="">' +
        floor('0% 0%,61% 0%,61% 42%,100% 42%,100% 100%,49% 100%,49% 88%,0% 88%', [[61, 0, 39, 42], [0, 88, 49, 12]]) +
        '<h1>' + stack(['Homes', 'for', 'real', 'life']) + '</h1>' +
        '<div class="hero-side"><p>' + esc(R.heroIntro) + '</p>' + a(rp('visit-a-showhome'), 'Visit a show home', 'btn') + '</div></section>' +
      '<section class="section wrap"><h2 class="section-title">Promos &amp; News</h2>' +
        '<div class="promos"><span class="vlabel">Promos &amp; News</span><div class="cards3">' + promos + '</div></div></section>' +
      '<section class="build"><div class="build-copy"><h2>' + stack(['Build', 'your', 'home']) + '</h2>' +
        '<p>' + standin('the build process') + '</p>' + a(rp('getting-started'), 'Start planning', 'btn white') + '</div>' +
        '<div class="build-img"><img loading="lazy" src="' + img(R.buildImg) + '" alt=""></div><div class="steps">' + steps + '</div></section>' +
      '<section class="comfort"><div class="comfort-copy"><p class="vlabel">Homes for real life</p><h2>' + esc(R.comfortTitle) + '</h2>' +
        '<h3>' + esc(R.comfortSub) + '</h3><p>' + standin('putting comfort first') + '</p></div>' + video() + '</section>' +
      caresBlock() +
      '<section class="news"><h2>Recent news posts</h2><p>Updates, events and other news from Daytona ' + esc(R.city) + '!</p>' +
        a(rp('blog'), 'All ' + esc(R.city) + ' news', 'btn outline') + '<div class="cards3">' + news + '</div></section>';
  }
  function video(image) {
    return '<div class="video"><img loading="lazy" src="' + img(image || HERO_IMG) + '" alt=""><span><i class="fas fa-play"></i></span></div>';
  }

  /* ---------------- Content pages (about, programs, contact, corporate...) ---------------- */
  function split(h, topic, image, flip, cta) {
    return '<section class="split' + (flip ? ' flip' : '') + '"><div><h2>' + esc(h) + '</h2><p>' + standin(topic) + '</p><p>' + standin(topic) + '</p>' +
      (cta ? a(cta[1], esc(cta[0]), 'btn') : '') + '</div><div class="split-img"><img loading="lazy" src="' + img(image || HERO_IMG) + '" alt=""></div></section>';
  }
  function accordion(h, items) {
    return '<section class="accordion wrap"><h2 class="section-title">' + esc(h) + '</h2>' + items.map(function (t) {
      return '<details><summary>' + esc(t) + '<i class="fas fa-plus"></i></summary><p>' + standin(t.toLowerCase()) + '</p></details>';
    }).join('') + '</section>';
  }
  function numbered(h, items) {
    return '<section class="section wrap"><h2 class="section-title">' + esc(h) + '</h2><div class="steps plain">' + items.map(function (t, i) {
      return '<div class="step"><b>' + (i + 1) + '.</b><h3>' + esc(t) + '</h3><p>' + standin(t.toLowerCase()) + '</p></div>';
    }).join('') + '</div></section>';
  }
  function cta(h, topic, label, href) {
    return '<section class="cta"><h2>' + esc(h) + '</h2><p>' + standin(topic) + '</p>' + a(href, esc(label), 'btn') + '</section>';
  }
  function textSections(heads) {
    return '<section class="prose wrap">' + heads.map(function (h) { return '<h2>' + esc(h) + '</h2><p>' + standin(h.toLowerCase()) + '</p><p>' + standin(h.toLowerCase()) + '</p>'; }).join('') + '</section>';
  }
  function office() {
    return '<section class="office wrap"><h2 class="section-title">' + esc(R.name) + ' head office</h2><div class="office-grid">' +
      '<p><b>Phone</b><br><a href="tel:' + R.phone + '">' + R.phone + '</a></p><p><b>Address</b><br>' + out(mapsUrl(R.address.join(', ')), R.address.map(esc).join('<br>')) + '</p>' +
      '<p><b>Emergency After-Hours Number for Homeowners</b><br>[Stand-in number]</p></div></section>';
  }
  var I = {   // hero and section images, linked from the live site
    about: '14-web-or-mls-dsc_9242_hdr-1720821073.jpeg/024e772f33bf816b5e2df8ff3eda1829/14-web-or-mls-dsc_9242_hdr-1720821073.webp',
    team: '321423813_865332028142679_4964375623230730672_n.jpg/1d2e718147edaa8ddec7e4c20a9101b6/321423813_865332028142679_4964375623230730672_n.webp',
    green: 'edmonton/built-green-images--edm/built-green-2-edm.jpg/4621e91e7b6bac45f6f35443f2c47b13/built-green-2-edm.webp',
    green2: LIVE + '/assets/edmonton/built-green-images--edm/built-green-7-edm.jpg',
    green3: LIVE + '/assets/edmonton/built-green-images--edm/built-green-6-edm.jpg',
    wolves: 'edmonton/dhi_daytona_wolves.png/f34f944256da97393f9208c9e6add242/dhi_daytona_wolves.webp',
    kitchenV: 'edmonton/dhi_ard_milan_sh_kitchen_vertical_apr_26.png/b072e327771464686c87d24d5e0564e0/dhi_ard_milan_sh_kitchen_vertical_apr_26.webp',
    exterior: LIVE + '/assets/edmonton/edmonton-alces-tiguan-sh-exterior.png',
    living: LIVE + '/assets/edmonton/edmonton-rosemont-discovery-sh-living-room-city-brantford.png',
    livingV: 'edmonton/dhi_rvw_colt_sh_living_room_vertical_apr_26.png/545def61b284f89c3aa09a6ff2a34358/dhi_rvw_colt_sh_living_room_vertical_apr_26.webp',
    milanV: 'edmonton/dhi_sal_milan_sh_kitchen_vertical_apr_26.png/6754e446db1c06fc59d70b8f646b4929/dhi_sal_milan_sh_kitchen_vertical_apr_26.webp',
    bath: 'edmonton/edmonton-alces-ocean-sh-master-bath-city-oslo.png/bc4f427d0d502cf649efa1432de036a7/edmonton-alces-ocean-sh-master-bath-city-oslo.webp',
    kitchen: 'edmonton/dhi_orc_tiguan_sh_kitchen_apr_26.png/7486c394a62d5f7def8bf973e99b1960/dhi_orc_tiguan_sh_kitchen_apr_26.webp',
    people: 'corporate/katherine-donna-osc-pic-2026-aug-3.png/3e329ccaadf4244e39b4b350c5e3ba20/katherine-donna-osc-pic-2026-aug-3.webp',
    oceanV: 'edmonton/dhi_alc_ocean_sh_kitchen_vertical_apr_26.png/ec21af75f337f412f850717b19c09952/dhi_alc_ocean_sh_kitchen_vertical_apr_26.webp',
    virtuo: LIVE + '/assets/edmonton/virtuo/virtuo-phone-image-1.png',
    greatV: 'dhi_chp_discovery_sh_great_room_vertical_apr_26.png/1d02821aa48e5e33753f9fe8dd261227/dhi_chp_discovery_sh_great_room_vertical_apr_26.webp',
    scorpio: LIVE + '/assets/edmonton/edmonton-chappelle-scorpio-sh-kitchen.png',
    milanLivingV: 'dhi_ard_milan_sh_living_room_vertical_apr_26.png/acd9a3116dedd34115ef0e36d41af37a/dhi_ard_milan_sh_living_room_vertical_apr_26.webp',
    maxima: LIVE + '/assets/edmonton/dhi_edg_maxima_sh_living_room_apr_26.png',
    bedV: 'edmonton/dhi_alc_ocean_sh_bedroom_vertical_apr_26.png/5c5f5d192491c4c3e702247fa467aa08/dhi_alc_ocean_sh_bedroom_vertical_apr_26.webp',
    corpKitchenV: 'calgary/dhc_harp_silverado_sh_kitchen_vertical_apr_26.png/7fcc8b15943050432f42d5809d3b2712/dhc_harp_silverado_sh_kitchen_vertical_apr_26.webp',
    stairsV: 'calgary/dhc_harp_silverado_sh_stairs_vertical_apr_26.png/4a2d217612be4b2e26e33e2a8b7b84ee/dhc_harp_silverado_sh_stairs_vertical_apr_26.webp',
    fireV: 'calgary/dhc_harp_silverado_sh_fireplace_vertical_apr_26.png/b069546bb2a2e66ebef36c029d0207f8/dhc_harp_silverado_sh_fireplace_vertical_apr_26.webp',
    staff: '368239869_729226539217943_1891583721141071796_n.jpg/096cda70bfad07cc336e2ac159688c4c/368239869_729226539217943_1891583721141071796_n.webp'
  };
  var GREEN = ['Project Forest Partnership', 'LED Lighting', 'Carpet', 'Low-Flow Fixtures'];
  function caresPage() {
    return ['Daytona Cares', 'giving back to the community', I.wolves,
      split('How do we do it?', 'partnering with local initiatives', I.team) +
      '<section class="comfort"><div class="comfort-copy"><h2>Daytona Cares day</h2><h3>"The best part of every year."</h3><p>' + standin('the annual volunteer day') + '</p></div>' + video(I.team) + '</section>' +
      '<section class="section wrap"><h2 class="section-title">Organizations we support</h2>' + charityLogos() + '</section>' +
      split('Corporate Responsibility', 'company values and giving back', I.living, true)];
  }
  var CONTENT = {
    // ----- region pages: [title, intro topic, hero image, body html] -----
    'our-company': function () {
      if (!R) return ['About Us', 'the company and its history', I.corpKitchenV,
        '<section class="section wrap"><h2 class="section-title">Crafted with Care</h2><div class="steps plain">' + ['High-Quality', 'People-Focused', 'Comfortable'].map(function (t) {
          return '<div class="step"><h3>' + t + '</h3><p>' + standin(t.toLowerCase() + ' homes') + '</p></div>'; }).join('') + '</div></section>' +
        split('Over 30 years of home building', 'real homes for real lives', I.living) +
        '<section class="comfort"><div class="comfort-copy"><h2>Real homes for real lives.</h2><p>' + standin('the brand film') + '</p></div>' + video(I.scorpio) + '</section>' +
        accordion('Building Sustainable Futures', ['LED Lighting', 'Carpet', 'Low-Flow Fixtures', 'Project Forest Partnership']) + caresBlock()];
      return ['About Us', 'the company and its history in ' + R.city, I.about,
        split('Crafted with Care', 'more than 30 years of experience', I.living) +
        split('Our Promise', 'the promise made to homeowners', I.kitchen, true) +
        split('The Daytona Difference', 'what sets these homes apart', I.bath) +
        accordion('Environmental Responsibility', GREEN) +
        split("Western Canada's Builder", 'building across Western Canada', I.exterior, true) +
        cta('We care about the communities we build in', 'community giving', 'Visit Daytona Cares', rp('daytona-cares'))];
    },
    'comfort-blueprint': function () {
      return ['Our Comfort Blueprint', 'how comfort is designed into every home', I.green,
        split('Our Approach', 'the comfort-first approach', I.green2) +
        split('BUILT GREEN Certified Performance', 'certified energy performance', I.green3, true) +
        split('Homes Designed for Today and Tomorrow', 'future-ready design', I.living) +
        accordion('Building For What Comes Next', ['Energy efficiency', 'Healthier indoor air', 'Durable materials', 'Water conservation']) +
        form('Get in touch with Daytona')];
    },
    'daytona-cares': caresPage,
    'get-pre-approved': function () {
      return ['Mortgage and Approval Process', 'how mortgages and approvals work', I.kitchenV,
        split('Ready to start talking about buying a home?', 'the first conversation about buying', I.exterior) +
        numbered('Step-by-Step Guide to the Home Buying Process', ['Set your budget', 'Get pre-approved', 'Choose your home', 'Finalize financing', 'Take possession']) +
        accordion('Mortgage types', ['Fixed rate', 'Variable rate', 'Open and closed mortgages']) +
        accordion('Down payments', ['Minimum down payment', 'Mortgage default insurance']) +
        accordion('Types of Closing Costs', ['Legal fees', 'Property taxes', 'Home insurance']) +
        accordion('Frequently asked questions', ['How long does approval take?', 'What documents do I need?', 'Can I lock in a rate?']) +
        cta('Learn about our preferred lenders list', 'the preferred lender program', 'Get Pre-Approved', rp('pre-approved')) +
        form('Contact Us and Get Pre-Approved Today!')];
    },
    'getting-started': function () {
      return ['Choosing a Home', 'the three steps to choosing a home', I.livingV,
        '<section class="section wrap"><h2 class="section-title">1. Choose your community</h2>' + grid((X.communities || []).map(communityCard)) + '</section>' +
        '<section class="section wrap"><h2 class="section-title">2. Find a floorplan</h2>' + grid((X.models || []).slice(0, 6).map(modelCard)) +
          '<p class="more">' + a(rp('explore-our-models'), 'See all models', 'btn outline') + '</p></section>' +
        showhomeStrip('3. Explore our showhomes')];
    },
    'what-to-expect': function () {
      return ['Daytona Building Process', 'what to expect while building', I.milanV,
        '<section class="comfort"><div class="comfort-copy"><h2>We are so happy!</h2><p>' + standin('a homeowner testimonial') + '</p></div>' + video(I.living) + '</section>' +
        split('1. Choose Your Home', 'choosing a community and floorplan', I.bath) +
        split('2. Make It Yours', 'design selections and finishes', I.kitchen, true) +
        split('3. Welcome Home!', 'possession day and warranty', I.living) + showhomeStrip('Find a Show Home')];
    },
    'pre-approved': function () {
      return ['Get Pre-Approved!', 'getting pre-approved with a preferred lender', I.people,
        split('Why work with our preferred lenders?', 'the benefits of preferred lenders', I.kitchen) + form('Start your approval')];
    },
    'contact-us': function () {
      return ['Contact Us', 'reaching the ' + R.name + ' team', I.people, form("Let's Connect!") + office()];
    },
    'virtuo': function () {
      return ['Smarter Home Ownership Starts Here', 'the Virtuo home ownership app', I.oceanV,
        split('Everything for your home in one place', 'what the app offers homeowners', I.virtuo) +
        cta('Connect with our sales team', 'learning more about Virtuo', 'Contact us', rp('contact-us'))];
    },
    'referral-program': function () {
      return ['Referral Rewards', 'rewards for referring friends', I.greatV,
        split('Shaping healthy communities together', 'how the referral program works', I.scorpio) + form('Refer a friend!', ["Friend's name", "Friend's email"])];
    },
    'realtor-program': function () {
      return ['Realtor program', 'working with realtors', I.milanLivingV,
        split("Let's work together!", 'the realtor partnership', I.maxima) + form('Register as a realtor', ['Brokerage'])];
    },
    'list-and-save': function () {
      return ['List & Save', 'listing your current home', I.bedV,
        split('We can help list your home for FREE!', 'listing with a preferred realtor', I.living) +
        accordion('How it works', ['Who is eligible?', 'What does it cover?', 'How do I start?']) + form('Get Started Today!')];
    },
    'solara': function () {
      return ['Solara', 'the Solara townhome community', HERO_IMG,
        split('Townhome living', 'the Solara development', I.living) + cta('Visit the sales centre', 'visiting Solara', 'See show homes', rp('visit-a-showhome'))];
    },
    // ----- corporate-only pages -----
    'careers': function () {
      return ['Craft your career with Daytona Homes', 'working at Daytona Homes', I.stairsV,
        '<section class="section wrap"><h2 class="section-title">Open positions</h2><div class="steps plain">' + ['Edmonton Sales Assistant', 'Edmonton Sales Consultant'].map(function (j) {
          return '<div class="step"><h3>' + j + '</h3><p>' + standin('the ' + j + ' role') + '</p>' + a('#contact-form', 'Apply<i class="fas fa-arrow-right"></i>') + '</div>'; }).join('') + '</div></section>' +
        split('Life at Daytona', 'the team and culture', I.staff) + form('Apply now', ['Position'])];
    },
    'warranty': function () {
      return ['Warranty', 'new home warranty coverage', I.fireV,
        split('Your home is covered', 'what the warranty includes', I.living) +
        accordion('Warranty Coverage Contact Information', Object.keys(D.regions).map(function (k) { return D.regions[k].name; })) + form('Get in touch with Daytona')];
    },
    'privacy-policy': function () {
      return ['Privacy Policy', 'how personal information is handled', null,
        textSections(["What is 'personal information'?", 'Why do we collect, use, and disclose your personal information?', 'How do we gather your information?', 'Your consent',
          'Third parties', 'How do we store and protect your personal information?', 'Accessing and correcting your personal information', 'On-line privacy practices',
          'Changes to this privacy policy', 'Further information', 'Choice/opt out'])];
    },
    'bill-s-211-report': function () {
      return ['Bill S-211 Report', 'the annual supply chain report', null,
        textSections(['About this report', 'Structure, activities and supply chains', 'Policies and due diligence', 'Training', 'Assessing effectiveness'])];
    },
    'first-time-buyers': function () {
      return ['Built for First-Time Buyers', 'programs for first-time home buyers', I.kitchenV,
        split('Your first home is closer than you think', 'first-time buyer incentives', I.living) +
        numbered('Where to start', ['Know your budget', 'Explore incentives', 'Pick a region']) +
        '<section class="cta"><h2>Choose your region</h2><p>' + standin('getting started in your city') + '</p><div class="btn-row">' +
          Object.keys(D.regions).map(function (k) { return a(home(k), esc(D.regions[k].name), 'btn'); }).join('') + '</div></section>'];
    }
  };
  function contentPage() {
    var make = CONTENT[SLUG];
    if (!make) return notFound();
    var p = make();
    document.title = p[0] + ' | Daytona Homes';
    return (p[2] === null
      ? '<section class="page-hero plain">' + floor('0% 0%,100% 0%,100% 100%,0% 100%', []) + '<div class="page-hero-copy">' + crumbs(trailFor(p[0])) + '<h1>' + esc(p[0]) + '</h1><p>' + standin(p[1]) + '</p></div></section>'
      : pageHero(p[0], trailFor(p[0]), standin(p[1]), p[2])) + p[3];
  }
  function notFound() {
    return '<section class="cta" style="margin-top:6.4rem"><h2>Page not found</h2><p>This item is not part of the local demo data.</p>' + a(R ? home(RKEY) : home(), 'Back to home', 'btn') + '</section>';
  }

  /* ---------------- Filterable lists with persistent state ---------------- */
  var MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  function monthsUntil(snipe) {
    if (!snipe) return null;
    if (/IMMEDIATE/i.test(snipe)) return 0;
    var now = new Date();
    var m = MONTHS.indexOf(snipe.split(' ')[0].toUpperCase());
    if (m >= 0) return (m - now.getMonth() + 12) % 12;
    var y = snipe.match(/COMING (\d{4})/i);
    if (y) return Math.max(0, (+y[1] - now.getFullYear()) * 12 - now.getMonth());
    return null;
  }
  function uniq(list) { return list.filter(function (v, i) { return v && list.indexOf(v) === i; }).sort(); }
  function opts(values) { return values.map(function (v) { return [slugify(v), v]; }); }
  function searchField(placeholder, getText) {
    return { key: 'q', label: 'Search', kind: 'search', placeholder: placeholder, test: function (item, v) { return getText(item).toLowerCase().indexOf(v.trim().toLowerCase()) >= 0; } };
  }
  var atLeast = function (prop) { return function (item, v) { return +item[prop] >= +v; }; };
  var FIELD = {
    size: { key: 'size', label: 'Size <span class="sr-only">Square footage</span>(Sq.Ft.)', kind: 'select', options: [1000, 1500, 2000, 2500].map(function (n) { return [String(n), n + ' square feet +']; }), test: atLeast('sqft') },
    beds: { key: 'beds', label: 'Beds', kind: 'select', options: [2, 3, 4, 5].map(function (n) { return [String(n), n + '+']; }), test: atLeast('beds') },
    baths: { key: 'baths', label: 'Baths', kind: 'select', options: [2, 2.5, 3].map(function (n) { return [String(n), n + '+']; }), test: atLeast('baths') }
  };
  function typeField(items) {
    return { key: 'type', label: 'Type', kind: 'select', options: opts(uniq(items.map(function (i) { return i.type; }))), test: function (i, v) { return slugify(i.type || '') === v; } };
  }
  var SORT = {
    'price-asc': ['Lowest Price', function (x, y) { return (x.price || Infinity) - (y.price || Infinity); }],
    'price-desc': ['Highest Price', function (x, y) { return (y.price || -1) - (x.price || -1); }],
    'size-asc': ['Smallest Sq. Footage', function (x, y) { return x.sqft - y.sqft; }],
    'size-desc': ['Largest Sq. Footage', function (x, y) { return y.sqft - x.sqft; }],
    'possession': ['Nearest Possession Date', function (x, y) { return (x.months == null ? 999 : x.months) - (y.months == null ? 999 : y.months); }],
    'name-asc': ['Name A to Z', function (x, y) { return x.title.localeCompare(y.title); }],
    'name-desc': ['Name Z to A', function (x, y) { return y.title.localeCompare(x.title); }]
  };

  /* cfg: { name, items, fields, sorts, card, nouns:[one, many], gridClass }.
     State lives in the URL (shareable) and in localStorage (survives refresh and coming back later). */
  function listView(cfg) {
    var STORE_KEY = 'daytona-replica:' + cfg.name + ':' + RKEY;
    var DEFAULTS = { sort: '', page: 1 };
    cfg.fields.forEach(function (f) { DEFAULTS[f.key] = f.kind === 'multi' ? [] : ''; });
    var state;
    function cleanState(raw) {
      var s = {};
      Object.keys(DEFAULTS).forEach(function (k) {
        var v = raw[k];
        if (Array.isArray(DEFAULTS[k])) s[k] = Array.isArray(v) ? v.filter(Boolean) : (v ? String(v).split(',').filter(Boolean) : []);
        else if (k === 'page') s[k] = Math.max(1, parseInt(v, 10) || 1);
        else s[k] = v == null ? '' : String(v);
      });
      return s;
    }
    // A link with filters in it wins; otherwise bring back whatever this visitor last used.
    function loadState() {
      var params = new URLSearchParams(location.search), fromUrl = {}, any = false;
      Object.keys(DEFAULTS).forEach(function (k) { if (params.has(k)) { fromUrl[k] = params.get(k); any = true; } });
      if (any) return cleanState(fromUrl);
      try { return cleanState(JSON.parse(localStorage.getItem(STORE_KEY)) || {}); } catch (e) { return cleanState({}); }
    }
    function saveState() {
      var params = new URLSearchParams();
      Object.keys(DEFAULTS).forEach(function (k) {
        var v = state[k];
        if (Array.isArray(v)) { if (v.length) params.set(k, v.join(',')); }
        else if (v !== DEFAULTS[k] && v !== '') params.set(k, v);
      });
      var qs = params.toString();
      try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) { /* file:// can refuse; storage below still works */ }
      try { qs ? localStorage.setItem(STORE_KEY, JSON.stringify(state)) : localStorage.removeItem(STORE_KEY); } catch (e) { /* private mode */ }
    }
    function activeCount() {
      return cfg.fields.filter(function (f) { return f.kind === 'multi' ? state[f.key].length : state[f.key] !== ''; }).length;
    }
    function apply() {
      var found = cfg.items.filter(function (item) {
        return cfg.fields.every(function (f) {
          var v = state[f.key];
          return (f.kind === 'multi' ? !v.length : v === '') || f.test(item, v);
        });
      });
      var by = SORT[state.sort];
      return by ? found.slice().sort(by[1]) : found;
    }
    function fieldHtml(f) {
      if (f.kind === 'search') return '<div class="field"><label for="f-q">' + f.label + '</label><input type="search" id="f-q" data-key="q" placeholder="' + esc(f.placeholder) + '" autocomplete="off"></div>';
      if (f.kind === 'multi') return '<div class="field"><span class="label" id="l-' + f.key + '">' + f.label + '</span><div class="ms" data-key="' + f.key + '">' +
        '<button class="ms-btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="l-' + f.key + '"></button>' +
        '<div class="ms-panel"><input type="search" placeholder="Type to search" aria-label="Search ' + esc(f.label) + '">' +
        '<div class="ms-list" role="listbox" aria-multiselectable="true">' + f.options.map(function (o) {
          return '<label><input type="checkbox" value="' + esc(o[0]) + '"><span>' + esc(o[1]) + '</span></label>';
        }).join('') + '<p class="ms-empty" hidden>No matches</p></div></div></div></div>';
      return '<div class="field"><label for="f-' + f.key + '">' + f.label + '</label><select id="f-' + f.key + '" data-key="' + f.key + '"><option value="">All</option>' +
        f.options.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
    }
    var html = '<section class="filters" aria-label="Filters"><button class="filters-toggle" type="button" aria-expanded="false"><span>Sort and Filter <em></em></span><i class="fas fa-sliders"></i></button>' +
        '<div class="filters-body"><div class="filter-grid">' + cfg.fields.map(fieldHtml).join('') + '</div>' +
        '<div class="list-bar"><label class="sort"><span class="sr-only">Sort by</span><select data-key="sort" aria-label="Sort by"><option value="">Sort by</option>' +
        cfg.sorts.map(function (s) { return '<option value="' + s + '">' + SORT[s][0] + '</option>'; }).join('') + '</select></label>' +
        '<button class="clear" type="button">Clear filters</button></div><p class="saved-note" role="status"></p></div></section>' +
      '<section class="results"><p class="count" aria-live="polite"></p><div class="homes ' + (cfg.gridClass || '') + '"></div><nav class="pager" aria-label="Pagination"></nav></section>';

    function mount(main) {
      state = loadState();
      var $ = function (s) { return main.querySelector(s); }, $$ = function (s) { return [].slice.call(main.querySelectorAll(s)); };
      function syncControls() {
        $$('.filters [data-key]').forEach(function (el) {
          var key = el.dataset.key;
          if (el.classList.contains('ms')) {
            var labels = [];
            [].forEach.call(el.querySelectorAll('input[type=checkbox]'), function (cb) {
              cb.checked = state[key].indexOf(cb.value) >= 0;
              if (cb.checked) labels.push(cb.nextElementSibling.textContent);
            });
            var btn = el.querySelector('.ms-btn');
            btn.innerHTML = labels.length ? labels.map(function (l) { return '<span class="chip">' + esc(l) + '</span>'; }).join('') : '<span class="ph">All</span>';
            btn.classList.toggle('is-set', labels.length > 0);
          } else {
            el.value = state[key];
            if (el.value !== state[key]) state[key] = '';      // saved value no longer offered
            if (key !== 'sort') el.classList.toggle('is-set', state[key] !== '');
          }
        });
      }
      function render() {
        var found = apply();
        var pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
        if (state.page > pages) state.page = pages;
        var slice = found.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
        $('.count').textContent = found.length + ' ' + cfg.nouns[found.length === 1 ? 0 : 1];
        $('.results .homes').innerHTML = slice.length ? slice.map(cfg.card).join('') :
          '<div class="empty"><p>Nothing matches these filters.</p><button class="clear" type="button">Clear filters</button></div>';
        var pager = '';
        if (pages > 1) {
          pager = '<button class="word" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>Prev</button>';
          for (var i = 1; i <= pages; i++) pager += '<button data-page="' + i + '"' + (i === state.page ? ' aria-current="page"' : '') + ' aria-label="Go to page ' + i + ' of ' + pages + '">' + i + '</button>';
          pager += '<button class="word" data-page="' + (state.page + 1) + '"' + (state.page === pages ? ' disabled' : '') + '>Next</button>';
        }
        $('.pager').innerHTML = pager;
        var n = activeCount();
        $('.filters-toggle em').textContent = n ? '(' + n + ')' : '';
        $('.saved-note').textContent = n || state.sort ? 'Your filters are saved and will still be here after a refresh.' : '';
        saveState();
      }
      function update(key, value) { state[key] = value; if (key !== 'page') state.page = 1; syncControls(); render(); }
      function closeMs(m) { m.classList.remove('open'); m.querySelector('.ms-btn').setAttribute('aria-expanded', 'false'); }

      main.addEventListener('input', function (e) { if (e.target.id === 'f-q') update('q', e.target.value); });
      main.addEventListener('change', function (e) {
        var t = e.target, ms = t.closest('.ms');
        if (ms && t.type === 'checkbox') update(ms.dataset.key, [].map.call(ms.querySelectorAll('input:checked'), function (c) { return c.value; }));
        else if (t.tagName === 'SELECT' && t.dataset.key && t.closest('.filters')) update(t.dataset.key, t.value);
      });
      main.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest('.clear')) { state = cleanState({}); syncControls(); render(); return; }
        var pg = t.closest('.pager button');
        if (pg && !pg.disabled) { update('page', +pg.dataset.page); $('.filters').scrollIntoView(); return; }
        var toggle = t.closest('.filters-toggle');
        if (toggle) { toggle.setAttribute('aria-expanded', $('.filters').classList.toggle('open')); return; }
        var btn = t.closest('.ms-btn');
        $$('.ms.open').forEach(function (m) { if ((!btn || m !== btn.parentNode) && !t.closest('.ms-panel')) closeMs(m); });
        if (btn) {
          var open = btn.parentNode.classList.toggle('open');
          btn.setAttribute('aria-expanded', open);
          if (open) btn.parentNode.querySelector('input[type=search]').focus();
        }
      });
      document.addEventListener('click', function (e) { if (!e.target.closest('.ms')) $$('.ms.open').forEach(closeMs); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.ms.open').forEach(closeMs); });
      // Search box inside each multi-select narrows its option list.
      $$('.ms-panel input[type=search]').forEach(function (box) {
        box.addEventListener('input', function (e) {
          e.stopPropagation();
          var q = box.value.trim().toLowerCase(), shown = 0, list = box.nextElementSibling;
          [].forEach.call(list.querySelectorAll('label'), function (l) {
            var hit = l.textContent.toLowerCase().indexOf(q) >= 0;
            l.hidden = !hit; if (hit) shown++;
          });
          list.querySelector('.ms-empty').hidden = shown > 0;
        });
      });
      window.addEventListener('storage', function (e) { if (e.key === STORE_KEY) { state = loadState(); syncControls(); render(); } });

      if (activeCount()) $('.filters').classList.add('open');
      syncControls();
      render();
    }
    return { html: html, mount: mount };
  }

  function regionListings() {
    var all = D.listings.filter(function (h) { return h.region === RKEY; });
    all.forEach(function (h) { h.months = monthsUntil(h.snipe); });
    return all;
  }
  function listingsPage() {
    var all = regionListings();
    var hasPossession = all.some(function (h) { return h.months != null; });
    var prices = all.map(function (h) { return h.price; }).filter(Boolean);
    var priceOpts = [];
    for (var p = Math.floor(Math.min.apply(null, prices) / 1e5); p <= Math.floor(Math.max.apply(null, prices) / 1e5); p++) priceOpts.push([p * 1e5 + '-' + (p + 1) * 1e5, money(p * 1e5) + ' - ' + money((p + 1) * 1e5)]);
    var features = uniq([].concat.apply([], all.map(function (h) { return h.features; })));
    var fields = [
      searchField('Address, community or feature', function (h) { return h.title + ' ' + h.community + ' ' + h.type + ' ' + h.features.join(' '); }),
      typeField(all),
      { key: 'location', label: 'Location', kind: 'multi', options: opts(uniq(all.map(function (h) { return h.community; }))), test: function (h, v) { return v.indexOf(slugify(h.community)) >= 0; } },
      { key: 'price', label: 'Price Range', kind: 'select', options: priceOpts, test: function (h, v) { v = v.split('-'); return !!h.price && h.price >= +v[0] && h.price < +v[1]; } },
      FIELD.size, FIELD.beds, FIELD.baths
    ];
    if (features.length) fields.push({ key: 'features', label: 'Included Features', kind: 'multi', options: opts(features), test: function (h, v) { var have = h.features.map(slugify); return v.every(function (f) { return have.indexOf(f) >= 0; }); } });
    if (hasPossession) fields.push({ key: 'possession', label: 'Possession Date', kind: 'select',
      options: [['now', 'Immediate Possession'], ['3-months', 'Less than 3 months'], ['3-6-months', '3-6 months'], ['6-plus-months', '6+ months']],
      test: function (h, v) { var m = h.months; return m != null && (v === 'now' ? m === 0 : v === '3-months' ? m < 3 : v === '3-6-months' ? m >= 3 && m <= 6 : m > 6); } });
    var view = listView({ name: 'filters', items: all, fields: fields, card: homeCard, nouns: ['Move-in ready home', 'Move-in ready homes'],
      sorts: ['price-asc', 'price-desc', 'size-asc', 'size-desc'].concat(hasPossession ? ['possession'] : []) });
    return { html: pageHero('Move-in ready', trailFor('Move-in ready'), 'Stand-in intro: a few lines about quick possession homes in ' + R.city + ' go here.',
        'corporate/comfort-commercial-stills/livingroom-1080x1080.jpg/26f2b6c0dbe14260345c48c7ba405a55/livingroom-1080x1080.webp') + view.html +
        cta('Build with Daytona', 'building a customized home instead', 'Learn about building with us', rp('getting-started')), mount: view.mount };
  }
  function modelsPage() {
    var items = (X.models || []).map(function (m) { return Object.assign({ sqft: +m.sqft }, m, { sqft: +m.sqft }); });
    var view = listView({ name: 'models', items: items, card: modelCard, nouns: ['Home model', 'Home models'], sorts: ['size-asc', 'size-desc', 'name-asc'],
      fields: [searchField('Model name or type', function (m) { return m.title + ' ' + (m.type || ''); }), typeField(items), FIELD.size, FIELD.beds, FIELD.baths] });
    return { html: pageHero('Explore our models', trailFor('Explore our models'), standin('the home models available in ' + R.city),
        'corporate/comfort-commercial-stills/ensuite-1080x1080.jpg/dc84dfeb52522dc86d32e7946644086e/ensuite-1080x1080.webp') + view.html + showhomeStrip('Find a Show Home'), mount: view.mount };
  }
  function communitiesPage() {
    var items = X.communities || [];
    var view = listView({ name: 'communities', items: items, card: communityCard, nouns: ['Community', 'Communities'], sorts: ['name-asc', 'name-desc'], gridClass: 'archive',
      fields: [searchField('Community name', function (c) { return c.title + ' ' + (c.area || ''); }),
        { key: 'area', label: 'City Area', kind: 'select', options: opts(uniq(items.map(function (c) { return c.area; }))), test: function (c, v) { return slugify(c.area || '') === v; } }] });
    return { html: pageHero('Communities', trailFor('Communities'), standin('the communities in ' + R.name), items[0] && items[0].image) + view.html, mount: view.mount };
  }
  function showhomesPage() {
    var items = X.showhomes || [];
    var view = listView({ name: 'showhomes', items: items, card: showhomeCard, nouns: ['Show home', 'Show homes'], sorts: ['name-asc', 'name-desc'],
      fields: [searchField('Show home, community or address', function (s) { return s.title + ' ' + (s.community || '') + ' ' + (s.address || ''); }),
        { key: 'location', label: 'Location', kind: 'multi', options: opts(uniq(items.map(function (s) { return s.community; }))), test: function (s, v) { return v.indexOf(slugify(s.community || '')) >= 0; } },
        typeField(items)] });
    return { html: pageHero(R.showHomes, trailFor(R.showHomes), standin('visiting a show home in ' + R.city), I.living) + view.html + form('Get in touch with Daytona'), mount: view.mount };
  }
  function blogPage() {
    var view = listView({ name: 'blog', items: X.posts || [], card: postCard, nouns: ['Blog post', 'Blog posts'], sorts: ['name-asc', 'name-desc'], gridClass: 'archive',
      fields: [searchField('Search news', function (p) { return p.title; })] });
    return { html: pageHero('News', trailFor('News'), standin('news and updates from Daytona ' + R.city), I.livingV) + view.html, mount: view.mount };
  }

  /* ---------------- Detail pages ---------------- */
  function detailHero(title, trail, image, aside) {
    return '<section class="detail wrap">' + crumbs(trail) + '<div class="detail-grid"><div class="gallery"><img src="' + img(image) + '" alt=""></div>' +
      '<div class="detail-side"><h1>' + esc(title) + '</h1>' + aside + '</div></div></section>';
  }
  function calculator(price) {
    return '<section class="calc wrap" id="calculator"><h2 class="section-title">Mortgage Calculator</h2><div class="calc-grid">' +
      '<div class="field"><label for="c-price">Purchase price ($)</label><input id="c-price" type="number" min="0" step="1000" value="' + price + '"></div>' +
      '<div class="field"><label for="c-down">Down payment (%)</label><input id="c-down" type="number" min="5" max="100" step="1" value="10"></div>' +
      '<div class="field"><label for="c-years">Amortization</label><select id="c-years"><option>25</option><option selected>30</option></select></div>' +
      '<div class="field"><label for="c-rate">Interest rate (%)</label><input id="c-rate" type="number" min="0" step="0.05" value="4.5"></div>' +
      '<div class="field"><label for="c-freq">Payment frequency</label><select id="c-freq"><option value="12">Monthly</option><option value="26">Bi-weekly</option><option value="52">Weekly</option></select></div>' +
      '<div class="calc-out"><span>Estimated payment</span><b id="c-result"></b><small id="c-detail"></small></div></div>' +
      '<p class="form-note">Estimate only. Uses semi-annual compounding; not a mortgage offer.</p></section>';
  }
  function mountCalculator(main) {
    var get = function (id) { return main.querySelector('#' + id); };
    if (!get('c-price')) return;
    function run() {
      var price = +get('c-price').value || 0, down = price * (+get('c-down').value || 0) / 100, principal = Math.max(0, price - down);
      var n = +get('c-freq').value, years = +get('c-years').value, rate = (+get('c-rate').value || 0) / 100;
      var per = Math.pow(1 + rate / 2, 2 / n) - 1, count = n * years;
      var pay = per ? principal * per / (1 - Math.pow(1 + per, -count)) : principal / count;
      get('c-result').textContent = money(pay);
      get('c-detail').textContent = 'Mortgage amount ' + money(principal) + ' after a ' + money(down) + ' down payment';
    }
    main.querySelector('.calc').addEventListener('input', run);
    run();
  }
  function homeDetail() {
    var h = byId(regionListings(), ID);
    if (!h) return notFound();
    document.title = h.title + ' | Homes | Daytona Homes';
    var cid = communityId(h.community);
    var near = regionListings().filter(function (o) { return o.id !== h.id && o.community === h.community; });
    if (near.length < 3) near = near.concat(regionListings().filter(function (o) { return o.id !== h.id && near.indexOf(o) < 0; }));
    var aside = (h.community ? '<span class="region-tag">' + esc(h.community) + '</span>' : '') + pills(h) +
      '<p class="feat">' + esc(h.type) + '</p><div class="price-card"><h3>Price</h3><p class="price">' + priceHtml(h) + '</p>' +
      (h.price ? a('#calculator', 'Mortgage Calculator', 'btn outline') : '') + '</div>' +
      (h.snipe ? '<div class="price-card"><h3>' + (/POSSESSION|COMING/i.test(h.snipe) ? 'Possession Date' : 'Offer') + '</h3><p>' + esc(h.snipe) + '</p></div>' : '') +
      (h.features.length ? '<div class="price-card"><h3>Included Features</h3><ul>' + h.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '');
    return detailHero(h.title, [['Home', home(RKEY)], [R.listingsLabel, listings(RKEY)], h.title], h.image, aside) +
      '<section class="section wrap">' + consultant(h.title) + '</section>' +
      (h.price ? calculator(h.price) : '') +
      split('Explore ' + h.title, 'the floorplan and layout of this home', h.image) +
      (h.community ? split(h.community, 'the ' + h.community + ' community', (byId(X.communities, cid) || {}).image || HERO_IMG, true, cid ? ['View community', rp('community', cid)] : null) : '') +
      '<section class="section wrap"><h2 class="section-title">More homes in the area</h2>' + grid(near.slice(0, 3).map(homeCard)) + '</section>' + form('Send a Message');
  }
  function modelDetail() {
    var m = byId(X.models, ID);
    if (!m) return notFound();
    document.title = m.title + ' | Models | Daytona Homes';
    var base = m.title.replace(/^The /, '').split(/[ -]/)[0].toLowerCase();
    var ready = regionListings().filter(function (h) { return h.image.toLowerCase().indexOf(base) >= 0; }).slice(0, 3);
    return detailHero(m.title, [['Home', home(RKEY)], ['Explore our models', rp('explore-our-models')], m.title], m.image,
        pills(m) + '<p class="feat">' + esc(m.type || '') + '</p><p>' + standin('the ' + m.title + ' floorplan') + '</p>' +
        '<div class="btn-row">' + a('#contact-form', 'Request Appointment', 'btn') + a(rp('visit-a-showhome'), 'Find a show home', 'btn outline') + '</div>') +
      split('Explore ' + m.title, 'the layout, rooms and options of this model', m.image) +
      (ready.length ? '<section class="section wrap"><h2 class="section-title">Move-in ready homes with this model</h2>' + grid(ready.map(homeCard)) + '</section>' : '') +
      '<section class="section wrap"><h2 class="section-title">Available in these communities</h2>' + grid((X.communities || []).slice(0, 3).map(communityCard), 'archive') + '</section>' + form('Send a Message');
  }
  function communityDetail() {
    var c = byId(X.communities, ID);
    if (!c) return notFound();
    document.title = c.title + ' | Communities | Daytona Homes';
    var shows = (X.showhomes || []).filter(function (s) { return s.community === c.title; });
    var ready = regionListings().filter(function (h) { return h.community === c.title; });
    return detailHero(c.title, [['Home', home(RKEY)], ['Communities', rp('communities')], c.title], c.image,
        (c.area ? '<span class="region-tag">' + esc(c.area) + '</span>' : '') + '<h2 class="sub">About the community</h2><p>' + standin('life in ' + c.title) + '</p><p>' + standin('nearby parks, schools and amenities') + '</p>' +
        '<div class="btn-row">' + a('#contact-form', 'Request Appointment', 'btn') + '</div>') +
      '<section class="section wrap">' + consultant(c.title) + '</section>' +
      (shows.length ? '<section class="section wrap"><h2 class="section-title">Visit our showhome</h2>' + grid(shows.map(showhomeCard)) + '</section>' : '') +
      (ready.length ? '<section class="section wrap"><h2 class="section-title">These homes are ready and waiting for you</h2>' + grid(ready.slice(0, 6).map(homeCard)) +
        '<p class="more">' + a(listings(RKEY) + '?location=' + slugify(c.title), 'See all in ' + esc(c.title), 'btn outline') + '</p></section>' : '') +
      '<section class="section wrap"><h2 class="section-title">Build With Us</h2>' + grid((X.models || []).slice(0, 6).map(modelCard)) + '</section>' + form('Send a Message');
  }
  function showhomeDetail() {
    var s = byId(X.showhomes, ID);
    if (!s) return notFound();
    document.title = s.title + ' | Daytona Homes';
    var cid = communityId(s.community);
    var hours = [['Monday to Thursday', '[Stand-in hours]'], ['Friday', '[Stand-in hours]'], ['Saturday, Sunday and holidays', '[Stand-in hours]']];
    return detailHero(s.title, [['Home', home(RKEY)], [R.showHomes, rp('visit-a-showhome')], s.title], s.image,
        (s.community ? '<span class="region-tag">' + esc(s.community) + '</span>' : '') + (s.type ? '<p class="feat">' + esc(s.type) + '</p>' : '') +
        (s.address ? '<p class="addr"><i class="fas fa-map-marker"></i>' + out(mapsUrl(s.address + ', ' + R.city), esc(s.address)) + '</p>' : '') +
        '<div class="price-card"><h3>Hours of operation</h3><table>' + hours.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table></div>' +
        '<div class="btn-row">' + a('#contact-form', 'Request Appointment', 'btn') + '</div>') +
      '<section class="section wrap">' + consultant(s.title) + '</section>' +
      split('Explore the ' + s.title, 'touring this show home', s.image) +
      (s.community ? split(s.community, 'the ' + s.community + ' community', (byId(X.communities, cid) || {}).image || HERO_IMG, true, cid ? ['View community', rp('community', cid)] : null) : '') + form('Send a Message');
  }
  function postDetail() {
    var p = byId(X.posts, ID);
    if (!p) return notFound();
    document.title = p.title + ' | Daytona Homes';
    var more = (X.posts || []).filter(function (o) { return o.id !== p.id; }).slice(0, 3);
    return '<article class="article wrap">' + crumbs([['Home', home(RKEY)], ['News', rp('blog')], p.title]) + '<h1>' + esc(p.title) + '</h1>' +
        '<img class="article-img" src="' + img(p.image) + '" alt="">' +
        '<div class="prose"><p>' + standin('this article') + '</p><h2>Section heading</h2><p>' + standin('the first point of the article') + '</p>' +
        '<h2>Section heading</h2><p>' + standin('the second point of the article') + '</p></div>' + a(rp('blog'), '<i class="fas fa-arrow-left"></i> All news', 'btn outline') + '</article>' +
      '<section class="section wrap"><h2 class="section-title">More news</h2>' + grid(more.map(postCard), 'archive') + '</section>';
  }

  /* ---------------- Boot ---------------- */
  // Proxima Nova comes from Adobe Fonts. Added after render so an unreachable font host never blocks the page.
  var kit = document.createElement('link');
  kit.rel = 'stylesheet'; kit.href = 'https://use.typekit.net/msm5lfu.css';
  document.head.appendChild(kit);

  var VIEWS = {
    corporate: function () { return { html: corporate(), bare: true }; },
    home: function () { return { html: regionHome() }; },
    content: function () { return { html: contentPage() }; },
    listings: listingsPage, models: modelsPage, communities: communitiesPage, showhomes: showhomesPage, blog: blogPage,
    'detail-homes': function () { return { html: homeDetail() }; },
    'detail-models': function () { return { html: modelDetail() }; },
    'detail-community': function () { return { html: communityDetail() }; },
    'detail-showhome': function () { return { html: showhomeDetail() }; },
    'detail-post': function () { return { html: postDetail() }; }
  };
  var view = (VIEWS[PAGE] || function () { return { html: notFound() }; })();
  var app = document.getElementById('app');
  app.innerHTML = chrome() + '<main class="site" id="main">' + view.html + (view.bare ? '' : footer()) + '</main>';
  var mainEl = app.querySelector('main');
  if (view.mount) view.mount(mainEl);
  mountCalculator(mainEl);

  var bannerKey = 'daytona-replica:banner-closed';
  var banner = app.querySelector('.banner');
  var closed = false;
  try { closed = sessionStorage.getItem(bannerKey) === '1'; } catch (e) { /* ignore */ }
  if (banner && !closed) body.classList.add('has-banner'); else if (banner) banner.remove();

  app.addEventListener('submit', function (e) {
    e.preventDefault();
    var note = e.target.querySelector('.form-note');
    if (note) note.textContent = 'Local demo: nothing was sent.';
  });
  app.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('.js-demo')) t.closest('.js-demo').textContent = 'Local demo only';
    if (t.closest('.banner button')) {
      body.classList.remove('has-banner'); banner.remove();
      try { sessionStorage.setItem(bannerKey, '1'); } catch (err) { /* ignore */ }
    }
    var menuBtn = t.closest('.menu-btn');
    if (menuBtn) {
      var open = body.classList.toggle('menu-open');
      menuBtn.setAttribute('aria-expanded', open);
      menuBtn.firstChild.className = open ? 'fas fa-xmark' : 'fas fa-bars';
    }
    var group = t.closest('.nav-group > .nav-link');
    if (group) group.setAttribute('aria-expanded', group.parentNode.classList.toggle('open'));
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('menu-open')) app.querySelector('.menu-btn').click();
  });
})();
