// Gemeinsame Testhilfen: echte Laufzeit laden und Widget-Nachrichten lesen (GhostWriter #642).
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function loadGW(){
  const ctx={window:{},document:{getElementById:()=>null,querySelectorAll:()=>[]},sendPrompt:()=>{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/gw.js'),'utf8'),ctx);
  return ctx.window.GW;
}
// Liest eine Nachricht im Format von GW.message (Kennzeile, danach `feld: wert`-Zeilen) und das alte JSON-Format.
function parseMessage(text){
  const block=text.match(/```gw\n([\s\S]*?)\n```$/);
  if(block)return JSON.parse(block[1]);
  const lines=text.split('\n');
  const at=lines.findIndex(l=>/^`gw:[^\s`]+[^`]*`$/.test(l));
  if(at<0)throw new Error('Missing structured action');
  const head=lines[at].slice(1,-1).slice(3).split(/\s+/);
  const out={action:head[0]};
  const conv=v=>v==='true'?true:v==='false'?false:/^-?\d+(\.\d+)?$/.test(v)?Number(v):v;
  head.slice(1).filter(Boolean).forEach(t=>{const i=t.indexOf('=');out[t.slice(0,i)]=conv(t.slice(i+1));});
  const unmask=s=>s.replace(/\\([\\`])/g,'$1');
  let key=null,json=false,buf=[];
  const flush=()=>{if(key!==null){const v=buf.join('\n');out[key]=json?JSON.parse(unmask(v)):unmask(v);}key=null;buf=[];};
  lines.slice(at+1).forEach(l=>{
    const m=l.match(/^([A-Za-z0-9_.-]+)( \(JSON\))?:(?: (.*))?$/);
    if(m&&!l.startsWith('  ')){flush();key=m[1];json=!!m[2];buf=[m[3]||''];}
    else if(key!==null&&l.startsWith('  '))buf.push(l.slice(2));
  });
  flush();
  return out;
}
module.exports={loadGW,parseMessage};
