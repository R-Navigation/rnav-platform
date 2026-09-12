"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { consoleApi } from "@/lib/consoleApi";
import { ConsoleIcon } from "@/features/console/ui/ConsoleIcon";

type Notice = { id: string; title: string; message: string; href: string; readAt: string | null; createdAt: string };

export function NotificationBell() {
  const [open,setOpen]=useState(false); const [items,setItems]=useState<Notice[]>([]); const [unread,setUnread]=useState(0); const alive=useRef(true);
  const load=useCallback(async()=>{try{const data=await consoleApi<{notifications:Notice[];unreadCount:number}>("/api/notifications");if(alive.current){setItems(data.notifications);setUnread(data.unreadCount);}}catch{/* Shell remains usable when notifications are temporarily unavailable. */}},[]);
  useEffect(()=>{alive.current=true;void load();const timer=window.setInterval(()=>void load(),60000);const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};document.addEventListener("keydown",close);return()=>{alive.current=false;window.clearInterval(timer);document.removeEventListener("keydown",close);};},[load]);
  async function read(item:Notice){if(!item.readAt){await consoleApi(`/api/notifications/${item.id}/read`,{method:"POST"});setUnread((value)=>Math.max(0,value-1));setItems((value)=>value.map((notice)=>notice.id===item.id?{...notice,readAt:new Date().toISOString()}:notice));}setOpen(false);}
  async function readAll(){await consoleApi("/api/notifications/read-all",{method:"POST"});setUnread(0);setItems((value)=>value.map((item)=>({...item,readAt:item.readAt??new Date().toISOString()})));}
  return <div className="relative">
    <button aria-expanded={open} aria-label={`通知${unread?`，${unread}条未读`:""}`} className="relative grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={()=>setOpen((value)=>!value)}><ConsoleIcon className="size-5" name="bell"/>{unread?<span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white">{unread>99?"99+":unread}</span>:null}</button>
    {open?<div className="absolute right-0 z-50 mt-2 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><b className="text-sm text-slate-950">通知</b>{unread?<span className="ml-2 text-xs text-slate-400">{unread} 条未读</span>:null}</div><button className="rounded-md px-2 py-1 text-xs font-medium text-cyan-800 hover:bg-cyan-50" onClick={()=>void readAll()}>全部已读</button></div><div className="max-h-96 overflow-auto">{items.length?items.map((item)=><Link className={`block border-b border-slate-100 px-4 py-3 transition last:border-0 hover:bg-slate-50 ${item.readAt?"text-slate-500":"bg-cyan-50/50 text-slate-900"}`} href={item.href||"/console"} key={item.id} onClick={()=>void read(item)}><div className="flex gap-3"><span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.readAt?"bg-slate-300":"bg-cyan-600"}`}/><div><p className="text-sm font-semibold">{item.title}</p>{item.message?<p className="mt-1 text-xs leading-5">{item.message}</p>:null}<time className="mt-1 block text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div></div></Link>):<div className="px-4 py-10 text-center"><ConsoleIcon className="mx-auto size-6 text-slate-300" name="bell"/><p className="mt-2 text-sm text-slate-500">暂无通知</p></div>}</div></div>:null}
  </div>;
}
