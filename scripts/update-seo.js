"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const origin = "https://streeetmanbarberphuket.shop";
const pages = {
  "index.html": {
    path: "/",
    title: "ร้านตัดผมภูเก็ต ย่านวิชิต | StreetMan Barber Phuket",
    description: "ร้านตัดผมชายภูเก็ต ย่านวิชิต ตัดผม เฟด ตกแต่งเคราและโกนหนวด ราคาเริ่ม 200 บาท เปิดทุกวัน 11:00–20:00 จองคิวออนไลน์ได้"
  },
  "about.html": {
    path: "/about.html",
    title: "ร้านตัดผมชายภูเก็ต ย่านวิชิต | รู้จัก StreetMan Barber",
    description: "รู้จัก StreetMan Barber Phuket ร้านตัดผมชายท้องถิ่นย่านวิชิต เปิดตั้งแต่ปี 2021 ดูแลทั้งคนภูเก็ต ชาวต่างชาติ และนักท่องเที่ยว"
  },
  "service.html": {
    path: "/service.html",
    title: "บริการตัดผมชาย เฟด เครา ภูเก็ต | StreetMan Barber",
    description: "บริการตัดผมชายและเฟดในภูเก็ต ตกแต่งเครา โกนหนวด ย้อมผม และเซ็ตทรง พร้อมราคาและเวลาบริการชัดเจนที่วิชิต"
  },
  "price.html": {
    path: "/price.html",
    title: "ราคาตัดผมชายภูเก็ต เริ่ม 300 บาท | StreetMan Barber",
    description: "เช็กราคาตัดผมชายภูเก็ต ตัดผม 300 บาท เคราและโกนหนวด 200 บาท ย้อมผม 150 บาท ราคาชัดเจน จองคิวออนไลน์ได้"
  },
  "team.html": {
    path: "/team.html",
    title: "ช่างตัดผมภูเก็ต ทีม StreetMan Barber วิชิต",
    description: "เลือกช่างตัดผมภูเก็ตที่ StreetMan Barber วิชิต จองกับริม แบงค์ ริค หรือดี ดูทีมช่างและเลือกเวลาว่างออนไลน์"
  },
  "open.html": {
    path: "/open.html",
    title: "ร้านตัดผมภูเก็ตเปิดทุกวัน 11:00–20:00 | StreetMan",
    description: "StreetMan Barber Phuket เปิดทุกวัน 11:00–20:00 ที่วิชิต คิวตัดผมสุดท้าย 19:00 ตรวจเวลาว่างและจองออนไลน์ได้"
  },
  "contact.html": {
    path: "/contact.html",
    title: "ร้านตัดผมใกล้ฉัน วิชิต ภูเก็ต | แผนที่และติดต่อ",
    description: "แผนที่และช่องทางติดต่อ StreetMan Barber Phuket เลขที่ 19/82 หมู่ 2 วิชิต โทร 062-525-8941 พร้อม WhatsApp และจองออนไลน์"
  },
  "testimonial.html": {
    path: "/testimonial.html",
    title: "รีวิวร้านตัดผมภูเก็ต | StreetMan Barber วิชิต",
    description: "อ่านความคิดเห็นจากลูกค้าคนไทยและชาวต่างชาติของ StreetMan Barber Phuket ร้านตัดผมชายย่านวิชิต"
  },
  "book.html": {
    path: "/book.html",
    title: "จองคิวร้านตัดผมภูเก็ตออนไลน์ | StreetMan Barber",
    description: "จองคิวตัดผมภูเก็ตออนไลน์ เลือกบริการ ช่าง วันและเวลาได้ทันที StreetMan Barber วิชิต เปิดทุกวัน 11:00–20:00"
  }
};

for (const [file, seo] of Object.entries(pages)) {
  const filename = path.join(root, file);
  let html = fs.readFileSync(filename, "utf8");
  const url = origin + seo.path;
  html = html.replace(
    /<h1 class="mb-0 text-primary text-uppercase">([\s\S]*?)<\/h1>/,
    '<span class="h1 mb-0 text-primary text-uppercase">$1</span>'
  );
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${seo.title}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${seo.description}">`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${seo.title}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${seo.description}">`);
  html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${origin}/img/carousel-1.jpg">`);
  if (html.includes('property="og:url"')) {
    html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  } else {
    html = html.replace(/(<meta property="og:type" content="[^"]*">)/, `$1\n    <meta property="og:url" content="${url}">`);
  }
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${seo.title}">`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${seo.description}">`);
  if (!html.includes('name="twitter:image"')) {
    html = html.replace(/(<meta name="twitter:description" content="[^"]*">)/, `$1\n    <meta name="twitter:image" content="${origin}/img/carousel-1.jpg">`);
  }
  html = html.replace(
    /<img(?![^>]*(?:loading=|fetchpriority=))([^>]*src="img\/(?!carousel-)[^"]+"[^>]*)>/g,
    '<img loading="lazy" decoding="async"$1>'
  );
  if (file === "index.html") {
    html = html.replace(
      '<img class="w-100" src="img/carousel-1.jpg"',
      '<img class="w-100" src="img/carousel-1.jpg" fetchpriority="high"'
    );
    html = html.replace(
      '<img class="w-100" src="img/carousel-2.jpg"',
      '<img class="w-100" src="img/carousel-2.jpg" loading="lazy" decoding="async"'
    );
  }
  fs.writeFileSync(filename, html);
}

console.log(`Updated SEO metadata for ${Object.keys(pages).length} public pages.`);
