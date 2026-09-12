"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { consoleApi } from "@/lib/consoleApi";

type Notice = { id: string; title: string; message: string; href: string; readAt: string | null; createdAt: string };

export function NotificationBell() {
  const [open,setOpen]=useState(false); const [items,setItems]=useState<Notice[]>([]); const [unread,setUnread]=useState(0); const alive=useRef(true);
  const load=useCallback(async()=>{try{const data=await consoleApi<{notifications:Notice[];unreadCount:number}>("/api/notifications");if(alive.current){setItems(data.notifications);setUnread(data.unreadCount);}}catch{/* Shell remains usable when notifications are temporarily unavailable. */}},[]);
  useEffect(()=>{alive.current=true;void load();const timer=window.setInterval(()=>void load(),60000);return()=>{alive.current=false;window.clearInterval(timer);};},[load]);
  async function read(item:Notice){if(!item.readAt){await consoleApi(`/api/notifications/${item.id}/read`,{method:"POST"});setUnread((value)=>Math.max(0,value-1));setItems((value)=>value.map((notice)=>notice.id===item.id?{...notice,readAt:new Date().toISOString()}:notice));}setOpen(false);}
  async function readAll(){await consoleApi("/api/notifications/read-all",{method:"POST"});setUnread(0);setItems((value)=>value.map((item)=>({...item,readAt:item.readAt??new Date().toISOString()})));}
  return <div className="relative">
    <button aria-expanded={open} aria-label={`通知${unread?`，${unread}条未读`:""}`} className="relative grid size-10 place-items-center border border-slate-300 bg-white text-lg text-blue-950 hover:border-cyan-600" onClick={()=>setOpen((value)=>!value)}>🔔{unread?<span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-[11px] font-bold leading-5 text-white">{unread>99?"99+":unread}</span>:null}</button>
    {open?<div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><b className="text-sm text-blue-950">通知</b><button className="text-xs text-cyan-800 underline" onClick={()=>void readAll()}>全部已读</button></div><div className="max-h-96 overflow-auto">{items.length?items.map((item)=><Link className={`block border-b px-4 py-3 hover:bg-cyan-50 ${item.readAt?"text-slate-500":"bg-blue-50/60 text-slate-900"}`} href={item.href||"/console"} key={item.id} onClick={()=>void read(item)}><p className="text-sm font-semibold">{item.title}</p>{item.message?<p className="mt-1 text-xs">{item.message}</p>:null}<time className="mt-1 block text-[11px]">{new Date(item.createdAt).toLocaleString("zh-CN")}</time></Link>):<p className="px-4 py-8 text-center text-sm text-slate-500">暂无通知</p>}</div></div>:null}
  </div>;
}

