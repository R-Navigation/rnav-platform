import assert from "node:assert/strict";
import test from "node:test";
import {
  assetImportTemplateCsv,
  autoMapAssetHeaders,
  exportAssetsCsv,
  generateMissingAssetCodes,
  mapAssetImportRows,
  parseCsv,
} from "./import-export.ts";

test("CSV parser preserves quoted commas, quotes, and line breaks", () => {
  assert.deepEqual(
    parseCsv('名称,备注\r\n相机,"室内,外场"\r\n雷达,"包含""引号"""'),
    [
      ["名称", "备注"],
      ["相机", "室内,外场"],
      ["雷达", '包含"引号"'],
    ],
  );
});

test("missing asset codes can be generated deterministically before validation", () => {
  const row = mapAssetImportRows(
    [["名称"], ["深度相机"]],
    autoMapAssetHeaders(["名称"]),
  )[0];
  assert.equal(generateMissingAssetCodes([row])[0].code, "AUTO-0001-ASSET");
});

test("asset import headers auto map common Chinese aliases", () => {
  const matrix = [
    ["设备编号", "设备名称", "型号", "设备类型", "序列号", "存放地点", "状态"],
    ["CAM-1", "相机", "D455", "camera", "SN-1", "507", "idle"],
  ];
  const mapping = autoMapAssetHeaders(matrix[0]);
  assert.equal(mapping.code, 0);
  assert.equal(mapping.storageLocation, 5);
  assert.deepEqual(mapAssetImportRows(matrix, mapping)[0], {
    code: "CAM-1",
    nameZh: "相机",
    nameEn: "",
    model: "D455",
    deviceTypeCode: "camera",
    vendorSerial: "SN-1",
    storageLocation: "507",
    status: "idle",
    platformCode: "",
    descriptionZh: "",
  });
});

test("template and export escape spreadsheet formulas", () => {
  assert.match(assetImportTemplateCsv(), /资产编号/);
  const csv = exportAssetsCsv([
    {
      code: "=CMD()",
      name: { zh: "+相机", en: "" },
      description: { zh: "", en: "" },
      deviceTypeCode: "camera",
      deviceTypeName: "相机",
      model: "",
      vendorSerial: "",
      status: "idle",
      currentPlatformCode: null,
      assignedUserId: null,
      assignedUserName: "",
      borrowerName: "",
      borrowerContact: "",
      storageLocation: null,
      updatedAt: "",
    },
  ]);
  assert.match(csv, /'=CMD\(\)/);
  assert.match(csv, /'\+相机/);
});
