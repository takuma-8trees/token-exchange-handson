import {createServer} from 'node:http';
import {verified,json,body,issuer} from './common.mjs';
let document={id:'memo-1',text:'交換前のメモ',revision:0};
createServer(async(req,res)=>{
 if(req.url==='/health'){json(res,200,{status:'ok'});return;}
 if(req.url!=='/document'||!['GET','PUT'].includes(req.method)){json(res,404,{error:'not_found'});return;}
 let c;
 try{c=await verified((req.headers.authorization||'').replace(/^Bearer /,''),'document-api');if(c.typ!=='Bearer')throw new Error('invalid_token');}
 catch(e){json(res,401,{error:'invalid_token',reason:e.message});return;}
 if(c.azp!=='lab-agent'||c.sub!=='lab-user-id'||c.act?.sub!=='lab-agent-id'||c.act?.client_id!=='lab-agent'||c.act?.iss!==issuer||c.act?.act){json(res,403,{error:'delegation_required'});return;}
 const required=req.method==='GET'?'document.read':'document.write';
 if(!String(c.scope||'').split(' ').includes(required)){json(res,403,{error:'insufficient_scope',required,unchanged:true});return;}
 if(req.method==='PUT'){
  try{const b=await body(req);if(typeof b.text!=='string'||!b.text.trim()||b.text.length>200)throw new Error();document={...document,text:b.text,revision:document.revision+1};}
  catch{json(res,400,{error:'invalid_document'});return;}
 }
 json(res,200,{document:{...document},identity:{subject:c.sub,actor:c.act.sub},required});
}).listen(3001,'0.0.0.0');
