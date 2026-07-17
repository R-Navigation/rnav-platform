import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { parse } from "csv-parse/sync";
import { parseArgs, requiredArg, sha256, writeJson } from "../db/common.js";
import {
  buildProcurementHistorySummary,
  parseProcurementHistoryRows,
  type ProcurementHistoryCsvRow,
  type ProcurementHistoryGroup,
} from "./historyCsv.js";

type Queryable = Pick<pg.Client, "query">;
type UserRow = { id: string; username: string; display_name: string };

function timestamp(date: string, minuteOffset = 0) {
  const dateValue = new Date(`${date}T12:00:00+08:00`);
  dateValue.setMinutes(dateValue.getMinutes() + minuteOffset);
  return dateValue;
}

function titleFor(group: ProcurementHistoryGroup) {
  const names = [...new Set(group.items.map((item) => item.name))];
  const summary = names.slice(0, 3).join("、");
  return `${group.date} 历史采购：${summary}${names.length > 3 ? `等 ${group.items.length} 项` : ""}`;
}

export async function applyProcurementHistoryImport(
  client: Queryable,
  groups: ProcurementHistoryGroup[],
  options: { sourceSha256: string; processorUsername?: string },
) {
  const processorUsername = options.processorUsername ?? "buy-admin";
  const usernames = [...new Set([...groups.map((group) => group.requesterUsername), processorUsername])];
  const users = await client.query<UserRow>("SELECT id,username,display_name FROM users WHERE username=ANY($1::text[])", [usernames]);
  const usersByUsername = new Map(users.rows.map((user) => [user.username, user]));
  const missingUsers = usernames.filter((username) => !usersByUsername.has(username));
  if (missingUsers.length) throw new Error(`Missing users: ${missingUsers.join(", ")}`);
  const processor = usersByUsername.get(processorUsername)!;

  await client.query("BEGIN");
  try {
    let insertedRequests = 0;
    let insertedItems = 0;
    let insertedSpendEntries = 0;
    let skippedRequests = 0;

    for (const group of groups) {
      const duplicate = await client.query("SELECT 1 FROM procurement_requests WHERE request_no=$1", [group.requestNo]);
      if (duplicate.rowCount) {
        skippedRequests += 1;
        continue;
      }
      const requester = usersByUsername.get(group.requesterUsername)!;
      const submittedAt = timestamp(group.date);
      const processedAt = timestamp(group.date, 1);
      const purchasedAt = timestamp(group.date, 2);
      const closedAt = timestamp(group.date, group.status === "received" ? 3 : 2);
      const request = await client.query<{ id: string }>(`INSERT INTO procurement_requests
        (request_no,requester_id,title,reason,status,total_estimated_amount,submitted_at,reviewed_by,reviewed_at,purchased_by,purchased_at,received_at,closed_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,'closed',$5,$6,$7,$8,$9,$10,$11,$12,$6,$12) RETURNING id`, [
        group.requestNo,
        requester.id,
        titleFor(group),
        `由采购历史.csv导入；原始批次状态：${group.status === "received" ? "确认收货" : "全部驳回"}；共 ${group.items.length} 项。`,
        group.totalAmount,
        submittedAt,
        processor.id,
        processedAt,
        group.status === "received" ? processor.id : null,
        group.status === "received" ? purchasedAt : null,
        group.status === "received" ? closedAt : null,
        closedAt,
      ]);
      const requestId = request.rows[0].id;

      for (const [sortOrder, item] of group.items.entries()) {
        const processingStatus = group.status === "received" ? "purchased" : "rejected";
        const snapshot = {
          source: "procurement-history-csv",
          sourceSha256: options.sourceSha256,
          sourceLine: item.line,
          originalStatus: group.status === "received" ? "确认收货" : "驳回",
          originalLink: item.originalLink,
          originalInvoiceNote: item.invoiceNote,
          originalUnitPrice: item.originalUnitPrice,
          originalQuantity: item.originalQuantity,
          originalTotalPrice: item.totalPrice,
          categoryNameZh: "历史采购",
          subcategoryNameZh: group.status === "received" ? "已购条目" : "已驳回条目",
          specMetadata: {},
        };
        await client.query(`INSERT INTO procurement_request_items
          (request_id,catalog_item_id,item_name,spec,quantity,estimated_unit_price,vendor,url,remark,sort_order,source_type,catalog_snapshot,unit,processing_status,rejection_reason,processed_by,processed_at)
          VALUES($1,NULL,$2,$3,$4,$5,NULL,$6,$7,$8,'custom',$9::jsonb,'件',$10,$11,$12,$13)`, [
          requestId,
          item.name,
          item.spec,
          item.quantity,
          item.unitPrice,
          item.url,
          item.remark,
          sortOrder,
          JSON.stringify(snapshot),
          processingStatus,
          processingStatus === "rejected" ? "历史记录状态为驳回" : null,
          processor.id,
          processedAt,
        ]);
        insertedItems += 1;
      }

      await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note,created_at) VALUES($1,'draft','submitted',$2,'从采购历史.csv导入',$3)", [requestId, requester.id, submittedAt]);
      await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note,created_at) VALUES($1,'submitted','purchasing',$2,'历史采购处理记录',$3)", [requestId, processor.id, processedAt]);
      if (group.status === "received") {
        await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note,created_at) VALUES($1,'purchasing','purchased',$2,'历史条目均已购买',$3),($1,'purchased','closed',$2,'历史记录已确认收货',$4)", [requestId, processor.id, purchasedAt, closedAt]);
        await client.query(`INSERT INTO procurement_spend_entries(request_id,scope,amount,note,created_by,updated_by,created_at,updated_at)
          VALUES($1,'request_total',$2,'采购历史.csv 中采购价格合计',$3,$3,$4,$4)`, [requestId, group.totalAmount, processor.id, closedAt]);
        insertedSpendEntries += 1;
      } else {
        await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note,created_at) VALUES($1,'purchasing','closed',$2,'历史记录中全部条目均被驳回',$3)", [requestId, processor.id, closedAt]);
      }
      await client.query(`INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail,created_at)
        VALUES($1,'procurement.history.import','procurement_request',$2,$3::jsonb,$4)`, [processor.id, requestId, JSON.stringify({ requestNo: group.requestNo, sourceSha256: options.sourceSha256, sourceDate: group.date, requesterName: group.requesterName, items: group.items.length, status: group.status }), closedAt]);
      insertedRequests += 1;
    }
    await client.query("COMMIT");
    return { insertedRequests, insertedItems, insertedSpendEntries, skippedRequests };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function importProcurementHistoryCsv({
  input,
  report,
  databaseUrl,
  apply,
  processorUsername,
}: {
  input: string;
  report: string;
  databaseUrl?: string;
  apply: boolean;
  processorUsername?: string;
}) {
  const raw = await readFile(resolve(input), "utf8");
  const rows = parse(raw.replace(/^\uFEFF/, ""), { columns: true, skip_empty_lines: true, relax_column_count: true }) as ProcurementHistoryCsvRow[];
  const groups = parseProcurementHistoryRows(rows);
  const sourceSha256 = sha256(raw);
  let result: Awaited<ReturnType<typeof applyProcurementHistoryImport>> | null = null;
  if (apply) {
    if (!databaseUrl) throw new Error("--database-url or DATABASE_URL is required with --apply");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      result = await applyProcurementHistoryImport(client, groups, { sourceSha256, processorUsername });
    } finally {
      await client.end();
    }
  }
  const output = {
    generatedAt: new Date().toISOString(),
    input: resolve(input),
    sourceSha256,
    mode: apply ? "applied" : "preview",
    ...buildProcurementHistorySummary(groups),
    result,
    requests: groups.map((group) => ({ requestNo: group.requestNo, date: group.date, requesterName: group.requesterName, status: group.status, items: group.items.length, totalAmount: group.totalAmount })),
  };
  await writeJson(report, output);
  return { ...output, report: resolve(report) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  importProcurementHistoryCsv({
    input: requiredArg(args, "in"),
    report: typeof args.get("report") === "string" ? String(args.get("report")) : "outputs/procurement-history-import-report.json",
    databaseUrl: typeof args.get("database-url") === "string" ? String(args.get("database-url")) : process.env.DATABASE_URL,
    apply: args.has("apply"),
    processorUsername: typeof args.get("processor-username") === "string" ? String(args.get("processor-username")) : undefined,
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
