export type CatalogCsvRow = {
  source_sku: string;
  source_url: string;
  option_sku: string;
  option_url: string;
  is_current_link: string;
  brandName: string;
  skuName: string;
  option_values: string;
  price: string;
  price_status: string;
  price_note: string;
};

export type CatalogImportItem = {
  categoryCode: string;
  sku: string;
  nameZh: string;
  nameEn: string;
  spec: string;
  specMetadata: Record<string, string | number | boolean | null>;
  unit: string;
  packSize: number;
  estimatedUnitPrice: number | null;
  vendor: string;
  url: string;
  keywords: string[];
};

type Family = {
  categoryCode: string;
  nameZh: string;
  nameEn: string;
  family: string;
  material?: string;
  standard?: string;
};

export const families: Record<string, Family> = {
  "100053385015": { categoryCode: "bolts", nameZh: "内六角圆柱头螺钉", nameEn: "Socket head cap screw", family: "socket-head-cap-screw", material: "304不锈钢", standard: "GB/T 70.1" },
  "100234999129": { categoryCode: "bolts", nameZh: "十字薄头螺钉", nameEn: "Phillips low profile screw", family: "phillips-low-profile-screw", material: "304不锈钢" },
  "100044347022": { categoryCode: "nuts", nameZh: "六角螺母", nameEn: "Hex nut", family: "hex-nut" },
  "100044346892": { categoryCode: "nuts", nameZh: "尼龙锁紧螺母", nameEn: "Nylon insert lock nut", family: "nylon-insert-lock-nut" },
  "100053385755": { categoryCode: "washers", nameZh: "平垫圈", nameEn: "Flat washer", family: "flat-washer", material: "304不锈钢" },
  "100044541370": { categoryCode: "studs-rods", nameZh: "铜双通六角隔离柱", nameEn: "Brass female-female hex standoff", family: "female-female-hex-standoff", material: "铜" },
  "100044811888": { categoryCode: "studs-rods", nameZh: "铜单通六角隔离柱", nameEn: "Brass male-female hex standoff", family: "male-female-hex-standoff", material: "铜" },
  "100345313878": { categoryCode: "studs-rods", nameZh: "不锈钢双通六角隔离柱", nameEn: "Stainless female-female hex standoff", family: "stainless-female-female-hex-standoff", material: "304不锈钢" },
};

function parseOptions(value: string) {
  return Object.fromEntries(value.split(/[；;]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}

function firstMatch(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? null;
}

function numberMatch(value: string | null) {
  return value === null ? null : Number(value);
}

function cleanDimension(value: string) {
  return value.replace(/^H(?=M)/i, "").replace(/\s+/g, "").replace(/[×X*]/g, "x");
}

function withoutPackage(value: string) {
  return value.replace(/\[[^\]]+]/g, "").trim();
}

function detectedMaterial(value: string, fallback?: string) {
  const normalized = value.replace(/黑色/g, "");
  const explicit = ["316不锈钢", "304不锈钢", "201不锈钢", "铜", "尼龙"].find((material) => normalized.includes(material));
  if (explicit) return explicit;
  const grade = normalized.match(/(?:^|\D)(316|304|201)(?:\D|$)/)?.[1];
  return grade ? `${grade}不锈钢` : fallback ?? null;
}

function extractPrimarySpec(options: Record<string, string>) {
  const raw = options.规格 ?? options.型号 ?? options.公称直径 ?? options.公称长度 ?? "";
  const candidates = [options.规格, options.型号, options.公称直径, options.公称长度].filter(Boolean) as string[];
  const dimensional = candidates.find((value) => /H?M\d/i.test(value) && !/不锈钢.*柱$/.test(value));
  const unpacked = cleanDimension(withoutPackage(dimensional ?? raw));
  return unpacked.match(/H?M\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)*(?:\+\d+(?:\.\d+)?)?(?:牙)?/i)?.[0].replace(/^H(?=M)/i, "") ?? unpacked;
}

function variantLabels(value: string) {
  return [
    value.includes("细牙") ? "细牙" : null,
    value.includes("反牙") ? "反牙" : null,
    value.includes("防锁死") ? "防锁死" : null,
    value.includes("黑色") ? "黑色" : null,
    value.includes("加厚") ? "加厚" : null,
    value.includes("超薄") ? "超薄" : null,
  ].filter((label): label is string => Boolean(label));
}

