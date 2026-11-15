let session={authenticated:false},busy=false;
const $=id=>document.getElementById(id);
function controls(){document.querySelectorAll('[data-exchange],[data-call]').forEach(b=>{b.disabled=busy||!session.authenticated;});}
async function refresh(){const r=await fetch('/session');session=await r.json();$('session').textContent=session.authenticated?'ログイン済み / 有効期限 '+new Date(session.expires).toLocaleTimeString('ja-JP'):'未ログイン。Step 01から始めてください。';$('logout').hidden=!session.authenticated;
 $('source').textContent=session.source?JSON.stringify(session.source,null,2):'ログインすると表示されます。';for(const k of ['read','full'])$(k).textContent=session.exchanged?.[k]?JSON.stringify(session.exchanged[k],null,2):'まだ交換していません。';controls();}
function record(data){const row=document.createElement('article');row.className='event';const title=document.createElement('p');title.className='badge'+(data.http_status>=400||data.error?' denied':'');title.textContent=(data.http_status?'HTTP '+data.http_status+' — ':'')+(data.endpoint||data.error||'Lab');const pre=document.createElement('pre');pre.textContent=JSON.stringify(data,null,2);row.append(title,pre);$('history').prepend(row);}
async function post(path,value){busy=true;controls();try{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify(value)});const data=await r.json();record(data);if(data.response?.document){const d=data.response.document;$('document').textContent=`${d.id} / revision ${d.revision}\n${d.text}`;}await refresh();}catch{record({error:'接続できませんでした。サービスの状態を確認してください。'});}finally{busy=false;controls();}}
document.querySelectorAll('[data-exchange]').forEach(b=>b.onclick=()=>post('/exchange',{mode:b.dataset.exchange}));
document.querySelectorAll('[data-call]').forEach(b=>b.onclick=()=>post('/call',{using:$('using').value,method:b.dataset.call,text:$('text').value}));
$('logout').onclick=()=>post('/logout',{});
refresh().catch(()=>record({error:'ログイン状態を取得できませんでした。'}));
