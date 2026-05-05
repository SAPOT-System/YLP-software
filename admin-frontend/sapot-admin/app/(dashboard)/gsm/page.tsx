"use client"
import { getToken } from "@/lib/ws/Websocketmanager";
import { useEffect } from "react";

export default function Gsm() {
  useEffect(()=>{
    (async()=>{
      const token = await getToken();
      console.log(token);
    })()
  })
  return (
		<p>Hi world, from gsm</p>
  );
}
