import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
mkdirSync('.secrets',{recursive:true});
if(existsSync('.secrets/realm.json')){console.log('Existing realm retained.');process.exit(0);}
const secret=randomBytes(32).toString('base64url'),password=randomBytes(18).toString('base64url');
const issuer='http://localhost:19361/realms/exchange-lab';
const subject={name:'Subject',protocol:'openid-connect',protocolMapper:'oidc-sub-mapper',config:{'access.token.claim':'true'}};
const aud=id=>({name:'aud-'+id,protocol:'openid-connect',protocolMapper:'oidc-audience-mapper',config:{'included.client.audience':id,'access.token.claim':'true','id.token.claim':'false'}});
const may={name:'may_act',protocol:'openid-connect',protocolMapper:'oidc-hardcoded-claim-mapper',config:{'claim.name':'may_act','claim.value':JSON.stringify({sub:'lab-agent-id',client_id:'lab-agent',iss:issuer}),'jsonType.label':'JSON','access.token.claim':'true','id.token.claim':'false'}};
const identity=(name,mappers)=>({name,protocol:'openid-connect',attributes:{'include.in.token.scope':'false','display.on.consent.screen':'false'},protocolMappers:mappers});
const scopes=['document.read','document.write'];
const realm={realm:'exchange-lab',enabled:true,sslRequired:'none',registrationAllowed:false,accessTokenLifespan:300,
 clientScopes:[...scopes.map(name=>({name,protocol:'openid-connect',attributes:{'include.in.token.scope':'true','display.on.consent.screen':'true','consent.screen.text':name}})),identity('source-identity',[subject,aud('lab-agent'),may]),identity('agent-identity',[subject,aud('lab-agent'),aud('document-api')])],
 clients:[{clientId:'lab-login',name:'Token Exchange Lab — requested operations',enabled:true,protocol:'openid-connect',publicClient:true,standardFlowEnabled:true,directAccessGrantsEnabled:false,consentRequired:true,redirectUris:['http://localhost:19360/callback'],webOrigins:['http://localhost:19360'],attributes:{'pkce.code.challenge.method':'S256'},defaultClientScopes:['source-identity'],optionalClientScopes:scopes},
 {clientId:'lab-agent',enabled:true,protocol:'openid-connect',publicClient:false,secret,serviceAccountsEnabled:true,standardFlowEnabled:false,directAccessGrantsEnabled:false,attributes:{'standard.token.exchange.enabled':'true'},defaultClientScopes:['agent-identity'],optionalClientScopes:scopes},
 {clientId:'document-api',enabled:true,protocol:'openid-connect',bearerOnly:true}],
 users:[{id:'lab-user-id',username:'alice',enabled:true,emailVerified:true,email:'alice@example.test',firstName:'Alice',lastName:'Lab',credentials:[{type:'password',value:password,temporary:false}]},{id:'lab-agent-id',username:'service-account-lab-agent',enabled:true,serviceAccountClientId:'lab-agent'}],
 clientProfiles:{profiles:[{name:'lab-downscope',executors:[{executor:'downscope-assertion-grant-enforcer',configuration:{}}]}]},
 clientPolicies:{policies:[{name:'lab-downscope',enabled:true,conditions:[{condition:'client-access-type',configuration:{type:['confidential']}}],profiles:['lab-downscope']}]}};
for(const [file,value] of [['config.json',{secret}],['login.json',{username:'alice',password}],['realm.json',realm]])writeFileSync('.secrets/'+file,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
console.log('Generated .secrets/realm.json, config.json and login.json. No secrets printed.');
