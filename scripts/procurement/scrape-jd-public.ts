import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stringify } from "csv-stringify/sync";
import { parseArgs, requiredArg, writeJson } from "../db/common.js";
import type { CatalogCsvRow } from "./catalogCsv.js";

type JdOption = { skuId: string; imagePath?: string; [key: string]: string | undefined };
type JdItem = {
  skuId: string;
  skuName: string;
  brandName: string;
  image?: string[];
  saleProp: Record<string, string>;
  newColorSize: JdOption[];
};

const jdUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

function sleep(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function isJdRiskPage(html: string) {
  return html.includes("privatedomain/risk_handler") || html.includes("risk_handler/03101900");
}

export function extractItemOnly(html: string): { item: JdItem } {
  const marker = "window._itemOnly = (";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error("Public JD item payload was not found");
  const start = html.indexOf("{", markerIndex + marker.length);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(html.slice(start, index + 1)) as { item: JdItem };
  }
  throw new Error("Public JD item payload was incomplete");
}

export function publicItemRows(sourceSku: string, item: JdItem): CatalogCsvRow[] {
  if (!item.newColorSize?.length) throw new Error(`No public options found for ${sourceSku}`);
  const properties = Object.entries(item.saleProp).sort(([left], [right]) => Number(left) - Number(right));
  return item.newColorSize.map((option) => ({
    source_sku: sourceSku,
    source_url: `https://item.jd.com/${sourceSku}.html`,
    option_sku: String(option.skuId),
    option_url: `https://item.jd.com/${option.skuId}.html`,
    is_current_link: String(option.skuId === sourceSku),
    brandName: item.brandName,
    skuName: item.skuName,
    option_values: properties.map(([key, label]) => `${label}=${option[key] ?? ""}`).join("；"),
    price: "",
    price_status: "",
    price_note: "按要求仅抓取公开商品规格，未抓取价格或登录后信息",
  }));
}

async function fetchPublicJdHtml(url: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": jdUserAgent } });
    if (!response.ok) throw new Error(`JD request failed (${response.status}): ${url}`);
    const html = await response.text();
    if (!isJdRiskPage(html)) return html;
    if (attempt < 3) await sleep(attempt * 1500);
  }
  throw new Error(`JD public page was rate-limited after 3 attempts: ${url}`);
}

export async function scrapeJdPublic(skus: string[], fetchHtml: (url: string) => Promise<string> = fetchPublicJdHtml) {
  const products = [] as Array<{ sourceSku: string; name: string; brand: string; imageUrl: string | null; optionCount: number; rows: CatalogCsvRow[] }>;
  for (const sourceSku of skus) {
    if (!/^\d+$/.test(sourceSku)) throw new Error(`Invalid JD source SKU: ${sourceSku}`);
    const payload = extractItemOnly(await fetchHtml(`https://item.m.jd.com/product/${sourceSku}.html`));
    const rows = publicItemRows(sourceSku, payload.item);
    const imagePath = payload.item.image?.[0] ?? payload.item.newColorSize[0]?.imagePath;
    products.push({ sourceSku, name: payload.item.skuName, brand: payload.item.brandName, imageUrl: imagePath ? `https://img14.360buyimg.com/n1/${imagePath}` : null, optionCount: rows.length, rows });
    await sleep(500);
  }
  return products;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  const skus = requiredArg(args, "skus").split(",").map((value) => value.trim()).filter(Boolean);
  const output = typeof args.get("out") === "string" ? resolve(String(args.get("out"))) : resolve("outputs/jd-public-options.csv");
  const report = typeof args.get("report") === "string" ? String(args.get("report")) : "outputs/jd-public-options-report.json";
  scrapeJdPublic(skus).then(async (products) => {
    const rows = products.flatMap((product) => product.rows);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, stringify(rows, { header: true, columns: Object.keys(rows[0]) }), "utf8");
    await writeJson(report, { generatedAt: new Date().toISOString(), source: "public JD mobile item payload", priceDataCollected: false, products: products.map(({ rows: _rows, ...product }) => product), rowCount: rows.length, output });
    console.log(JSON.stringify({ products: products.length, rows: rows.length, output, report: resolve(report) }, null, 2));
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
