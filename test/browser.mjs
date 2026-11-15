import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
const mapped=url=>process.env.IN_DOCKER==='1'?url.replace('http://localhost:19360','http://web:3000').replace('http://localhost:19361','http://keycloak:8080'):url;
export class Browser {
  jars=new Map();
  cookie(url){return [...(this.jars.get(new URL(url).host)||new Map())].map(([k,v])=>k+'='+v).join('; ');}
  async request(url,options={}) {
    const host=new URL(url).host;
    const response=await new Promise((resolve,reject)=>{
      const body=options.body?.toString();
      const request=httpRequest(mapped(url),{method:options.method||'GET',headers:{Host:host,Cookie:this.cookie(url),...options.headers,...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},incoming=>{
        const chunks=[];incoming.on('data',chunk=>chunks.push(chunk));incoming.on('end',()=>{
          const headers=new Headers();for(let i=0;i<incoming.rawHeaders.length;i+=2)headers.append(incoming.rawHeaders[i],incoming.rawHeaders[i+1]);
          resolve(new Response(Buffer.concat(chunks),{status:incoming.statusCode,headers}));
        });
      });request.setTimeout(15000,()=>request.destroy(new Error('HTTP timeout')));request.on('error',reject);request.end(body);
    });
    const jar=this.jars.get(host)||new Map();this.jars.set(host,jar);
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    return response;
  }
  async follow(url,stopCallback=false){
    for(let i=0;i<12;i++){
      if(stopCallback&&url.startsWith('http://localhost:19360/callback')) return url;
      const r=await this.request(url);
      if(r.status>=300&&r.status<400){url=new URL(r.headers.get('location'),url).href;continue;}
      const html=await r.clone().text();
      if(html.includes('name="accept"')){
        const rawAction=html.match(/<form[^>]+action="([^"]+)"/i)?.[1]?.replaceAll('&amp;','&');
        assert.ok(rawAction,'Consent form missing');
        const action=new URL(rawAction,url).href;
        const body=new URLSearchParams({accept:'Yes'});
        for(const input of html.matchAll(/<input\b[^>]*>/gi)){
          const name=input[0].match(/name="([^"]+)"/)?.[1],value=input[0].match(/value="([^"]*)"/)?.[1];
          if(input[0].includes('type="hidden"')&&name)body.set(name,(value||'').replaceAll('&amp;','&'));
        }
        const consent=await this.request(action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
        assert.equal(consent.status,302,'Consent failed');url=new URL(consent.headers.get('location'),action).href;continue;
      }
      return {response:r,url};
    }throw new Error('Redirect limit');
  }
  async signIn(url,user,stopCallback=false){
    const page=await this.follow(url); const html=await page.response.text();
    const action=html.match(/<form[^>]+action="([^"]+)"/i)?.[1]?.replaceAll('&amp;','&');
    assert.ok(action,'Keycloak login form missing');
    const result=await this.request(action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:user.username,password:user.password,credentialId:''})});
    assert.equal(result.status,302,'Keycloak sign-in failed');
    return this.follow(new URL(result.headers.get('location'),action).href,stopCallback);
  }
}
