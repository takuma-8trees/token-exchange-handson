import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verified,issuer} from '../src/common.mjs';

test('JWT verification rejects tampering, expiry, issuer and audience mismatch',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'test',use:'sig'};
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({keys:[jwk]})});
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const claims={iss:issuer,sub:'test-user',aud:'document-api',iat:now,exp:now+60};
 const jwt=c=>{const s=enc({alg:'RS256',kid:'test'})+'.'+enc(c);return s+'.'+sign('RSA-SHA256',Buffer.from(s),privateKey).toString('base64url');};
 try{
  assert.equal((await verified(jwt(claims),'document-api')).sub,'test-user');
  await assert.rejects(verified(jwt({...claims,exp:now-1}),'document-api'),/invalid_claims/);
  await assert.rejects(verified(jwt({...claims,iss:'https://other.example'}),'document-api'),/invalid_claims/);
  await assert.rejects(verified(jwt(claims),'other-api'),/wrong_audience/);
  const parts=jwt(claims).split('.');parts[1]=enc({...claims,sub:'attacker'});
  await assert.rejects(verified(parts.join('.'),'document-api'),/invalid_signature/);
 }finally{globalThis.fetch=original;}
});
