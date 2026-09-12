import type { LabAsset } from "./model";

export const importFields = [
  "code",
  "nameZh",
  "nameEn",
  "model",
  "deviceTypeCode",
  "vendorSerial",
  "storageLocation",
  "status",
  "platformCode",
  "descriptionZh",
] as const;
export type AssetImportField = (typeof importFields)[number];
export type AssetImportRow = Record<AssetImportField, string>;
export type AssetImportMapping = Record<AssetImportField, number | null>;

export const importFieldLabels: Record<AssetImportField, string> = {
  code: "资产编号",
  nameZh: "设备名称",
  nameEn: "英文名称",
  model: "型号",
  deviceTypeCode: "设备类型代码",
  vendorSerial: "厂商序列号",
  storageLocation: "存放位置",
  status: "状态",
  platformCode: "实验平台代码",
  descriptionZh: "备注说明",
};

const headerAliases: Record<AssetImportField, string[]> = {
  code: ["资产编号", "设备编号", "编号", "assetcode", "code"],
  nameZh: ["设备名称", "名称", "中文名称", "name", "namezh"],
  nameEn: ["英文名称", "nameen", "englishname"],
  model: ["型号", "model"],
  deviceTypeCode: [
    "设备类型代码",
    "设备类型",
    "类型",
    "devicetype",
    "devicetypecode",
  ],
  vendorSerial: ["厂商序列号", "序列号", "serial", "vendorserial"],
  storageLocation: [
    "存放位置",
    "存放地点",
    "位置",
    "location",
    "storagelocation",
  ],
  status: ["状态", "status"],
  platformCode: [
    "实验平台代码",
    "实验平台",
    "平台",
    "platform",
    "platformcode",
  ],
  descriptionZh: ["备注说明", "备注", "说明", "description"],
};

function normalizedHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_\-/（）()]+/g, "");
}
function cell(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
const statusAliases: Record<string, string> = {
  闲置: "idle",
  已装载: "mounted",
  装载: "mounted",
  维护中: "maintenance",
  维护: "maintenance",
  报废: "retired",
};

export function autoMapAssetHeaders(headers: unknown[]): AssetImportMapping {
  const normalized = headers.map(normalizedHeader);
  return Object.fromEntries(
    importFields.map((field) => {
      const index = normalized.findIndex((header) =>
        headerAliases[field].includes(header),
      );
      return [field, index < 0 ? null : index];
    }),
  ) as AssetImportMapping;
}

export function mapAssetImportRows(
  matrix: unknown[][],
  mapping: AssetImportMapping,
): AssetImportRow[] {
  return matrix
    .slice(1)
    .filter((row) => row.some((value) => cell(value)))
    .map(
      (row) =>
        Object.fromEntries(
          importFields.map((field) => {
            const value =
              mapping[field] === null || mapping[field] < 0
                ? ""
                : cell(row[mapping[field] as number]);
            return [
              field,
              field === "status"
                ? (statusAliases[value] ?? value.toLocaleLowerCase())
                : value,
            ];
          }),
        ) as AssetImportRow,
    );
}

export function generateMissingAssetCodes(rows: AssetImportRow[]) {
  return rows.map((row, index) => ({
    ...row,
    code:
      row.code ||
      `AUTO-${String(index + 1).padStart(4, "0")}-${
        row.nameZh
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 24) || "ASSET"
      }`,
  }));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function assetImportTemplateCsv() {
  const example = [
    "DEV-CAMERA-012",
    "深度相机",
    "Depth camera",
    "D455",
    "camera",
    "SN-012",
    "507-A 柜 3 层",
    "idle",
    "",
    "前置感知设备",
  ];
  return [importFields.map((field) => importFieldLabels[field]), example]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function exportAssetsCsv(assets: LabAsset[]) {
  const headers = [
    "资产编号",
    "设备名称",
    "英文名称",
    "型号",
    "设备类型",
    "设备类型代码",
    "状态",
    "实验平台",
    "存放位置",
    "当前使用人",
    "借用人",
    "联系方式",
    "厂商序列号",
    "备注说明",
    "最近更新",
  ];
  const rows = assets.map((asset) => [
    asset.code,
    asset.name.zh,
    asset.name.en,
    asset.model,
    asset.deviceTypeName,
    asset.deviceTypeCode,
    asset.status,
    asset.currentPlatformCode ?? "",
    asset.storageLocation ?? "",
    asset.assignedUserName,
    asset.borrowerName,
    asset.borrowerContact,
    asset.vendorSerial,
    asset.description.zh || asset.description.en,
    asset.updatedAt,
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
