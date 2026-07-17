import assert from "node:assert/strict";
import test from "node:test";
import { applyProcurementHistoryImport } from "./import-history-csv.js";
import { buildProcurementHistorySummary, parseProcurementHistoryRows, type ProcurementHistoryCsvRow } from "./historyCsv.js";

function row(values: Partial<ProcurementHistoryCsvRow>): ProcurementHistoryCsvRow {
  return { 时间: "", 申请人: "", 采购名称: "", "状态【下拉】": "", 采购单价: "", 采购链接: "", 采购说明: "", 采购数量: "", 采购价格: "", "开票备注【学生不管】": "", ...values };
}

test("history CSV restores continuation names and groups by date plus requester", () => {
  const groups = parseProcurementHistoryRows([
    row({ 时间: "2025.10.1", 申请人: "魏玄", 采购名称: "M3 螺钉", "状态【下拉】": "确认收货", 采购单价: "5", 采购数量: "2", 采购价格: "10", 采购说明: "M3x8" }),
    row({ 申请人: "魏玄", 采购单价: "6", 采购数量: "2", 采购价格: "12", 采购说明: "M3x10" }),
    row({ 申请人: "周明杨", 采购名称: "网线", "状态【下拉】": "确认收货", 采购单价: "8", 采购数量: "1", 采购价格: "8" }),
  ]);
  assert.equal(groups.length, 2);
  const screwGroup = groups.find((group) => group.requestNo === "HIST-20251001-xuan-wei")!;
  assert.deepEqual(screwGroup.items.map((item) => item.name), ["M3 螺钉", "M3 螺钉"]);
  assert.equal(screwGroup.totalAmount, 22);
  assert.equal(buildProcurementHistorySummary(groups).itemCount, 3);
});

test("history CSV preserves rejected rows, non-URL sources, and zero-value missing fields", () => {
  const [group] = parseProcurementHistoryRows([
    row({ 时间: "2026.1.1", 申请人: "李由", 采购名称: "NX 配件差价", "状态【下拉】": "驳回", 采购链接: "嘉立创采购", 采购价格: "0" }),
  ]);
  assert.equal(group.status, "rejected");
  assert.equal(group.items[0].quantity, 1);
  assert.equal(group.items[0].unitPrice, 0);
  assert.equal(group.items[0].url, null);
  assert.match(group.items[0].remark, /原采购来源：嘉立创采购/);
  assert.match(group.items[0].remark, /原采购数量为空/);
  assert.match(group.items[0].remark, /原采购单价为空/);
});

test("history CSV reconciles malformed unit prices to the authoritative line total", () => {
  const [group] = parseProcurementHistoryRows([
    row({ 时间: "2025.10.1", 申请人: "魏玄", 采购名称: "螺钉", "状态【下拉】": "确认收货", 采购单价: "4.5.", 采购数量: "5", 采购价格: "5" }),
  ]);
  assert.equal(group.items[0].unitPrice, 1);
  assert.equal(group.items[0].originalUnitPrice, "4.5.");
  assert.match(group.items[0].remark, /按总价\/数量回算/);
});

test("history import is transactional, records spending, and skips deterministic duplicates", async () => {
  const groups = parseProcurementHistoryRows([
    row({ 时间: "2025.10.1", 申请人: "魏玄", 采购名称: "螺钉", "状态【下拉】": "确认收货", 采购单价: "5", 采购数量: "2", 采购价格: "10" }),
    row({ 时间: "2026.1.1", 申请人: "魏玄", 采购名称: "NAS", "状态【下拉】": "驳回", 采购单价: "100", 采购数量: "1", 采购价格: "100" }),
  ]);
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let requestIndex = 0;
  const client = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT id,username")) return { rows: [
      { id: "requester", username: "xuan-wei", display_name: "魏玄" },
      { id: "processor", username: "buy-admin", display_name: "采购管理员" },
    ], rowCount: 2 };
    if (sql.startsWith("SELECT 1 FROM procurement_requests")) return { rows: requestIndex++ === 0 ? [] : [{ exists: 1 }], rowCount: requestIndex === 1 ? 0 : 1 };
    if (sql.includes("RETURNING id")) return { rows: [{ id: "request-1" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  } };
  const result = await applyProcurementHistoryImport(client as never, groups, { sourceSha256: "abc" });
  assert.deepEqual(result, { insertedRequests: 1, insertedItems: 1, insertedSpendEntries: 1, skippedRequests: 1 });
  assert.equal(calls[1].sql, "BEGIN");
  assert.equal(calls.at(-1)?.sql, "COMMIT");
  assert.ok(calls.some((call) => call.sql.includes("'request_total'")));
  assert.ok(calls.some((call) => call.sql.includes("procurement.history.import")));
  const itemInsert = calls.find((call) => call.sql.includes("INSERT INTO procurement_request_items"))!;
  assert.equal(itemInsert.values?.[9], "purchased");
  const requestInsert = calls.find((call) => call.sql.includes("INSERT INTO procurement_requests"))!;
  assert.equal(requestInsert.values?.[8], "processor");
});
