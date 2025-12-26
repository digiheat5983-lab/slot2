async function api(path, opts={}){
  const res = await fetch(path, Object.assign({credentials:'same-origin',headers:{'Content-Type':'application/json'}}, opts));
  return res.json();
}

const el = id=>document.getElementById(id);
const meBox = el('me');
const authDiv = el('auth');
const casinoDiv = el('casino');
const balanceEl = el('balance');
const gridEl = el('grid');
const msgEl = el('msg');

async function showMe(){
  const r = await api('/api/me');
  if (r && !r.error){
    authDiv.classList.add('hidden'); casinoDiv.classList.remove('hidden');
    balanceEl.textContent = 'Balance: ' + (r.balance.toFixed? r.balance.toFixed(2): r.balance);
  } else {
    authDiv.classList.remove('hidden'); casinoDiv.classList.add('hidden');
  }
}

el('btnRegister').onclick = async ()=>{
  const email = el('email').value; const password = el('password').value;
  const r = await api('/api/register',{method:'POST',body:JSON.stringify({email,password})});
  if (r.error) msgEl.textContent = r.error; else { msgEl.textContent = 'Registered'; showMe(); }
};

el('btnLogin').onclick = async ()=>{
  const email = el('email').value; const password = el('password').value;
  const r = await api('/api/login',{method:'POST',body:JSON.stringify({email,password})});
  if (r.error) msgEl.textContent = r.error; else { msgEl.textContent = 'Logged in'; showMe(); }
};

el('btnLogout').onclick = async ()=>{ await api('/api/logout',{method:'POST'}); showMe(); };

document.querySelectorAll('.gamebtn').forEach(b=>b.onclick=()=>{ msgEl.textContent = 'Selected '+b.dataset.game; });

el('spin').onclick = async ()=>{
  const bet = Number(el('bet').value||0);
  if (bet<=0){ msgEl.textContent='Invalid bet'; return; }
  const r = await api('/api/spin',{method:'POST',body:JSON.stringify({bet})});
  if (r.error){ msgEl.textContent = r.error; return; }
  // render grid
  gridEl.innerHTML='';
  r.grid.forEach((row)=>{ row.forEach(cell=>{ const d=document.createElement('div'); d.className='cell'; d.textContent=cell; gridEl.appendChild(d); }); });
  balanceEl.textContent = 'Balance: ' + (r.balance.toFixed? r.balance.toFixed(2): r.balance);
  msgEl.textContent = r.wins.length? ('Win: '+r.payout.toFixed(2)) : 'No win';
};

showMe().catch(()=>{});
