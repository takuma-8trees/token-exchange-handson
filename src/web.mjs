import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {issuer,verified,view,json,body,token} from './common.mjs';
const {secret}=JSON.parse(readFileSync(process.env.CONFIG_FILE||'/run/secrets/config.json','utf8'));
const origin='http://localhost:19360',callback=origin+'/callback',api=process.env.API_INTERNAL||'http://localhost:19362';
const sessions=new Map(),pending=new Map(),random=()=>randomBytes(32).toString('base64url');
const cookie=(req,name)=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const setCookie=(name,value,ttl=300)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}`;
const files={'/':['text/html','index.html'],'/app.js':['text/javascript','app.js'],'/style.css':['text/css','style.css']};
setInterval(()=>{for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id);for(const [id,p] of pending)if(p.expires<Date.now())pending.delete(id);},30000).unref();
createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 if(!['localhost:19360','web:3000'].includes(req.headers.host)){json(res,403,{error:'invalid_host'});return;}
 const url=new URL(req.url,origin),sid=cookie(req,'lab_sid');let s=sessions.get(sid);
 if(s&&s.expires<=Date.now()){sessions.delete(sid);s=undefined;}
 const redirect=target=>{res.writeHead(302,{Location:target});res.end();};
 try{
  if(url.pathname==='/health'){json(res,200,{status:'ok'});return;}
  if(url.pathname==='/login'&&req.method==='GET'){
   if(pending.size>100){json(res,429,{error:'too_many_flows'});return;}
   const flow={state:random(),nonce:random(),verifier:random(),expires:Date.now()+300000},id=random();pending.set(id,flow);
   const q=new URLSearchParams({client_id:'lab-login',redirect_uri:callback,response_type:'code',scope:'openid document.read document.write',prompt:'consent',state:flow.state,nonce:flow.nonce,code_challenge:createHash('sha256').update(flow.verifier).digest('base64url'),code_challenge_method:'S256'});
   res.setHeader('Set-Cookie',setCookie('lab_flow',id));redirect(issuer+'/protocol/openid-connect/auth?'+q);return;
  }
  if(url.pathname==='/callback'&&req.method==='GET'){
   const id=cookie(req,'lab_flow'),p=pending.get(id);pending.delete(id);res.setHeader('Set-Cookie',setCookie('lab_flow','',0));
   if(!p||p.expires<Date.now()||p.state!==url.searchParams.get('state')||!url.searchParams.get('code')){json(res,400,{error:'invalid_callback'});return;}
   const r=await token({grant_type:'authorization_code',client_id:'lab-login',redirect_uri:callback,code:url.searchParams.get('code'),code_verifier:p.verifier});
   if(r.status!==200){json(res,400,{error:'login_failed'});return;}
   const identity=await verified(r.data.id_token,'lab-login'),claims=await verified(r.data.access_token,'lab-agent');
   if(identity.nonce!==p.nonce||identity.sub!==claims.sub||claims.azp!=='lab-login'||claims.typ!=='Bearer')throw new Error('invalid_login');
   if(sid)sessions.delete(sid);const next=random();
   sessions.set(next,{source:r.data.access_token,sourceClaims:claims,csrf:random(),expires:Math.min(claims.exp*1000,Date.now()+300000),tokens:{}});
   res.setHeader('Set-Cookie',[setCookie('lab_flow','',0),setCookie('lab_sid',next)]);redirect('/');return;
  }
  if(url.pathname==='/session'&&req.method==='GET'){
   json(res,200,s?{authenticated:true,csrf:s.csrf,expires:s.expires,source:view(s.sourceClaims),exchanged:Object.fromEntries(Object.entries(s.tokens).map(([k,v])=>[k,view(v.claims)]))}:{authenticated:false});return;
  }
  if(req.method==='POST'){
   if(!s){json(res,401,{error:'login_required'});return;}
   if(req.headers.origin!==origin||req.headers['x-csrf-token']!==s.csrf){json(res,403,{error:'csrf_failed'});return;}
   const b=await body(req);
   if(url.pathname==='/logout'){sessions.delete(sid);res.setHeader('Set-Cookie',setCookie('lab_sid','',0));json(res,200,{ok:true});return;}
   if(url.pathname==='/exchange'){
    const mode=b.mode;if(!['read','full','escalate'].includes(mode)){json(res,400,{error:'invalid_mode'});return;}
    if(mode==='escalate'&&!s.tokens.read){json(res,400,{error:'read_token_required'});return;}
    // Every request goes to Keycloak; no simulated denial in the UI/server.
    const acting=await token({grant_type:'client_credentials',client_id:'lab-agent',client_secret:secret});
    if(acting.status!==200)throw new Error('actor_auth_failed');
    const scope=mode==='read'?'document.read':'document.read document.write';
    const params={grant_type:'urn:ietf:params:oauth:grant-type:token-exchange',client_id:'lab-agent',client_secret:secret,subject_token:mode==='escalate'?s.tokens.read.token:s.source,subject_token_type:'urn:ietf:params:oauth:token-type:access_token',actor_token:acting.data.access_token,actor_token_type:'urn:ietf:params:oauth:token-type:access_token',requested_token_type:'urn:ietf:params:oauth:token-type:access_token',audience:'document-api',scope};
    // Escalation is attempted as ordinary exchange of our previously issued read token.
    // This isolates downscoping from restrictions on nested actor chains.
    if(mode==='escalate'){delete params.actor_token;delete params.actor_token_type;}
    const r=await token(params);
    let claims;if(r.status===200){claims=await verified(r.data.access_token,'document-api');if(mode!=='escalate'){
     if(claims.sub!==s.sourceClaims.sub||claims.act?.sub!=='lab-agent-id'||claims.act?.client_id!=='lab-agent'||claims.act?.iss!==issuer||claims.azp!=='lab-agent')throw new Error('invalid_delegation');
     s.tokens[mode]={token:r.data.access_token,claims};
    }}
    json(res,200,{endpoint:'Keycloak /token',http_status:r.status,request:{grant_type:params.grant_type,subject_token:mode==='escalate'?'read-only token':'source token',actor_token:mode==='escalate'?'omitted':'service account token',audience:params.audience,scope},response:r.status===200?{token_type:r.data.token_type,issued_token_type:r.data.issued_token_type,expires_in:r.data.expires_in,scope:r.data.scope,claims:view(claims)}:{error:r.data.error,error_description:r.data.error_description}});return;
   }
   if(url.pathname==='/call'){
    if(!['source','read','full'].includes(b.using)||!['GET','PUT'].includes(b.method)){json(res,400,{error:'invalid_call'});return;}
    const access=b.using==='source'?s.source:s.tokens[b.using]?.token;
    if(!access){json(res,400,{error:'exchange_first'});return;}
    const r=await fetch(api+'/document',{method:b.method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:b.method==='PUT'?JSON.stringify({text:b.text}):undefined,signal:AbortSignal.timeout(5000)});
    json(res,200,{endpoint:'Document API /document',http_status:r.status,using:b.using,method:b.method,response:await r.json()});return;
   }
  }
  const file=files[url.pathname];if(req.method==='GET'&&file){res.writeHead(200,{'Content-Type':file[0]+'; charset=utf-8'});res.end(readFileSync(new URL('../public/'+file[1],import.meta.url)));return;}
  json(res,404,{error:'not_found'});
 }catch{json(res,502,{error:'upstream_or_validation_failed',message:'サービスの起動状態とトークン期限を確認し、ログインからやり直してください。'});}
}).listen(3000,'0.0.0.0');
