/* Site data for the local Daytona replica.
   Listing facts (address, community, beds, baths, sq.ft, prices, image path) were read from
   daytonahomes.ca on 2026-10-05. Images are linked from the live site, not stored here. */
(function () {
  var TYPES = {
    A: 'Single Family Attached Garage',
    D: 'Single Family Detached Garage',
    X: 'Duplex',
    T: 'Townhome',
    B: 'Bungalow'
  };

  // [id, title, community, snipe, beds, baths, sqft, features, priceGstIncluded, pricePreGst, imagePath, typeCode]
  // price null + null = Sale Pending. gst null + pre set = "Pre-GST. Includes home & lot."
  var ROWS = {
    edmonton: [
      ['chp-044-017', '5034 Cawsey Link SW', 'Chappelle Gardens', 'IMMEDIATE POSSESSION', 4, 3, 1815, 'Main Floor Bed & Bath, Side Entry, Luxury Vinyl Plank, 9ft Foundation', 587210, 559248, 'edmonton/colt-z-s.jpg/bcf53e0a6a7f471be94cd765f7188e25/colt-z-s.webp', 'A'],
      ['alcrsl-005-045', '2116 5 Avenue SW', 'Alces', 'NOVEMBER POSSESSION', 5, 3, 2375, 'Main Floor Bed & Bath, Side Entry', 699717, 666397, 'escalade-ii-b.jpg/f362993d8909bcaef6a29558b1f09e8a/escalade-ii-b.webp', 'A'],
      ['rvw-030-042', '2409 189A Street NW', 'The Uplands at Riverview', 'NOVEMBER POSSESSION', 4, 3, 1956, 'Main Floor Bed & Bath, Side Entry', 629036, 599082, 'avalanche-r.png/9311ec5de3863ed89883a0af336b15d1/avalanche-r.webp', 'A'],
      ['dedgnl-010-086', '8686 Edgemont Link NW', 'Edgemont', 'IMMEDIATE POSSESSION', 3, 2.5, 1707, 'Built Green Certified Gold', 499899, 476095, 'edmonton/built-green-images--edm/renderings_built_green/dhi_tiguanii_z_p_built_gold.png/b35c36820c6951b90fa4b92403e3789d/dhi_tiguanii_z_p_built_gold.webp', 'D'],
      ['chp-044-016', '5032 Cawsey Link SW', 'Chappelle Gardens', 'OCTOBER POSSESSION', 3, 2.5, 1956, 'Main Floor Bed & Bath, Side Entry', 636350, 606048, 'edmonton/city-models/dhi-avalanche-e_brampton-p.jpg/932c6101dc72cda7318882f63b500730/dhi-avalanche-e_brampton-p.webp', 'A'],
      ['rmth-011-022', '7113 Rosenthal Drive NW', 'Rosemont', 'NOVEMBER POSSESSION', 2, 2.5, 1022, '', 359900, 342761, 'edmonton/maverick-t4-b.jpg/10e7b9a03d5ddfa2d1afe50ad61f2b3b/maverick-t4-b.webp', 'T'],
      ['orc-042-034', '5452 Hawthorn Run SW', 'The Orchards at Ellerslie', 'IMMEDIATE POSSESSION', 3, 2.5, 1707, 'Side Entry, Built Green Certified Gold', 497999, 474284, 'edmonton/built-green-images--edm/renderings_built_green/dhi_tiguanii_z_r2_built_gold.png/ad3c8d8f057e7b9252b3eb5cbdc56457/dhi_tiguanii_z_r2_built_gold.webp', 'D'],
      ['orc-004-024', '3248 Orchards Wynd SW', 'The Orchards at Ellerslie', 'NOVEMBER POSSESSION', 3, 2.5, 1400, 'Side Entry', 489300, 466000, 'focus-z-e.jpg/70d80e5124c6baa49a7ed5ed6c8bfb77/focus-z-e.webp', 'D'],
      ['alcrpl-007-039', '2479 Alces Link SW', 'Alces', 'IMMEDIATE POSSESSION', 3, 2.5, 1537, 'Side Entry, Rear Kitchen', 484899, 461809, 'flex-z-b.jpg/ae52d524d4593e2029665c4175c8410f/flex-z-b.webp', 'D'],
      ['chpdx-007-011', '2018 Callihoo Link SW', 'Chappelle Gardens', 'IMMEDIATE POSSESSION', 3, 2.5, 1454, '', 459418, 437541, 'edmonton/aspen-d-b1-b2.jpg/9cbd9c9663289747950f214bb675a4fa/aspen-d-b1-b2.webp', 'X'],
      ['rvw-027-043', '18844 28 Avenue NW', 'The Uplands at Riverview', 'IMMEDIATE POSSESSION', 3, 2.5, 1537, 'Side Entry, Built Green Certified Gold', 472499, 449999, 'rvw.027.043_flex_staged_1.png/e10e8cf86213f1693e111f4331aa602f/rvw.027.043_flex_staged_1.webp', 'D'],
      ['alcrpl-007-037', '2475 Alces Link SW', 'Alces', 'IMMEDIATE POSSESSION', 4, 3, 1707, 'Main Floor Bed & Bath, Side Entry', 494899, 471333, 'tiguan-ii-b.jpg/3b76d17983f277499fc6888df1cd0190/tiguan-ii-b.webp', 'D'],
      ['chpdx-007-025', '2046 Callihoo Link SW', 'Chappelle Gardens', 'NOVEMBER POSSESSION', 3, 2.5, 1454, '', 488864, 465585, 'edmonton/aspen-d-e1-e2.jpg/2a1a7abd651962a6bad62499d798a03a/aspen-d-e1-e2.webp', 'X'],
      ['chpdx-007-030', '2058 Callihoo Link SW', 'Chappelle Gardens', 'NOVEMBER POSSESSION', 3, 2.5, 1454, '', null, null, 'edmonton/aspen-d-b1-b2.jpg/9cbd9c9663289747950f214bb675a4fa/aspen-d-b1-b2.webp', 'X'],
      ['rmrsl-009-040', '22432 86 Avenue NW', 'Rosemont', 'DECEMBER POSSESSION', 3, 2.5, 1815, 'Side Entry', 584629, 556790, 'edmonton/colt-ii-z-b.jpg/eb894bce9f2662a49e4d9988f214a0e8/colt-ii-z-b.webp', 'A'],
      ['kngf-002-081', '5885 Raven Crescent NW', 'Kinglet by Big Lake', 'NOVEMBER POSSESSION', 4, 2.5, 2375, 'Side Entry, Walkout Basement, Kitchen Appliances, City Spec', 844173, 803975, 'dhi_escalade_ii_e.png/a85bf64c1b5694695da378ab41722760/dhi_escalade_ii_e.webp', 'A'],
      ['dedgnl-010-089', '8692 Edgemont Link NW', 'Edgemont', 'IMMEDIATE POSSESSION', 3, 2.5, 1707, 'Built Green Certified Gold', 498899, 475142, 'edmonton/built-green-images--edm/renderings_built_green/dhi_tiguan_z_s_built_gold.png/608cf0842039a24b923d79342885f05c/dhi_tiguan_z_s_built_gold.webp', 'D'],
      ['ard-011-055', '137 Mustang Close', 'Ardrossan', 'COMING 2027', 3, 2.5, 1783, 'Side Entry', 512135, 487748, 'edmonton/maxima-z-e.jpg/6f75eb1b014a8d12046e282a38a36939/maxima-z-e.webp', 'D'],
      ['qvl-007-007', '227 157 Avenue NE', 'Quarry Vista', 'OCTOBER POSSESSION', 3, 2.5, 1783, 'Side Entry, Prep Kitchen', 489916, 466587, 'edmonton/maxima-z-e.jpg/6f75eb1b014a8d12046e282a38a36939/maxima-z-e.webp', 'D'],
      ['rmth-011-015', '7099 Rosenthal Drive NW', 'Rosemont', 'IMMEDIATE POSSESSION', 2, 2.5, 1022, 'Side Entry', 389900, 371333, 'edmonton/maverick-t4-b.jpg/10e7b9a03d5ddfa2d1afe50ad61f2b3b/maverick-t4-b.webp', 'T'],
      ['rmrsl-009-032', '8628 224 Street NW', 'Rosemont', 'IMMEDIATE POSSESSION', 3, 2.5, 1815, '', 583804, 556004, 'edmonton/colt-ii-z-b.jpg/eb894bce9f2662a49e4d9988f214a0e8/colt-ii-z-b.webp', 'A'],
      // type below is a best guess (live detail page could not be read)
      ['dqvf-006-010', '419 157 Avenue NE', 'Quarry Vista', 'IMMEDIATE POSSESSION', 3, 2.5, 1872, 'Side Entry', null, null, 'macan-z-b.jpg/1ecf3ded4f825f263cae8624c3cc8668/macan-z-b.webp', 'D'],
      ['rvw-030-041', '2413 189A Street NW', 'The Uplands at Riverview', 'NOVEMBER POSSESSION', 4, 3, 2152, 'Main Floor Bed & Bath, Side Entry', 649284, 618366, 'edmonton/mustang-z-b.jpg/582e9ff948d6dfec51acf3336762df00/mustang-z-b.webp', 'A'],
      ['rvw-030-023', '2511 190 Street NW', 'The Uplands at Riverview', 'OCTOBER POSSESSION', 3, 2.5, 1872, '', 614413, 585156, 'macan-r.jpg/75d6839fde8a3b01642a12f801e71a84/macan-r.webp', 'A']
    ],
    // Calgary and Winnipeg types are best guesses from the model name and feature list.
    calgary: [
      ['har-105-004', 'The Silverstone F', 'Harmony', '', 3, 2.5, 2521, "Triple Car Detached Garage, Developed Basement Stairs, Fireplace, 8' Main Floor Doors", null, 895143, 'silverstone-f-002.jpg/6071a3b6d56c076db705ed08e1dc4141/silverstone-f-002.webp', 'D'],
      ['har-043-003', 'The Silverstone II P', 'Harmony', '', 3, 2.5, 2181, "Main Floor Den, 8' Main Floor Doors, Waterfall Island", 819900, 780857, 'silverstone-ii-p.jpg/d40db35e296cda15955a63bf7222b19c/silverstone-ii-p.webp', 'D'],
      ['ran-035-012', 'The Silverado MF', 'Rangeview', '$15,000 Lot Rebate Available', 4, 2.5, 2317, '9 Foot Foundation, Optional Side Entry, Four Bedrooms, Tiled Ensuite Shower, Built Green Gold Certified', 739900, 704666, 'calgary/dhc_built_green_assets/dhc_rang_silverado_mf_built_gold.png/784994a64bbecbd0e5d7a0df9815eeb4/dhc_rang_silverado_mf_built_gold.webp', 'A'],
      ['har-105-005', 'The Valencia F', 'Harmony', '', 3, 2.5, 2465, 'Triple Car Detached Garage, Open to Above Great Room, Main Floor Den', 889900, 847523, 'calgary/har-valencia-f.jpg/3ee10e26d81357d53adf21bbc52078e3/har-valencia-f.webp', 'D'],
      ['wald-033-032', 'The Austyn-z P', 'Walden', '', 3, 2.5, 2259, 'Pie Lot, 9 Foot Foundation, Legal Basement Suite, Mudroom Lockers, Fireplace, Main Floor Den, Foyer Open to Below, Tiled Ensuite Shower', 799900, 761809, 'wald-austyn-z-p.jpg/d36a3c595547d658fc8d84f02b5ce1ee/wald-austyn-z-p.webp', 'A'],
      ['har-043-004', 'The Monaco II R', 'Harmony', '', 3, 2.5, 2358, 'Rear Attached Garage, Rear Deck, Main Floor Den, Fireplace', 829900, 790380, 'calgary/har-monaco-2-r.jpg/475f8470f257d137cb6acd9216204b7c/har-monaco-2-r.webp', 'A'],
      ['hea-046-068', 'The Alfa E', 'Heartland', '', 3, 2.5, 2013, 'Optional Side Entry, Fireplace, Main Floor Den, Foyer Open to Below', 639900, 609428, 'alfa-e-hea.jpg/dc9341a8b61fda271507dc278aa149f2/alfa-e-hea.webp', 'A'],
      ['crsf-060-004', 'The Austyn-z B', 'Creekstone', '', 3, 2.5, 2259, '9 Foot Foundation, Optional Side Entry, Main Floor Den, Main Floor Full Bath, U-Shaped Kitchen, Foyer Open to Below, Mudroom Built-Ins, Tiled Ensuite Shower', null, null, 'wald-austyn-z-v-b.jpg/937400879e4028032ecc6f633067bc79/wald-austyn-z-v-b.webp', 'A'],
      ['sous-005-061', 'The Austyn R', 'Southbow Landing', '', 3, 2.5, 2259, '9 Foot Foundation, Optional Side Entry, Fireplace, Main Floor Den, Foyer Open to Below, Central Bonus Room, Tiled Ensuite Shower', 679900, 647523, 'sous-austyn-r.jpg/5fdee38220cc58bb40cae3ebab577eb8/sous-austyn-r.webp', 'A'],
      ['wal-033-019', 'The Palisade-z II F', 'Walden', '', 3, 2.5, 1860, 'Backing onto Greenspace, 9 Foot Foundation, Walkout Basement, Rear Deck, Fireplace, Vaulted Primary Bedroom Ceiling, Tiled Ensuite Shower', 728900, 694190, 'calgary/wald-palisade-z-ii-f.jpg/098bfe3a448ac24155bc1681fc943d18/wald-palisade-z-ii-f.webp', 'A'],
      ['sous-005-062', 'The Austyn CT', 'Southbow Landing', '', 3, 2.5, 2259, 'Corner Lot, Optional Side Entry, Fireplace, Main Floor Den, Foyer Open to Below', 709900, 676095, 'sous-austyn-ct.jpg/89a3250581345b58e8b7fc9a97afceaa/sous-austyn-ct.webp', 'A'],
      ['ran-020-032', 'The Silverado MF', 'Rangeview', '$15,000 Lot Rebate Available', 4, 2.5, 2317, 'Optional Side Entry, Fireplace, Main Floor Tech Space, Four Bedrooms', 749900, 714190, 'silverado-mf.jpg/13acfe4fd6ea05cba73d614131898023/silverado-mf.webp', 'A'],
      ['crsf-057-028', 'The Austyn-z P', 'Creekstone', '', 4, 2.5, 2259, '9 Foot Foundation, Main Floor Den, Foyer Open to Below, Optional Fourth Bedroom Second Floor, Tiled Ensuite Shower', 719900, 685619, 'wald-austyn-z-p.jpg/d36a3c595547d658fc8d84f02b5ce1ee/wald-austyn-z-p.webp', 'A']
    ],
    winnipeg: [
      ['dev-004-012', '232 Private Davy Drive', 'Devonshire Park', '', 4, 3, 1716, '', null, 618952, 'winnipeg/wpg-cee-model-renderings/wpg-cee-malibu-e.jpg/f13e9b428e59a0198b2d5d96adee56be/wpg-cee-malibu-e.webp', 'A'],
      ['solt-002-103', '103-1510 Waverley Street', 'Prairie Pointe', '', 2, 2.5, 1175, '', null, 357817, 'winnipeg/solara/solara-t5-nnlnn.jpg/3ab65a5a754475a8fda4cd03a9b4ae84/solara-t5-nnlnn.webp', 'T'],
      ['aura-001-003a', '71 Pegasus Street', 'Aurora', '', 4, 3, 1695, '', null, 578910, 'winnipeg/wpg-cee-model-renderings/wpg-cee-elantra-e.jpg/67a5a3785ac7b0c9038e388bef6fc9d9/wpg-cee-elantra-e.webp', 'A'],
      ['sumth-013-014', '124 Mosaic Street', 'Summerlea', '', 3, 2.5, 1327, '', null, 403953, 'wpg_focus_th.png/6775d6b0bebd15e9018a75c0bda3028f/wpg_focus_th.webp', 'T'],
      ['30-perseus-way', '30 Perseus Way', 'Aurora', '', 3, 2.5, 1839, '', null, 645238, 'winnipeg/wpg-cee-captiva-e.jpg/16bf95ce949ee520f630e14522422ea5/wpg-cee-captiva-e.webp', 'A'],
      ['dev-005-007a', '34 Bill Brierclliffe', 'Devonshire Park', '', 3, 2.5, 1488, '', null, 509180, 'winnipeg/wpg-cee-model-renderings/wpg-cee-scion-ii-e.jpg/71bd348d7a4c2a4e831c8f82ea6d4854/wpg-cee-scion-ii-e.webp', 'A'],
      ['solt-002-1201', '1201-1510 Waverley Street', 'Prairie Pointe', '', 3, 2.5, 1524, '', null, 444784, 'winnipeg/solara/solara-t4-nlln.jpg/ba38ae3a4c4d509a05521e0a24a29375/solara-t4-nlln.webp', 'T'],
      ['aura-007-021', '295 Avior Drive', 'Aurora', '', 3, 2.5, 1488, '', null, 490381, 'winnipeg/wpg-cee-model-renderings/wpg-cee-scion-ii-a.jpg/c8b828099cdf17bb1802eeffd8bafe0d/wpg-cee-scion-ii-a.webp', 'A'],
      ['aura-003-014', '345 Avior Drive', 'Aurora', '', 4, 3, 1882, '', null, 647619, 'winnipeg/wpg-murano-e.jpg/4d884d501cdd9f803f2bc251431812df/wpg-murano-e.webp', 'A'],
      ['sumth-013-015', '120 Mosaic Street', 'Summerlea', '', 3, 2.5, 1400, '', null, 411366, 'dhw_focus_th_cee.png/92c50d47f104086afeea876055b50d85/dhw_focus_th_cee.webp', 'T'],
      ['aura-005-009a', '35 Perseus Way', 'Aurora', '', 3, 2.5, 1520, '', null, 572884, 'winnipeg/wpg-cee-model-renderings/dhw_sonoma_e_cee.png/85c949b563bd61152251388f687134f7/dhw_sonoma_e_cee.webp', 'A'],
      ['sum-001-022', '50 Confetti Crescent', 'Summerlea', '', 4, 3, 1716, '', null, 626065, 'malibu-r-sized-for-web.jpg/415b06320f6069217d39671b90f518f5/malibu-r-sized-for-web.webp', 'A']
    ]
  };

  var LISTINGS = [];
  Object.keys(ROWS).forEach(function (region) {
    ROWS[region].forEach(function (r) {
      LISTINGS.push({
        region: region, id: r[0], title: r[1], community: r[2], snipe: r[3],
        beds: r[4], baths: r[5], sqft: r[6],
        features: r[7] ? r[7].split(', ') : [],
        priceGst: r[8], pricePre: r[9],
        price: r[8] || r[9],          // number used for filtering and sorting
        image: r[10], type: TYPES[r[11]]
      });
    });
  });

  // Second page of listings for Calgary and Winnipeg comes from the generated data-extra.js.
  // Their home type is a best guess from the lot id and feature list.
  var EXTRA = window.DAYTONA_EXTRA || {};
  Object.keys(EXTRA).forEach(function (region) {
    (EXTRA[region].moreListings || []).forEach(function (m) {
      if (LISTINGS.some(function (h) { return h.id === m.id; })) return;
      var nums = ((m.price || '').match(/\$[\d,]+/g) || []).map(function (n) { return +n.replace(/[$,]/g, ''); });
      var gstIncluded = /GST Included/.test(m.price || '');
      LISTINGS.push({
        region: region, id: m.id, title: m.title, community: m.community || '', snipe: m.snipe || '',
        beds: +m.beds, baths: +m.baths, sqft: +m.sqft,
        features: m.type ? m.type.split(', ') : [],
        priceGst: gstIncluded ? nums[0] : null, pricePre: gstIncluded ? nums[1] : (nums[0] || null),
        price: nums[0] || null, image: m.image,
        type: /th-|^solt/.test(m.id) ? TYPES.T : /Detached Garage/.test(m.type || '') ? TYPES.D : TYPES.A
      });
    });
  });

  // Body copy below is placeholder text.
  var REGIONS = {
    edmonton: {
      slug: 'greater-edmonton', name: 'Greater Edmonton', city: 'Edmonton', listingsLabel: 'Quick Possession Homes',
      showHomes: 'Show Homes in Edmonton & Ardrossan', hasNews: true,
      whyOrder: [['About Us', 'our-company'], ['Our Comfort Blueprint', 'comfort-blueprint-edm'], ['Daytona Cares', 'daytona-cares']],
      preApproved: 'pre-approved',
      heroIntro: 'Placeholder',
      promos: [
        { title: 'Attention First-Time Homebuyers', text: 'Placeholder', img: 'edmonton/fthb-landing-page.png/2e6218a5fcbccdac71c5318737f7f6f8/fthb-landing-page.webp', href: '/built-for-first-time-buyers' },
        { title: 'Now Open in Edgemont!', text: 'Placeholder', img: 'dh-edm-edgemont-flex-promo-box.png/2842f14fb47caecc0204c1cf45911ba1/dh-edm-edgemont-flex-promo-box.webp', href: '/greater-edmonton/homes/the-flex' },
        { title: 'Townhomes Coming Soon!', text: 'Placeholder', img: 'edmonton/ambrea-announcement-promo-box.jpg/7b78fec0c7069a2ff182bb2358e338b8/ambrea-announcement-promo-box.webp', href: '/ambrea-at-the-orchards', tag: 'New Development' }
      ],
      buildImg: 'edmonton/dhi_alc_ocean_sh_living_room_apr_26.png/0a67fd79c60be78db09a8813bd53c2e6/dhi_alc_ocean_sh_living_room_apr_26.webp',
      comfortTitle: 'Find comfort in a Daytona home', comfortSub: 'Daytona Homes are crafted with care.',
      news: [
        { title: 'Attention First-Time Home Buyers!', img: 'edmonton/dh-the-time-is-right-2026.png/73fe20794ae8366741aef04c4ccd4961/dh-the-time-is-right-2026.webp', href: '/greater-edmonton/blog/the-time-is-right-for-first-time-homebuyers' },
        { title: 'Inside the Design: The Mustang Show Home in Edgemont', img: 'blog-post_mustagng_sh.png/f09927d51a71bf4c6014842516d0a6e1/blog-post_mustagng_sh.webp', href: '/greater-edmonton/blog/inside-the-design-the-mustang-show-home-in-edgemont' },
        { title: 'Common Mistakes First-Time Home Buyers Make (and How to Avoid Them)', img: 'blog-post_fthb-mistakes-.png/0f237965a45c78243c2d5ad2c2c78711/blog-post_fthb-mistakes-.webp', href: '/greater-edmonton/blog/first-time-home-buyer-mistakes' }
      ],
      footerLinks: [['Daytona Homes X Virtuo', 'virtuo', 1], ['News', 'blog'], ['Mortgage and Approval Process', 'get-pre-approved'], ['Referral Rewards', 'referral-program'], ['Realtor Program', 'realtor-program'], ['List & Save', 'list-and-save', 1]],
      phone: '780.452.2288', address: ['11504 170 Street', 'Edmonton, Alberta T5S 1J7'],
      social: [['facebook-square', 'Facebook', 'https://www.facebook.com/daytonamasterbuilder/'], ['instagram', 'Instagram', 'https://www.instagram.com/daytonahomesyeg/'], ['youtube', 'YouTube', 'https://www.youtube.com/user/DaytonaHomesMaster'], ['pinterest-p', 'Pinterest', 'https://www.pinterest.ca/daytonahomes/']],
      treaty: 'Treaty Six Territory'
    },
    calgary: {
      slug: 'greater-calgary', name: 'Greater Calgary', city: 'Calgary', listingsLabel: 'Quick Possession Homes',
      showHomes: 'Show Homes in Calgary & Cochrane', hasNews: false,
      whyOrder: [['About Us', 'our-company'], ['Our Comfort Blueprint', 'our-comfort-blueprint'], ['Daytona Cares', 'daytona-cares']],
      preApproved: 'pre-approved-cgy',
      heroIntro: 'Placeholder',
      promos: [
        { title: 'Make Your Down Payment More Comfortable', text: 'Placeholder', img: 'calgary/daytona-comfort-pay-launch-07.26-v4.png/4373e8d3b132c98423b5678f205dd453/daytona-comfort-pay-launch-07.26-v4.webp', href: '/greater-calgary' },
        { title: 'Attention First-Time Home Buyers!', text: 'Placeholder', img: 'edmonton/dh-gst-rebate-2026-%282%29.png/6b6e3c780545214347fc57479ef6a3f3/dh-gst-rebate-2026-%282%29.webp', href: '/built-for-first-time-buyers' },
        { title: 'Townhomes Coming Soon', text: 'Placeholder', img: 'calgary/the-bowbank-promo-box.jpg/f6568975fe7f1dcd514e4bef4bf3d3f7/the-bowbank-promo-box.webp', href: '/greater-calgary', tag: 'New Development' }
      ],
      buildImg: 'calgary/dhc_hea_palisade_sh_kitchen_vertical_apr_26.png/b76ca5f97a8a3d303f04fa0190a37c65/dhc_hea_palisade_sh_kitchen_vertical_apr_26.webp',
      comfortTitle: 'Find comfort in a Daytona home', comfortSub: 'Daytona Homes are crafted with care.',
      news: [
        { title: 'Attention First-Time Home Buyers!', img: 'edmonton/dh-the-time-is-right-2026.png/73fe20794ae8366741aef04c4ccd4961/dh-the-time-is-right-2026.webp', href: '/greater-calgary/blog' },
        { title: 'Common Mistakes First-Time Home Buyers Make (and How to Avoid Them)', img: 'blog-post_fthb-mistakes_1-.png/685d69951f970c650d8820197e783c42/blog-post_fthb-mistakes_1-.webp', href: '/greater-calgary/blog' },
        { title: "5 Timeless Kitchen Design Choices You'll Never Regret", img: 'blog-post_kitchen-design-1.png/328c2e0f45e8f79a872f5db1d2d204df/blog-post_kitchen-design-1.webp', href: '/greater-calgary/blog' }
      ],
      footerLinks: [['Daytona x Virtuo', 'virtuo', 1], ['News', 'blog'], ['List & Save', 'list-and-save'], ['Referral Rewards', 'referral-rewards'], ['Realtor Program', 'realtor-program']],
      phone: '587.291.2288', address: ['106, 7326-10th St. NE', 'Calgary, Alberta T2E 8W1'],
      social: [['facebook-square', 'Facebook', 'https://www.facebook.com/DaytonaHomesCalgary'], ['instagram', 'Instagram', 'https://www.instagram.com/daytonahomesyyc/']],
      treaty: 'Treaty Seven Territory'
    },
    winnipeg: {
      slug: 'winnipeg', name: 'Winnipeg', city: 'Winnipeg', listingsLabel: 'Move-in ready',
      showHomes: 'Visit a showhome', hasNews: false,
      whyOrder: [['Our Comfort Blueprint', 'our-comfort-blueprint-wpg'], ['About Us', 'our-company'], ['Daytona Cares', 'daytona-cares']],
      preApproved: 'pre-approved-wpg',
      heroIntro: 'Placeholder',
      promos: [
        { title: 'Celebrating our 1000th Homeowner!', text: 'Placeholder', img: 'winnipeg/wpg-1000-homeowner.png/4a37c966d901a1d17ff74378cd8950da/wpg-1000-homeowner.webp', href: '/winnipeg' },
        { title: 'Solara Sales Centre Now Open!', text: 'Placeholder', img: 'winnipeg/solara-announcement-promo-box.jpg/262f426f43b7372da6122a9443898d40/solara-announcement-promo-box.webp', href: '/winnipeg' },
        { title: 'Attention First-Time Home Buyers!', text: 'Placeholder', img: 'edmonton/dh-gst-rebate-2026-%282%29.png/6b6e3c780545214347fc57479ef6a3f3/dh-gst-rebate-2026-%282%29.webp', href: '/built-for-first-time-buyers' }
      ],
      buildImg: 'edmonton/dhi_alc_ocean_sh_kitchen_apr_26.png/b538a4680195c04a5615df39a10ebfed/dhi_alc_ocean_sh_kitchen_apr_26.webp',
      comfortTitle: 'Homes crafted with care', comfortSub: 'This is our promise to you.',
      news: [
        { title: 'Attention First-Time Home Buyers!', img: 'edmonton/dh-the-time-is-right-2026.png/73fe20794ae8366741aef04c4ccd4961/dh-the-time-is-right-2026.webp', href: '/winnipeg/blog' },
        { title: 'Common Mistakes First-Time Home Buyers Make (and How to Avoid Them)', img: 'blog-post_fthb-mistakes_2-.png/210093e4f7727092a3a176ca0c58d2db/blog-post_fthb-mistakes_2-.webp', href: '/winnipeg/blog' },
        { title: "5 Timeless Kitchen Design Choices You'll Never Regret", img: 'blog-post_kitchen-design-2.png/d463efe70cae314684a28db179d02db0/blog-post_kitchen-design-2.webp', href: '/winnipeg/blog' }
      ],
      footerLinks: [['Daytona x Virtuo', 'virtuo-wpg', 1], ['News', 'blog'], ['Referral Rewards', 'referral-program'], ['Realtor Program', 'realtor-program'], ['Solara', 'https://solara.daytonahomes.ca', 1]],
      phone: '204.257.7117', address: ['106 Terracon Place', 'Winnipeg, Manitoba R2J 4G7'],
      social: [['facebook-square', 'Facebook', 'https://www.facebook.com/DaytonaHomesWinnipeg/'], ['instagram', 'Instagram', 'https://www.instagram.com/daytonahomeswinnipeg/']],
      treaty: 'Treaty One Territory'
    }
  };

  var CHARITIES = ['canadian-blood-services', 'edss', 'emow-high-res', 'kids-cancer-care-185-wg10', 'distress-centre', 'mustard-seed-horizontal', 'regina-foodbank', 'jim-pattison-childrens-hospital-foundation', 'hopes-home', 'habitat-for-humanity', 'autism-services-sk', 'siloammission-2018-horiz-cmyk', 'foundation-logo-horizontal', 'folklorama_cmyk_hor', 'chf_support-logo_4c_rgb', 'ms-canada-1709664411'];

  window.DAYTONA = { regions: REGIONS, listings: LISTINGS, types: TYPES, charities: CHARITIES, extra: EXTRA };
})();