function parsePackQuantity(value: string) {
  const raw = firstMatch(value, /\[(\d+)\s*个(?:\/包|包)?]/);
  if (!raw) throw new Error(`Missing package quantity: ${value}`);
  return Number(raw);
}

function parsePrice(value: string) {
  if (!value.trim()) return null;
  const price = Number(value.replace(/[¥￥,\s]/g, ""));
  if (!Number.isFinite(price) || price < 0) throw new Error(`Invalid price: ${value}`);
  return price;
}

function dimensionMetadata(family: Family, dimension: string) {
  const thread = firstMatch(dimension, /^(M\d+(?:\.\d+)?)/i)?.toUpperCase() ?? null;
  const numbers = dimension.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const metadata: Record<string, string | number | boolean | null> = { thread };
  if (family.family === "socket-head-cap-screw") metadata.lengthMm = numbers[1] ?? null;
  else if (family.family === "phillips-low-profile-screw") { metadata.lengthMm = numbers[1] ?? null; metadata.headDiameterMm = numbers[2] ?? null; }
  else if (family.family === "flat-washer") { metadata.outerDiameterMm = numbers[1] ?? null; metadata.thicknessMm = numbers[2] ?? null; }
  else if (family.family === "male-female-hex-standoff") { metadata.bodyLengthMm = numbers[1] ?? null; metadata.maleThreadLengthMm = numberMatch(firstMatch(dimension, /\+(\d+(?:\.\d+)?)$/)); }
  else if (family.family.includes("standoff")) metadata.bodyLengthMm = numbers[1] ?? null;
  else if (family.family.includes("nut")) metadata.threadPitchMm = numberMatch(firstMatch(dimension, /x(\d+(?:\.\d+)?)牙/i));
  return metadata;
}

function compactKeywords(values: Array<string | null | undefined>) {
  return [...new Set(values.flatMap((value) => value ? value.split(/[\s,，/]+/) : []).map((value) => value.trim()).filter(Boolean))].slice(0, 30);
}

export function normalizeCatalogRow(row: CatalogCsvRow): CatalogImportItem {
  const family = families[row.source_sku];
  if (!family) throw new Error(`Unsupported source SKU: ${row.source_sku}`);
  if (!/^\d+$/.test(row.option_sku)) throw new Error(`Invalid option SKU: ${row.option_sku}`);
  const options = parseOptions(row.option_values);
  const dimension = extractPrimarySpec(options);
  const packQuantity = parsePackQuantity(row.option_values);
  const material = detectedMaterial(row.option_values, family.material);
  const leadTime = options.货期 ?? null;
  const variants = variantLabels(row.option_values);
  const hexWidthMm = numberMatch(firstMatch(row.option_values, /对边\s*(\d+(?:\.\d+)?)/));
  const metadata = {
    source: "jd",
    sourceSku: row.source_sku,
    optionSku: row.option_sku,
    productFamily: family.family,
    brand: row.brandName.replace(/（GUWANJI）/g, "").trim(),
    material,
    standard: family.standard ?? null,
    packQuantity,
    packUnit: "个",
    leadTime,
    variants,
    hexWidthMm,
    rawOptionValues: row.option_values,
    ...dimensionMetadata(family, dimension),
  };
  const descriptors = [dimension, hexWidthMm === null ? null : `对边${hexWidthMm}mm`, material, ...variants, `${packQuantity}个/包`, leadTime ? `货期${leadTime}` : null].filter(Boolean);
  return {
    categoryCode: family.categoryCode,
    sku: `JD-${row.option_sku}`,
    nameZh: family.nameZh,
    nameEn: family.nameEn,
    spec: descriptors.join(" · "),
    specMetadata: metadata,
    unit: "包",
    packSize: 1,
    estimatedUnitPrice: parsePrice(row.price),
    vendor: `${row.brandName.replace(/（GUWANJI）/g, "").trim()}（京东）`,
    url: row.option_url,
    keywords: compactKeywords([family.nameZh, family.nameEn, dimension, hexWidthMm === null ? null : `对边${hexWidthMm}`, material, family.standard, metadata.thread as string | null, row.brandName, ...variants]),
  };
}

export function normalizeCatalogRows(rows: CatalogCsvRow[]) {
  const seen = new Set<string>();
  return rows.map(normalizeCatalogRow).map((item) => {
    if (seen.has(item.sku)) throw new Error(`Duplicate SKU: ${item.sku}`);
    seen.add(item.sku);
    return item;
  });
}
