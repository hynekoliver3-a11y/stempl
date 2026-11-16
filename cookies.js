"use strict";
document.getElementById("clear").addEventListener("click",async function(){
  try{ Object.keys(localStorage).filter(function(k){return k.indexOf("stempl.")===0}).forEach(function(k){localStorage.removeItem(k)}); }catch(e){}
  try{ if(window.caches){ var ks=await caches.keys(); await Promise.all(ks.map(function(k){return caches.delete(k)})); } }catch(e){}
  try{ if(navigator.serviceWorker){ var rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(function(r){return r.unregister()})); } }catch(e){}
  document.getElementById("out").textContent="Hotovo, data Štemplu v tomto prohlížeči jsou smazaná.";
});
