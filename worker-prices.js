// Live service prices for what search engines and AI crawlers read.
//
// The HTML, js/i18n.js and llms.txt are written with the default prices. The
// worker passes public pages through applyPrices() so that, whatever the owner
// sets on "จัดการช่าง" (D1 table `services`), crawlers see the same prices and
// services as the POS and the booking page:
//   - JSON-LD "makesOffer" is rebuilt from the active services;
//   - price phrases in titles, meta descriptions, FAQ answers and the static
//     text ("ตัดผม 300 บาท", "Haircut 300 THB", ...) get the current price;
//   - the "Services and prices" section of llms.txt is rebuilt.
// If D1 can't be read the worker falls back to its default services, which
// match the written prices, so the page is served unchanged.

const ORIGIN = "https://streetmanbarberphuket.shop";
const N = "(\\d[\\d,]*)";

const baht = (n) => Number(n).toLocaleString("en-US");

function priceOf(services, id) {
  const s = services[id];
  return s ? s.price : null;
}

// Cheapest of the main services, for "from N" wording.
function fromPrice(services) {
  const prices = ["haircut", "beard", "shave"]
    .map((id) => services[id])
    .filter((s) => s && s.active)
    .map((s) => s.price);
  return prices.length ? Math.min(...prices) : null;
}

// Each rule: regex source with one number group, and how to rewrite a match.
// Order matters: longer phrases first, all in one pass so nothing is
// rewritten twice.
const RULES = [
  // Thai
  { re: `ราคาเริ่ม ${N} บาท`, out: (p) => `ราคาเริ่ม ${baht(p.from)} บาท`, need: ["from"] },
  { re: `เริ่ม ${N} บาท`, out: (p) => `เริ่ม ${baht(p.haircut)} บาท`, need: ["haircut"] },
  { re: `ตัดผมราคา ${N} บาท`, out: (p) => `ตัดผมราคา ${baht(p.haircut)} บาท`, need: ["haircut"] },
  { re: `ตัดผม ${N} บาท`, out: (p) => `ตัดผม ${baht(p.haircut)} บาท`, need: ["haircut"] },
  {
    re: `เคราและโกนหนวด ${N} บาท`,
    out: (p) => p.beard === p.shave
      ? `เคราและโกนหนวด ${baht(p.beard)} บาท`
      : `ตกแต่งเครา ${baht(p.beard)} บาท โกนหนวด ${baht(p.shave)} บาท`,
    need: ["beard", "shave"]
  },
  { re: `เครา ${N} บาท`, out: (p) => `เครา ${baht(p.beard)} บาท`, need: ["beard"] },
  { re: `โกนหนวด ${N} บาท`, out: (p) => `โกนหนวด ${baht(p.shave)} บาท`, need: ["shave"] },
  { re: `ย้อมผม ${N} บาท`, out: (p) => `ย้อมผม ${baht(p.dye)} บาท`, need: ["dye"] },
  // English
  { re: `shaves from ${N} THB`, out: (p) => `shaves from ${baht(p.from)} THB`, need: ["from"] },
  { re: `from ${N} THB`, out: (p) => `from ${baht(p.haircut)} THB`, need: ["haircut"] },
  { re: `([Hh])aircut is ${N} THB`, out: (p, m) => `${m[1]}aircut is ${baht(p.haircut)} THB`, need: ["haircut"] },
  { re: `Haircut ${N} THB`, out: (p) => `Haircut ${baht(p.haircut)} THB`, need: ["haircut"] },
  {
    re: `beard trim and shave ${N} THB`,
    out: (p) => p.beard === p.shave
      ? `beard trim and shave ${baht(p.beard)} THB`
      : `beard trim ${baht(p.beard)} THB, shave ${baht(p.shave)} THB`,
    need: ["beard", "shave"]
  },
  { re: `beard trim is ${N} THB`, out: (p) => `beard trim is ${baht(p.beard)} THB`, need: ["beard"] },
  { re: `shave is ${N} THB`, out: (p) => `shave is ${baht(p.shave)} THB`, need: ["shave"] },
  { re: `hair dye ${N} THB`, out: (p) => `hair dye ${baht(p.dye)} THB`, need: ["dye"] }
];

// Group index of each rule's first capture inside the combined regex.
const COMBINED = new RegExp(RULES.map((r) => `(${r.re})`).join("|"), "g");
const groupCount = (source) => new RegExp(`${source}|`).exec("").length - 1;
const GROUP_AT = [];
{
  let at = 1;
  for (const r of RULES) {
    GROUP_AT.push(at);
    at += 1 + groupCount(r.re);
  }
}

function rewritePhrases(text, services) {
  const p = {
    haircut: priceOf(services, "haircut"),
    beard: priceOf(services, "beard"),
    shave: priceOf(services, "shave"),
    dye: priceOf(services, "dye"),
    from: fromPrice(services)
  };
  return text.replace(COMBINED, (...args) => {
    const match = args[0];
    for (let i = 0; i < RULES.length; i++) {
      const at = GROUP_AT[i];
      if (args[at] === undefined) continue;
      const rule = RULES[i];
      if (rule.need.some((k) => p[k] === null || p[k] === undefined)) return match;
      const groups = new RegExp(`^${rule.re}$`).exec(match);
      return rule.out(p, groups);
    }
    return match;
  });
}

function activeList(services) {
  return Object.values(services).filter((s) => s.active).sort((a, b) => (a.sort || 0) - (b.sort || 0));
}

function offersJson(services, lang, indent) {
  const pad = " ".repeat(indent);
  const lines = activeList(services).map((s) => {
    const offer = {
      "@type": "Offer",
      price: String(s.price),
      priceCurrency: "THB",
      url: `${ORIGIN}${lang === "en" ? "/en" : ""}/book`,
      itemOffered: { "@type": "Service", name: lang === "en" ? (s.name_en || s.name) : s.name }
    };
    return `${pad}  ${JSON.stringify(offer).replace(/":/g, "\": ").replace(/,"/g, ", \"")}`;
  });
  return `"makesOffer": [\n${lines.join(",\n")}\n${pad}]`;
}

function rewriteOffers(html, services) {
  const lang = /<html lang="en"/.test(html) ? "en" : "th";
  return html.replace(/( *)"makesOffer": \[[\s\S]*?\n\s*\]/g, (_, pad) => pad + offersJson(services, lang, pad.length));
}

function minutesText(m) {
  if (m === 60) return "about 1 hour";
  if (m > 60 && m % 60 === 0) return `about ${m / 60} hours`;
  return `about ${m} minutes`;
}

function rewriteLlms(text, services) {
  const list = activeList(services)
    .map((s) => `- ${s.name_en || s.name}: ${baht(s.price)} (${minutesText(s.minutes)})`)
    .join("\n");
  return text.replace(/(## Services and prices \(THB\)\n\n)[\s\S]*?(\n\n## )/, `$1${list}$2`);
}

// kind: "html" | "llms" | "script"
export function applyPrices(text, services, kind) {
  if (kind === "llms") return rewriteLlms(text, services);
  if (kind === "html") text = rewriteOffers(text, services);
  return rewritePhrases(text, services);
}
