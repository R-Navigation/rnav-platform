"use client";
import { useState,type ChangeEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import { consoleApi } from "@/lib/consoleApi";

type Row={username:string;nameZh:string;nameEn:string;memberCategory:string;email:string;publicEmail:string;baseTier:string};
const text=(input:unknown)=>String(input??"").trim();

export function MemberImportDialog({busy,onClose,onImport}:{busy:boolean;onClose:()=>void;onImport:(rows:Row[])=>Promise<void>}) {
  const [rows,setRows]=useState<Row[]>([]); const [error,setError]=useState("");
  async function read(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0]; if(!file)return;
    try {
      const matrix:unknown[][]=file.name.toLowerCase().endsWith(".csv")
        ?(await file.text()).split(/\r?\n/).filter(Boolean).map((line)=>line.split(",").map((cell)=>cell.trim()))
        :await readSheet(file);
      const header=matrix[0].map((cell)=>text(cell).toLowerCase());
      const at=(row:unknown[],name:string)=>text(row[header.indexOf(name)]);
      const parsed=matrix.slice(1).filter((row)=>row.some(Boolean)).map((row)=>({username:at(row,"username").toLowerCase(),nameZh:at(row,"namezh"),nameEn:at(row,"nameen"),memberCategory:at(row,"membercategory")||"master",email:at(row,"email").toLowerCase(),publicEmail:at(row,"publicemail"),baseTier:at(row,"basetier")||"normal"}));
      if(parsed.find((row)=>!row.username||!row.nameZh||!row.email))throw new Error("存在缺少 username、nameZh 或 email 的行");
      const report=await consoleApi<{valid:boolean;rows:Array<{index:number;issues:string[]}>}>("/api/users/import/validate",{method:"POST",body:JSON.stringify({rows:parsed})});
      if(!report.valid)throw new Error(report.rows.filter((row)=>row.issues.length).map((row)=>`第 ${row.index} 行：${row.issues.join("、")}`).join("；"));
      setRows(parsed);setError("");
    } catch(problem) { setRows([]);setError(problem instanceof Error?problem.message:"文件解析失败"); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-3xl bg-white p-6"><div className="flex justify-between"><h2 className="font-serif text-2xl text-blue-950">批量导入成员</h2><button onClick={onClose}>关闭</button></div><p className="mt-3 text-sm text-slate-600">支持 CSV / XLSX。首行字段：username、nameZh、nameEn、memberCategory、email、publicEmail、baseTier。</p><input accept=".csv,.xlsx" className="mt-4 block w-full border border-dashed border-slate-400 p-6" type="file" onChange={(event)=>void read(event)}/>{error?<p className="mt-3 text-sm text-red-700">{error}</p>:null}{rows.length?<div className="mt-4 max-h-64 overflow-auto border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">用户名</th><th>姓名</th><th>类别</th><th>登录邮箱</th></tr></thead><tbody>{rows.map((row)=><tr className="border-t" key={row.username}><td className="p-2">{row.username}</td><td>{row.nameZh}</td><td>{row.memberCategory}</td><td>{row.email}</td></tr>)}</tbody></table></div>:null}<button className="mt-5 bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400" disabled={busy||!rows.length} onClick={()=>void onImport(rows)}>确认导入 {rows.length?`${rows.length} 人`:""}</button></div></div>;
}
