import {createPublicKey,verify} from 'node:crypto';
export const issuer='http://localhost:19361/realms/exchange-lab';
export const internal=process.env.IDP_INTERNAL||'http://localhost:19361/realms/exchange-lab';
let keys=[],loaded=0;
export async function verified(token,audience){
 const parts=String(token).split('.');if(parts.length!==3)throw new Error('invalid_token');
 const head=JSON.parse(Buffer.from(parts[0],'base64url'));
 if(head.alg!=='RS256'||typeof head.kid!=='string')throw new Error('invalid_token');
 if(Date.now()-loaded>300000||!keys.some(k=>k.kid===head.kid)){
  const r=await fetch(internal+'/protocol/openid-connect/certs',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('jwks_unavailable');keys=(await r.json()).keys;loaded=Date.now();
 }
 const key=keys.find(k=>k.kid===head.kid&&k.kty==='RSA'&&k.use==='sig');
 if(!key||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error('invalid_signature');
 const c=JSON.parse(Buffer.from(parts[1],'base64url')),now=Date.now()/1000;
 if(c.iss!==issuer||!c.sub||!Number.isFinite(c.exp)||c.exp<=now||!Number.isFinite(c.iat)||c.iat>now+30||c.nbf>now)throw new Error('invalid_claims');
 if(!(Array.isArray(c.aud)?c.aud:[c.aud]).includes(audience))throw new Error('wrong_audience');
 return c;
}
export function view(c){return Object.fromEntries(['iss','sub','aud','azp','scope','may_act','act','iat','exp'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));}
export function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
export async function body(req){let s='';for await(const c of req){s+=c;if(s.length>8192)throw new Error('body_too_large');}return JSON.parse(s||'{}');}
export async function token(data){const r=await fetch(internal+'/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams(data),signal:AbortSignal.timeout(10000)});return {status:r.status,data:await r.json()};}
