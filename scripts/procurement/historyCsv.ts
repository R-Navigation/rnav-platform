export type ProcurementHistoryCsvRow = {
  时间: string;
  申请人: string;
  采购名称: string;
  "状态【下拉】": string;
  采购单价: string;
  采购链接: string;
  采购说明: string;
  采购数量: string;
  采购价格: string;
  "开票备注【学生不管】": string;
};

export type ProcurementHistoryItem = {
  line: number;
  name: string;
  spec: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  originalUnitPrice: string;
  originalQuantity: string;
  url: string | null;
  remark: string;
  originalLink: string;
  invoiceNote: string;
};

export type ProcurementHistoryGroup = {
  date: string;
  requesterName: string;
  requesterUsername: string;
  requestNo: string;
  status: "received" | "rejected";
  items: ProcurementHistoryItem[];
  totalAmount: number;
};

export const requesterAliases: Record<string, string> = {
  "魏玄": "xuan-wei",
  "周明杨": "mingyang-zhou",
  "李由": "you-li",
  "黄璇": "xuan-huang",
  "李振超": "zhenchao-li",
};

function money(value: string, fallback: number | null = null) {
  const parsed = Number(value.trim());
  if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed * 100) / 100;
  if (fallback !== null) return fallback;
  throw new Error(`Invalid money value: ${value}`);
}

function quantity(value: string, totalPrice: number) {
  const parsed = Number(value.trim());
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  if (totalPrice === 0) return 1;
  throw new Error(`Invalid quantity: ${value}`);
}

function resolvedUnitPrice(value: string, itemQuantity: number, totalPrice: number) {
  const raw = value.trim();
  if (!raw && totalPrice === 0) return { value: 0, note: "原采购单价为空，按 0 元保留" };
  const normalized = /^\d+(?:\.\d+)?\.$/.test(raw) ? raw.slice(0, -1) : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid money value: ${value}`);
  const expectedTotal = Math.round(parsed * itemQuantity * 100) / 100;
  if (Math.abs(expectedTotal - totalPrice) > 0.01) {
    return { value: Math.round(totalPrice / itemQuantity * 100) / 100, note: `原采购单价“${raw}”与总价不一致，按总价/数量回算` };
  }
  return { value: Math.round(parsed * 100) / 100, note: normalized !== raw ? `原采购单价“${raw}”含尾随句点，已规范为 ${normalized}` : null };
}

function normalizeDate(value: string) {
  const match = value.trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!match) throw new Error(`Invalid procurement date: ${value}`);
  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${normalized}T12:00:00+08:00`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== normalized) throw new Error(`Invalid procurement date: ${value}`);
  return normalized;
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function compact(values: Array<string | null>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join("；");
}

export function parseProcurementHistoryRows(rows: ProcurementHistoryCsvRow[]) {
  let currentDate = "";
  const lastNameByGroup = new Map<string, string>();
  const groups = new Map<string, ProcurementHistoryGroup>();

  rows.forEach((row, index) => {
    const line = index + 2;
    if (row.时间.trim()) currentDate = normalizeDate(row.时间);
    if (!currentDate) throw new Error(`Line ${line}: missing date before continuation row`);

    const requesterName = row.申请人.trim();
    const requesterUsername = requesterAliases[requesterName];
    if (!requesterName || !requesterUsername) throw new Error(`Line ${line}: unknown requester ${requesterName || "(blank)"}`);

    const key = `${currentDate}|${requesterName}`;
    const explicitName = row.采购名称.trim();
    if (explicitName) lastNameByGroup.set(key, explicitName);
    const name = explicitName || lastNameByGroup.get(key);
    if (!name) throw new Error(`Line ${line}: missing procurement name before continuation row`);

    const rowStatus = row["状态【下拉】"].trim();
    if (rowStatus && rowStatus !== "确认收货" && rowStatus !== "驳回") throw new Error(`Line ${line}: unsupported status ${rowStatus}`);
    const totalPrice = money(row.采购价格);
    const itemQuantity = quantity(row.采购数量, totalPrice);
    const unitPrice = resolvedUnitPrice(row.采购单价, itemQuantity, totalPrice);
    const link = row.采购链接.trim();
    const url = safeUrl(link);
    const invoiceNote = row["开票备注【学生不管】"].trim();
    const missingFields = [!row.采购数量.trim() ? "原采购数量为空，按 1 件保留" : null, unitPrice.note];
    const remark = compact([
      !url && link ? `原采购来源：${link}` : null,
      invoiceNote ? `开票备注：${invoiceNote}` : null,
      ...missingFields,
      `历史 CSV 第 ${line} 行`,
    ]);

    const status = rowStatus === "驳回" ? "rejected" : "received";
    const existing = groups.get(key);
    if (existing && existing.status !== status) throw new Error(`Line ${line}: mixed received and rejected rows in one request`);
    const group = existing ?? {
      date: currentDate,
      requesterName,
      requesterUsername,
      requestNo: `HIST-${currentDate.replaceAll("-", "")}-${requesterUsername}`,
      status,
      items: [],
      totalAmount: 0,
    };
    group.items.push({
      line,
      name,
      spec: row.采购说明.trim(),
      quantity: itemQuantity,
      unitPrice: unitPrice.value,
      totalPrice,
      originalUnitPrice: row.采购单价.trim(),
      originalQuantity: row.采购数量.trim(),
      url,
      remark,
      originalLink: link,
      invoiceNote,
    });
    group.totalAmount = Math.round((group.totalAmount + totalPrice) * 100) / 100;
    groups.set(key, group);
  });

  return [...groups.values()].sort((left, right) => left.date.localeCompare(right.date) || left.requesterUsername.localeCompare(right.requesterUsername));
}

export function buildProcurementHistorySummary(groups: ProcurementHistoryGroup[]) {
  const byRequester = new Map<string, { requests: number; items: number; amount: number }>();
  for (const group of groups) {
    const current = byRequester.get(group.requesterName) ?? { requests: 0, items: 0, amount: 0 };
    current.requests += 1;
    current.items += group.items.length;
    current.amount = Math.round((current.amount + group.totalAmount) * 100) / 100;
    byRequester.set(group.requesterName, current);
  }
  return {
    requestCount: groups.length,
    itemCount: groups.reduce((sum, group) => sum + group.items.length, 0),
    totalAmount: Math.round(groups.reduce((sum, group) => sum + group.totalAmount, 0) * 100) / 100,
    receivedRequests: groups.filter((group) => group.status === "received").length,
    rejectedRequests: groups.filter((group) => group.status === "rejected").length,
    byRequester: Object.fromEntries([...byRequester.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN"))),
  };
}
