/* Tournoi des Rois — application multi-tournois (système suisse + phase finale).
   Script classique, un seul fichier : fonctionne en ouverture directe (file://) comme
   sur GitHub Pages (pas de module ES, donc pas de serveur requis).

   Organisation :
     UTILS   — helpers purs
     STORE   — bibliothèque de tournois (localStorage), migration, export/import
     ENGINE  — logique métier inchangée (suisse, planning, arbitrage, seeding, classement)
     RENDER  — fabrique de HTML réutilisée (carte de ronde, tableau, finale, projection)
     VIEWS   — écrans : accueil, création, espace tournoi (pages par étape), présentation
     ROUTER  — routage par location.hash + reprise de l'état
     BOOTSTRAP

   Persistance : index "tdr_index_v1" + un tournoi par clé "tdr_t_<id>".
   Les algorithmes et les clés de match stables (r{r}m{p}, F{P|C}-{r}-{m}) sont conservés. */
(function(){
  "use strict";

  // ============================================================= UTILS
  const MINT=4, MAXT=24;
  const clampEven=(n,lo,hi)=>{n=Math.round((n||0)/2)*2;return Math.max(lo,Math.min(hi,n));};
  const key=(i,j)=>i<j?i+"-"+j:j+"-"+i;
  const fmtTime=min=>Math.floor(min/60)+"h"+String(min%60).padStart(2,"0");
  const hhmm=min=>String(Math.floor(min/60)).padStart(2,"0")+":"+String(min%60).padStart(2,"0");
  const parseHHMM=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(s||"");return m?(+m[1])*60+(+m[2]):null;};
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const $=(sel,root)=>(root||document).querySelector(sel);
  const $$=(sel,root)=>Array.from((root||document).querySelectorAll(sel));
  const elFrom=html=>{const t=document.createElement("template");t.innerHTML=String(html).trim();return t.content.firstElementChild;};
  const genId=()=>{ try{ if(crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(e){} return "t"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); };
  const slug=s=>String(s||"tournoi").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,40)||"tournoi";
  const fmtDate=ts=>{ try{ return new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}); }catch(e){ return ""; } };
  const ymd=ts=>{ const d=new Date(ts); const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate()); };

  // ============================================================= STORE
  const IKEY="tdr_index_v1";          // index de la bibliothèque
  const TKEY=id=>"tdr_t_"+id;         // un tournoi
  const LEGACY="tournoi_suisse_v1";   // ancienne clé mono-tournoi
  const THEMEKEY="tdr_theme";
  const defCFG={start:9*60,dur:20,rounds:8,teams:16,brk:5};
  const DEMO_TEAMS=["Les Rois Mages","Dames de Cœur","Trèfle Royal","Pique d'As","Carreau Doré","Couronne de Fer","Les Dauphins","Chevaliers du Filet","Les Monarques","Sceptre d'Or","Les Régents","Lames de Pique","Les Souverains","Aces Royaux","Les Ducs","Valets de Carreau"];

  let idx=loadIndex();   // { ids:[], activeId, lastRoute, migrated }
  let S=null;            // données du tournoi actif (teams, courts, cfg, order0, rounds, sc, fsc)
  let ACTIVE=null;       // { id, name, createdAt }

  function loadIndex(){
    try{ const s=JSON.parse(localStorage.getItem(IKEY)); if(s&&Array.isArray(s.ids))
      return {ids:s.ids.slice(),activeId:s.activeId||null,lastRoute:s.lastRoute||null,migrated:!!s.migrated}; }catch(e){}
    return {ids:[],activeId:null,lastRoute:null,migrated:false};
  }
  const saveIndex=()=>{ try{ localStorage.setItem(IKEY,JSON.stringify(idx)); }catch(e){} };

  // normalise/borne un bloc "data" (reprend les garde-fous de l'ancien loader)
  function normalizeData(d){
    d=d||{};
    const data={teams:[],courts:3,cfg:Object.assign({},defCFG),rounds:[],sc:{},order0:null,fsc:{}};
    if(Array.isArray(d.teams)) data.teams=d.teams.map(x=>x==null?"":String(x));
    data.courts=(d.courts>=1&&d.courts<=5)?d.courts:3;
    data.cfg=Object.assign({},defCFG,d.cfg||{});
    data.rounds=Array.isArray(d.rounds)?d.rounds:[];
    data.sc=(d.sc&&typeof d.sc==="object")?d.sc:{};
    data.order0=Array.isArray(d.order0)?d.order0:null;
    data.fsc=(d.fsc&&typeof d.fsc==="object")?d.fsc:{};
    data.cfg.teams=clampEven(data.cfg.teams||16,MINT,MAXT);
    const n=data.cfg.teams, t=data.teams.slice(0,n); while(t.length<n)t.push(""); data.teams=t;
    const maxR=Math.max(1,n-1);
    if(!(data.cfg.rounds>=1&&data.cfg.rounds<=maxR)) data.cfg.rounds=Math.min(8,maxR);
    return data;
  }

  const readTournament=id=>{ try{ const s=JSON.parse(localStorage.getItem(TKEY(id))); if(s&&s.id) return s; }catch(e){} return null; };
  const writeTournament=t=>{ try{ localStorage.setItem(TKEY(t.id),JSON.stringify(t)); }catch(e){} };
  const listTournaments=()=>idx.ids.map(readTournament).filter(Boolean);

  function createTournament(p){
    p=p||{}; const id=genId(), now=Date.now();
    const t={id,name:(String(p.name||"").trim()||"Tournoi"),createdAt:now,updatedAt:now,data:normalizeData(p.data)};
    writeTournament(t);
    idx.ids=idx.ids.filter(x=>x!==id); idx.ids.unshift(id); idx.activeId=id; saveIndex();
    return t;
  }
  function deleteTournament(id){
    try{ localStorage.removeItem(TKEY(id)); }catch(e){}
    idx.ids=idx.ids.filter(x=>x!==id); if(idx.activeId===id) idx.activeId=null; saveIndex();
  }
  function duplicateTournament(id){ const t=readTournament(id); return t?createTournament({name:t.name+" (copie)",data:t.data}):null; }

  function setActive(id){
    const t=readTournament(id); if(!t) return false;
    ACTIVE={id:t.id,name:t.name,createdAt:t.createdAt}; S=t.data; idx.activeId=id; saveIndex(); return true;
  }
  // persiste le tournoi actif (appelé par le moteur et les handlers de saisie)
  function save(){
    if(!ACTIVE||!S) return;
    writeTournament({id:ACTIVE.id,name:ACTIVE.name,createdAt:ACTIVE.createdAt,updatedAt:Date.now(),data:S});
    if(idx.ids.indexOf(ACTIVE.id)<0) idx.ids.unshift(ACTIVE.id);
    idx.activeId=ACTIVE.id; saveIndex();
  }
  const renameActive=name=>{ if(ACTIVE){ ACTIVE.name=String(name||"").trim()||"Tournoi"; save(); } };

  // exécute fn avec S pointant temporairement sur "data" (résumés d'accueil sans toucher l'actif)
  function withData(data,fn){ const ps=S,pa=ACTIVE; S=data; try{ return fn(); } finally{ S=ps; ACTIVE=pa; } }

  function migrateLegacy(){
    if(idx.migrated) return; idx.migrated=true;
    try{ const s=JSON.parse(localStorage.getItem(LEGACY)); if(s&&(Array.isArray(s.teams)||s.cfg)){ createTournament({name:"Mon tournoi",data:s}); } }catch(e){}
    saveIndex();
  }

  // -------- export / import --------
  function exportTournament(id){
    const t=readTournament(id); if(!t) return;
    const payload={app:"tournoi-des-rois",schema:1,exportedAt:new Date().toISOString(),tournament:{name:t.name,createdAt:t.createdAt,data:t.data}};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url; a.download="tournoi-"+slug(t.name)+"-"+ymd(Date.now())+".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function importFromText(text){
    let obj; try{ obj=JSON.parse(text); }catch(e){ throw new Error("Fichier illisible (JSON invalide)."); }
    const tr=obj&&obj.tournament; const data=tr&&tr.data;
    if(!tr||!data||!Array.isArray(data.teams)||typeof data.cfg!=="object") throw new Error("Ce fichier n'est pas un export de tournoi valide.");
    return createTournament({name:(tr.name||"Tournoi importé"),data:data});
  }

  // ============================================================= ENGINE (inchangé)
  const RD=()=>S.cfg.rounds;
  const NT=()=>S.teams.length;                                  // nombre d'équipes (pair)
  const Mpr=()=>Math.floor(NT()/2);                             // matchs par ronde
  const maxRounds=()=>Math.max(1,NT()-1);                       // adversaires distincts possibles
  const effCourts=()=>Math.max(1,Math.min(S.courts,Math.floor(NT()/3),Mpr())); // terrains utilisables (assez d'arbitres libres)
  const activeRounds=()=>S.rounds.slice(0,RD());
  const tn=i=>{const v=S.teams[i];return v&&String(v).trim()?String(v).trim():"Équipe "+(i+1);};
  const nm=i=>esc(tn(i));                                       // nom échappé (id interne non affiché)

  const scOf=id=>S.sc[id];
  const decided=sc=>{ if(!sc)return false; if(sc.a===""||sc.a==null||sc.b===""||sc.b==null)return false; const a=+sc.a,b=+sc.b; return !isNaN(a)&&!isNaN(b)&&a!==b; };
  function standings(){
    const st=Array.from({length:NT()},(_,i)=>({i,v:0,pf:0,pa:0,j:0}));
    activeRounds().forEach((pairs,r)=>pairs.forEach((pair,p)=>{
      const sc=scOf("r"+r+"m"+p); if(!sc)return;
      if(sc.a===""||sc.b===""||sc.a==null||sc.b==null)return;
      const a=+sc.a,b=+sc.b; if(isNaN(a)||isNaN(b))return;
      const [x,y]=pair; st[x].pf+=a;st[x].pa+=b;st[x].j++; st[y].pf+=b;st[y].pa+=a;st[y].j++;
      if(a>b)st[x].v++; else if(b>a)st[y].v++;
    }));
    return st;
  }
  const cmp=(x,y)=> y.v-x.v || (y.pf-y.pa)-(x.pf-x.pa) || y.pf-x.pf || x.i-y.i;
  const standingOrder=()=>standings().sort(cmp).map(o=>o.i);
  const roundComplete=r=>{const pairs=S.rounds[r]; return !!pairs && pairs.every((_,p)=>decided(scOf("r"+r+"m"+p)));};
  const hasScore=sc=>sc&&((sc.a!=null&&sc.a!=="")||(sc.b!=null&&sc.b!==""));
  const started=r=>{const pairs=S.rounds[r]; return !!pairs && pairs.some((_,p)=>hasScore(scOf("r"+r+"m"+p)));}; // ronde commencée = verrouillée
  const firm=r=>{ for(let k=0;k<r;k++) if(!roundComplete(k)) return false; return true; };          // appariement définitif

  // recherche exhaustive d'un appariement sans réédition, bornée (undefined = délai dépassé)
  function pairNoRematch(order, played){
    let steps=0; const LIMIT=200000;
    function rec(list){
      if(++steps>LIMIT) return undefined;
      if(list.length===0) return [];
      const first=list[0], rest=list.slice(1);
      for(let k=0;k<rest.length;k++){
        const opp=rest[k];
        if(played.has(key(first,opp))) continue;
        const sub=rec(rest.slice(0,k).concat(rest.slice(k+1)));
        if(sub===undefined) return undefined;
        if(sub!==null) return [[first,opp],...sub];
      }
      return null;
    }
    return rec(order);
  }
  // repli garanti : apparie au plus proche disponible, en acceptant une revanche seulement si nécessaire
  function pairGreedy(order, played){
    const used=new Array(order.length).fill(false), pairs=[];
    for(let a=0;a<order.length;a++){ if(used[a])continue; used[a]=true;
      let pick=-1;
      for(let b=a+1;b<order.length;b++){ if(!used[b]&&!played.has(key(order[a],order[b]))){pick=b;break;} }
      if(pick<0) for(let b=a+1;b<order.length;b++){ if(!used[b]){pick=b;break;} }
      used[pick]=true; pairs.push([order[a],order[pick]]);
    }
    return pairs;
  }
  const makePairs=(order,played)=>{ const r=pairNoRematch(order,played); return (r===null||r===undefined)?pairGreedy(order,played):r; };
  const playedSet=()=>{ const s=new Set(); S.rounds.forEach(pairs=>pairs.forEach(([a,b])=>s.add(key(a,b)))); return s; };
  // Recalcul live : rondes commencées figées ; rondes suivantes réapariées selon le classement courant.
  function ensureRounds(){
    if(!S.order0 || S.order0.length!==NT()){
      const order=Array.from({length:NT()},(_,i)=>i);
      for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      S.order0=order;
    }
    let locked=0; for(let r=0;r<S.rounds.length;r++){ if(started(r)) locked=r+1; else break; }
    S.rounds=S.rounds.slice(0,locked);
    while(S.rounds.length<RD()){
      const r=S.rounds.length;
      if(r===0){ S.rounds.push(makePairs(S.order0,new Set())); continue; }
      if(!roundComplete(r-1)) break;                          // la ronde suivante n'est calculée qu'une fois la courante terminée
      S.rounds.push(makePairs(standingOrder(), playedSet()));
    }
    save();
  }
  function schedules(){
    const courts=effCourts(), spr=Math.ceil(Mpr()/courts), nt=NT(), refCount=new Array(nt).fill(0);
    return activeRounds().map((pairs,r)=>{
      const round=pairs.map((pair,p)=>({a:pair[0],b:pair[1],idx:p,court:p%courts,slot:Math.floor(p/courts),
        time:S.cfg.start + r*(spr*S.cfg.dur + S.cfg.brk) + Math.floor(p/courts)*S.cfg.dur, id:"r"+r+"m"+p, ref:-1}));
      for(let s=0;s<spr;s++){
        const slotMs=round.filter(m=>m.slot===s);
        const playing=new Set(); slotMs.forEach(m=>{playing.add(m.a);playing.add(m.b);});
        const used=new Set();
        slotMs.forEach(m=>{ let best=-1,bc=Infinity;
          for(let t=0;t<nt;t++){ if(playing.has(t)||used.has(t))continue; if(refCount[t]<bc){bc=refCount[t];best=t;} }
          if(best>=0){used.add(best);refCount[best]++;m.ref=best;} });
      }
      return round;
    });
  }
  // --- phase finale ---
  const nextPow2=n=>{let p=1;while(p<n)p*=2;return p;};
  function bracketSeeding(n){let s=[1];while(s.length<n){const len=s.length*2,nx=[];for(const x of s){nx.push(x);nx.push(len+1-x);}s=nx;}return s;}
  const fid=(B,r,i)=>"F"+B+"-"+r+"-"+i;
  function bracket(B,seeds){
    const M=seeds.length, P=nextPow2(M), slots=bracketSeeding(P), nR=Math.max(1,Math.round(Math.log2(P)));
    const teamOfSeed=s=>s<=M?seeds[s-1]:"bye";
    const cache={};
    function win(r,i){ const ck=r+"-"+i; if(ck in cache)return cache[ck];
      let a,b; if(r===0){a=teamOfSeed(slots[2*i]);b=teamOfSeed(slots[2*i+1]);} else {a=win(r-1,2*i);b=win(r-1,2*i+1);}
      let w; if(a==="bye"&&b==="bye")w="bye"; else if(a==="bye")w=b; else if(b==="bye")w=a;
      else if(a==="tbd"||b==="tbd")w="tbd"; else { const sc=S.fsc[fid(B,r,i)]; w=decided(sc)?(+sc.a>+sc.b?a:b):"tbd"; }
      cache[ck]=w; return w;
    }
    const feeders=(r,i)=> r===0 ? [teamOfSeed(slots[2*i]),teamOfSeed(slots[2*i+1])] : [win(r-1,2*i),win(r-1,2*i+1)];
    const champion=()=>{const w=win(nR-1,0); return (w==="tbd"||w==="bye")?null:w;};
    const label=r=>{ if(P>M&&r===0) return "Barrages"; const c=P/Math.pow(2,r+1);
      return c===1?"Finale":c===2?"Demi-finales":c===4?"Quarts de finale":c===8?"8es de finale":c===16?"16es de finale":("Tour ("+c+")"); };
    return {M,P,nR,win,feeders,champion,label};
  }

  // ============================================================= RENDER (fabrique de HTML, classes conservées)
  function matchRow(m){
    const sc=scOf(m.id)||{}, sa=sc.a!=null?sc.a:"", sb=sc.b!=null?sc.b:"";
    let wa="",wb="";
    if(sa!==""&&sb!==""&&!isNaN(+sa)&&!isNaN(+sb)){ if(+sa>+sb)wa=" w"; else if(+sb>+sa)wb=" w"; }
    return `<div class="m"><span class="mt">${fmtTime(m.time)}</span><span class="ct">Terrain ${m.court+1}</span>`
      +`<span class="t ta${wa}">${nm(m.a)}</span>`
      +`<span class="score"><input inputmode="numeric" maxlength="2" data-sc="${m.id}" data-side="a" value="${esc(sa)}" aria-label="score"> : `
      +`<input inputmode="numeric" maxlength="2" data-sc="${m.id}" data-side="b" value="${esc(sb)}" aria-label="score"></span>`
      +`<span class="t tb${wb}">${nm(m.b)}</span>`
      +(m.ref>=0?`<span class="ref">Arbitre · <b>${nm(m.ref)}</b></span>`:"")+`</div>`;
  }
  function cardInner(round,r){
    const done=roundComplete(r), start=started(r), fm=firm(r);
    const state = done?"terminée" : start?"en cours" : fm?"à venir" : "provisoire";
    const times=round.map(m=>m.time); const t0=Math.min(...times), t1=Math.max(...times)+S.cfg.dur;
    const sorted=round.slice().sort((x,y)=>x.slot-y.slot||x.court-y.court);
    return `<div class="round-h"><span class="badge">${r+1}</span><h3>Ronde ${r+1}</h3>`
      +`<span class="state">${fmtTime(t0)} – ${fmtTime(t1)}</span>`
      +`<span class="state ${done?"done":""}" data-role="st">${state}</span></div>`
      +`<div class="rbody">${sorted.map(matchRow).join("")}</div>`;
  }
  function stdTable(cls){
    const rows=standings().sort(cmp);
    let body="";
    rows.forEach((row,i)=>{
      const diff=row.pf-row.pa;
      body+=`<tr class="${i===0?(cls==="pj"?"lead":"top"):""}"><td class="pl">${i+1}</td><td class="nm">${nm(row.i)}</td>`
        +`<td class="num">${row.j}</td><td class="num">${row.v}</td><td class="num">${diff>0?"+":""}${diff}</td><td class="num">${row.pf}</td></tr>`;
    });
    const t=cls==="pj"?"pjrank":"stbl";
    return `<table class="${t}"><thead><tr><th class="l" colspan="2">Équipe</th><th class="num">J</th><th class="num">V</th><th class="num">Diff</th><th class="num">Pts</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  function renderRank(){
    const w=$("#rankwrap"); if(!w) return;
    const played=activeRounds().reduce((n,pairs,r)=>n+pairs.filter((_,p)=>decided(scOf("r"+r+"m"+p))).length,0);
    const total=RD()*Mpr();
    const sub=$("#rank-sub"); if(sub) sub.textContent=`${played} match${played>1?"s":""} joué${played>1?"s":""} sur ${total}`;
    w.innerHTML=stdTable("");
  }
  function renderFinals(){
    const host=$("#finals"); if(!host) return;
    const M=Math.floor(NT()/2);
    if(M<2){ host.innerHTML=`<div class="waitbox">Pas assez d'équipes pour une phase finale.</div>`; return; }
    const ord=standingOrder();
    const defs=[{tag:"P",cls:"main",title:"Tableau principal",sub:`moitié haute — places 1 à ${M}`,seeds:ord.slice(0,M)},
                {tag:"C",cls:"conso",title:"Consolante",sub:`moitié basse — places ${M+1} à ${NT()}`,seeds:ord.slice(M)}];
    defs.forEach(def=>{
      let fbr=host.querySelector('.fbr[data-b="'+def.tag+'"]');
      const existing={};
      if(fbr){ fbr.querySelectorAll(".fm").forEach(n=>existing[n.dataset.fm]=n); }
      else { fbr=document.createElement("div"); fbr.className="fbr "+def.cls; fbr.dataset.b=def.tag; host.appendChild(fbr); }
      const B=bracket(def.tag,def.seeds);
      const children=[elFrom(`<h3>${def.title}</h3>`), elFrom(`<div class="sub">${def.sub}</div>`)];
      for(let r=0;r<B.nR;r++){
        const nM=B.P/Math.pow(2,r+1), rowEls=[];
        for(let i=0;i<nM;i++){
          const fe=B.feeders(r,i), a=fe[0], b=fe[1];
          if(a==="bye"||b==="bye") continue;                 // qualification d'office, non affichée
          const id=fid(def.tag,r,i), both=(a!=="tbd"&&b!=="tbd"), sc=S.fsc[id]||{};
          if(hasScore(sc) && existing[id]){ rowEls.push(existing[id]); delete existing[id]; continue; } // réutilise → focus préservé
          const w=B.win(r,i);
          const nameA = a==="tbd" ? `<span class="ft fa tbd">à déterminer</span>` : `<span class="ft fa${w===a?" w":""}">${esc(tn(a))}</span>`;
          const nameB = b==="tbd" ? `<span class="ft tbd">à déterminer</span>` : `<span class="ft${w===b?" w":""}">${esc(tn(b))}</span>`;
          const scHtml = both
            ? `<span class="fsc"><input inputmode="numeric" maxlength="2" data-fsc="${id}" data-side="a" value="${esc(sc.a!=null?sc.a:"")}" aria-label="score"> : <input inputmode="numeric" maxlength="2" data-fsc="${id}" data-side="b" value="${esc(sc.b!=null?sc.b:"")}" aria-label="score"></span>`
            : `<span class="fsc na">—</span>`;
          rowEls.push(elFrom(`<div class="fm" data-fm="${id}">${nameA}${scHtml}${nameB}</div>`));
        }
        if(rowEls.length){ children.push(elFrom(`<div class="frl">${B.label(r)}</div>`)); rowEls.forEach(e=>children.push(e)); }
      }
      const champ=B.champion();
      if(champ!=null) children.push(elFrom(`<div class="fchamp">🏆 Vainqueur · <b>${esc(tn(champ))}</b></div>`));
      fbr.replaceChildren(...children);
    });
  }
  function renderProjection(view){
    const el=$("#proj"); if(!el) return;
    if(view==="classement"){
      el.innerHTML=`<div class="pj"><div class="pjhead"><h1>${esc(ACTIVE?ACTIVE.name:"Tournoi")}</h1><span class="phase">Classement</span></div>`
        +stdTable("pj")+`</div>`;
      return;
    }
    const sch=schedules(), courts=effCourts();
    const upcoming=[];
    sch.forEach((round,r)=>round.forEach(m=>{ if(!decided(scOf(m.id))) upcoming.push(Object.assign({r},m)); }));
    upcoming.sort((x,y)=>x.time-y.time||x.r-y.r||x.idx-y.idx);
    let cols="";
    for(let c=0;c<courts;c++){
      const ms=upcoming.filter(m=>m.court===c).slice(0,4);
      let slots="";
      if(ms.length===0){ slots=`<div class="pjslot"><div class="pjmt"><span class="nm" style="color:var(--muted)">—</span></div></div>`; }
      ms.forEach((m,i)=>{
        const isNext=(i===0);
        const tag=isNext?`<span class="pjslot-tag">Suivant</span>`:`<span class="pjslot-tag">À venir</span>`;
        slots+=`<div class="pjslot ${isNext?"next":""}">`
          +`<div class="pjslot-top"><span class="pjslot-time">${fmtTime(m.time)} · R${m.r+1}</span>${tag}</div>`
          +`<div class="pjmt"><span class="nm r">${nm(m.a)}</span><span class="vs">vs</span><span class="nm">${nm(m.b)}</span></div>`
          +(m.ref>=0?`<div class="pjref">Arbitre · <b>${nm(m.ref)}</b></div>`:"")+`</div>`;
      });
      cols+=`<div class="pjcourt"><div class="pjcourt-h"><span class="trm">Terrain ${c+1}</span></div>${slots}</div>`;
    }
    el.innerHTML=`<div class="pj"><div class="pjhead"><h1>${esc(ACTIVE?ACTIVE.name:"Tournoi")}</h1><span class="phase">Prochains matchs par terrain</span></div>`
      +`<div class="pjboard" style="grid-template-columns:repeat(${courts},1fr)">${cols}</div></div>`;
  }

  // ---- résumé d'un tournoi pour l'accueil (sans toucher l'actif) ----
  function summarize(t){
    return withData(t.data,()=>{
      const n=NT(), R=RD();
      let doneRounds=0; for(let r=0;r<R;r++){ if(roundComplete(r)) doneRounds++; else break; }
      let cur=R; for(let r=0;r<R;r++){ if(!roundComplete(r)){ cur=r; break; } }
      const allDone=doneRounds>=R;
      let champ=null;
      if(allDone && Math.floor(n/2)>=2){ const B=bracket("P",standingOrder().slice(0,Math.floor(n/2))); champ=B.champion(); }
      return {teams:n, rounds:R, doneRounds, cur:Math.min(cur,R-1), allDone, champ:champ!=null?tn(champ):null};
    });
  }

  // ============================================================= VIEWS
  const app=()=>$("#app");
  let presTimer=null, presStorage=null;
  function teardown(){
    if(presTimer){ clearInterval(presTimer); presTimer=null; }
    if(presStorage){ window.removeEventListener("storage",presStorage); presStorage=null; }
    document.body.classList.remove("proj-mode");
  }

  // -------- éléments de chrome partagés (ambiance « carnet de terrain ») --------
  const BRAND_TITLE="Mon tournoi";
  function topbarHtml(){
    return `<header class="topbar"><div class="topbar-in">
      <button class="brand" id="brandhome" title="Accueil" aria-label="Aller à l'accueil">
        <span class="mark" aria-hidden="true"></span>
        <span class="t"><b>${BRAND_TITLE}</b><span>Volley · système suisse</span></span>
      </button>
      <div class="spacer"></div>
      <button class="theme-btn" id="themebtn" title="Thème clair / sombre" aria-label="Thème"><span class="ic">◐</span><span class="tb-lbl">Thème</span></button>
    </div></header>`;
  }
  const footerHtml=()=>`<footer class="pagefoot">Mon tournoi · gestion de tournoi de volley en système suisse</footer>`;
  function bindTopbar(){
    const b=$("#brandhome"); if(b) b.addEventListener("click",()=>{ location.hash="#/"; });
    const th=$("#themebtn"); if(th) th.addEventListener("click",toggleTheme);
  }
  // en-tête de page : filet d'accroche + titre + sous-titre + boutons propres à la page
  function introBlock(eyebrow, titleHtml, sub, actionsHtml){
    return `<div class="intro"><div class="intro-main">`
      +(eyebrow?`<div class="eyebrow">${eyebrow}</div>`:"")
      +titleHtml
      +(sub?`<p>${sub}</p>`:"")
      +`</div>`
      +(actionsHtml?`<div class="intro-actions">${actionsHtml}</div>`:"")
      +`</div>`;
  }
  // ouvre la présentation dans une NOUVELLE fenêtre (projection sur 2e écran)
  function openPresentation(id){
    const url=location.href.split("#")[0]+"#/t/"+id+"/presentation";
    window.open(url,"tdr_presentation_"+id);
  }

  // -------- accueil / bibliothèque --------
  function viewHome(){
    const list=listTournaments();
    let cards="";
    if(list.length===0){
      cards=`<div class="empty"><div class="empty-ic">🏐</div><h2>Aucun tournoi pour l'instant</h2>`
        +`<p>Crée ton premier tournoi ou importe un fichier d'export.</p></div>`;
    } else {
      cards=`<div class="tgrid">`+list.map(t=>{
        const s=summarize(t);
        const state = s.allDone
          ? `<span class="pill ok">Terminé${s.champ?` · 🏆 ${esc(s.champ)}`:""}</span>`
          : (s.doneRounds>0?`<span class="pill run"><i class="live"></i>Ronde ${s.cur+1} / ${s.rounds}</span>`:`<span class="pill new">À démarrer · ${s.rounds} rondes</span>`);
        return `<article class="tcard" data-id="${t.id}">
          <div class="tcard-main" data-act="open" data-id="${t.id}" role="button" tabindex="0">
            <div class="tcard-name">${esc(t.name)}</div>
            <div class="tcard-meta">${s.teams} équipes · créé le ${fmtDate(t.createdAt)}</div>
            <div class="tcard-state">${state}</div>
          </div>
          <div class="tcard-actions">
            <button class="btn sm" data-act="open" data-id="${t.id}">Ouvrir</button>
            <button class="btn sm ghost" data-act="export" data-id="${t.id}">Exporter</button>
            <button class="btn sm ghost" data-act="dup" data-id="${t.id}">Dupliquer</button>
            <button class="btn sm danger" data-act="del" data-id="${t.id}">Supprimer</button>
          </div>
        </article>`;
      }).join("")+`</div>`;
    }
    const actions=`<button class="btn ghost" id="importbtn">⬆ Importer</button>`
      +`<button class="btn primary" id="newbtn">＋ Nouveau tournoi</button>`;
    app().innerHTML=topbarHtml()
      +`<main class="wrap"><section class="home">`
      +introBlock("Bibliothèque", `<h1>Mes tournois</h1>`, "Tes tournois sont enregistrés dans ce navigateur.", actions)
      +`<div class="page-sub"><span class="count-pill">${list.length} tournoi${list.length>1?"s":""}</span></div>`
      +cards
      +`</section></main>`+footerHtml();

    bindTopbar();
    $("#newbtn").addEventListener("click",()=>{ location.hash="#/nouveau"; });
    $("#importbtn").addEventListener("click",()=>$("#importfile").click());
    const home=$(".home");
    const onAct=e=>{
      const b=e.target.closest("[data-act]"); if(!b) return;
      const id=b.dataset.id, act=b.dataset.act;
      if(act==="open"){ location.hash="#/t/"+id+"/config"; }
      else if(act==="export"){ exportTournament(id); }
      else if(act==="dup"){ duplicateTournament(id); viewHome(); }
      else if(act==="del"){ const t=readTournament(id); if(confirm(`Supprimer « ${t?t.name:"ce tournoi"} » ? Cette action est définitive.`)){ deleteTournament(id); viewHome(); } }
    };
    home.addEventListener("click",onAct);
    home.addEventListener("keydown",e=>{ if((e.key==="Enter"||e.key===" ")&&e.target.classList.contains("tcard-main")){ e.preventDefault(); onAct(e); } });
  }

  // -------- création --------
  function teamInputsHtml(names,n){
    let h="";
    for(let i=0;i<n;i++) h+=`<div class="team"><span class="rk">${i+1}</span><input value="${esc(names[i]||"")}" placeholder="Équipe ${i+1}" aria-label="Nom équipe ${i+1}"></div>`;
    return h;
  }
  function viewCreate(){
    let names=new Array(16).fill("");
    app().innerHTML=topbarHtml()
      +`<main class="wrap"><section class="create">`
      +introBlock("Nouveau", `<h1>Créer un tournoi</h1>`, "Choisis les paramètres et les équipes, puis lance-toi.", "")
      +`<form id="createform" class="form">
          <div class="field wide"><label for="c_name">Nom du tournoi</label><input id="c_name" type="text" placeholder="Tournoi des Rois" value="Tournoi des Rois"></div>
          <div class="grid6">
            <div class="field"><label for="c_nteams">Équipes</label><input id="c_nteams" type="number" min="4" max="24" step="2" value="16"></div>
            <div class="field"><label for="c_nrounds">Rondes</label><input id="c_nrounds" type="number" min="1" max="23" step="1" value="8"></div>
            <div class="field"><label for="c_courts">Terrains</label><select id="c_courts"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></div>
            <div class="field"><label for="c_start">Début</label><input id="c_start" type="time" value="09:00"></div>
            <div class="field"><label for="c_dur">Durée (min)</label><input id="c_dur" type="number" min="5" max="90" step="1" value="20"></div>
            <div class="field"><label for="c_brk">Pause (min)</label><input id="c_brk" type="number" min="0" max="60" step="1" value="5"></div>
          </div>
          <div class="teams-head"><h2>Équipes</h2><button type="button" class="btn sm ghost" id="demobtn">Noms d'exemple</button></div>
          <div class="teams" id="c_teams">${teamInputsHtml(names,16)}</div>
          <div class="form-actions">
            <button type="button" class="btn ghost" id="cancelbtn">Annuler</button>
            <button type="submit" class="btn primary">Créer le tournoi</button>
          </div>
        </form></section></main>`+footerHtml();

    bindTopbar();
    const grid=$("#c_teams");
    const readNames=()=>$$("#c_teams input").map(i=>i.value);
    const rebuild=n=>{ names=readNames(); grid.innerHTML=teamInputsHtml(names,n); };
    $("#c_nteams").addEventListener("change",e=>{ const n=clampEven(parseInt(e.target.value,10),MINT,MAXT); e.target.value=n;
      const rd=$("#c_nrounds"); rd.max=Math.max(1,n-1); if(+rd.value>+rd.max) rd.value=rd.max; rebuild(n); });
    $("#demobtn").addEventListener("click",()=>{ const n=clampEven(parseInt($("#c_nteams").value,10),MINT,MAXT); names=DEMO_TEAMS.slice(0,n); grid.innerHTML=teamInputsHtml(names,n); });
    $("#cancelbtn").addEventListener("click",()=>{ location.hash="#/"; });
    $("#createform").addEventListener("submit",e=>{
      e.preventDefault();
      const n=clampEven(parseInt($("#c_nteams").value,10),MINT,MAXT);
      const teams=readNames().slice(0,n); while(teams.length<n)teams.push("");
      const cfg={rounds:parseInt($("#c_nrounds").value,10)||8,
        start:parseHHMM($("#c_start").value)!=null?parseHHMM($("#c_start").value):540,
        dur:parseInt($("#c_dur").value,10)||20, brk:parseInt($("#c_brk").value,10)||0};
      const courts=+$("#c_courts").value||3;
      const t=createTournament({name:$("#c_name").value, data:{teams,courts,cfg:{teams:n,rounds:cfg.rounds,start:cfg.start,dur:cfg.dur,brk:cfg.brk}}});
      location.hash="#/t/"+t.id+"/config";
    });
  }

  // -------- espace tournoi (pages par étape) --------
  // Barre de navigation interne du tournoi (onglets + stepper de rondes). Les BOUTONS d'action
  // propres à chaque page sont rendus dans la page (voir mountStep), pas ici.
  function tnavHtml(route){
    const R=RD(), sch=schedules();
    let rondeTabs="";
    for(let r=0;r<R;r++){
      const exists=r<sch.length;
      let cls="step todo", st="à venir";
      if(exists){ if(roundComplete(r)){cls="step done";st="terminée";} else if(started(r)){cls="step cur";st="en cours";} else if(firm(r)){cls="step firm";st="à venir";} else {cls="step prov";st="provisoire";} }
      else { cls="step locked"; st="verrouillée"; }
      const active=(route.step==="ronde"&&route.r===r)?" active":"";
      rondeTabs+=`<button class="${cls}${active}" data-nav="ronde" data-r="${r}" title="Ronde ${r+1} · ${st}">${r+1}</button>`;
    }
    const tab=(k,label)=>`<button class="tab${route.step===k?" active":""}" data-nav="${k}">${label}</button>`;
    return `<nav class="tnav"><div class="tnav-in">
      ${tab("config","Configuration")}
      ${tab("classement","Classement")}
      <span class="tnav-rounds"><span class="tnav-lab">Rondes</span>${rondeTabs}</span>
      ${tab("finale","Phase finale")}
    </div></nav>`;
  }
  function navHtml(route){
    return topbarHtml()+tnavHtml(route)+`<main class="wrap"><div class="tv-body" id="tvbody"></div></main>`+footerHtml();
  }
  function bindTnav(){
    $$(".tnav [data-nav]").forEach(b=>b.addEventListener("click",()=>{
      const n=b.dataset.nav;
      if(n==="ronde") location.hash="#/t/"+ACTIVE.id+"/ronde/"+b.dataset.r; else location.hash="#/t/"+ACTIVE.id+"/"+n;
    }));
  }
  function renderNav(route){
    const old=$(".tnav"); if(!old) return;
    // reconstruit uniquement la barre d'onglets (ne touche pas #tvbody ni les champs en édition)
    const tpl=document.createElement("template"); tpl.innerHTML=tnavHtml(route);
    const newNav=tpl.content.querySelector(".tnav"); if(!newNav) return;
    old.replaceWith(newNav);
    bindTnav();
  }

  function cfgFormHtml(){
    return `<div class="cfgbar">
        <label>Équipes <input type="number" id="nteams" min="4" max="24" step="2"></label>
        <label>Rondes <input type="number" id="nrounds" min="1" max="23" step="1"></label>
        <label>Terrains <select id="courts"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
        <label>Début <input type="time" id="start"></label>
        <label>Durée <input type="number" id="dur" min="5" max="90" step="1"> min</label>
        <label>Pause <input type="number" id="brk" min="0" max="60" step="1"> min</label>
      </div>
      <p class="draw-note">La ronde 1 est tirée au sort automatiquement. Tu peux renommer les équipes à tout moment, les noms se reportent partout. <span id="court-note"></span></p>
      <div class="teams" id="teams"></div>`;
  }
  function renderTeams(){
    const host=$("#teams"); if(!host) return;
    host.innerHTML="";
    for(let i=0;i<NT();i++){
      const d=document.createElement("div");d.className="team";
      d.innerHTML=`<span class="rk">${i+1}</span>`;
      const inp=document.createElement("input");inp.placeholder="Équipe "+(i+1);inp.value=S.teams[i]||"";
      inp.setAttribute("aria-label","Nom équipe "+(i+1));
      inp.addEventListener("input",()=>{S.teams[i]=inp.value;save();});
      d.appendChild(inp);host.appendChild(d);
    }
  }
  function updateCourtNote(){
    const el=$("#court-note"); if(!el)return;
    const eff=effCourts();
    el.textContent = eff<S.courts
      ? `Avec ${NT()} équipes, ${eff} terrain${eff>1?"s":""} au plus peuvent tourner en même temps (il faut toujours une équipe libre pour arbitrer).`
      : "";
  }
  function syncCfg(){
    const nt=$("#nteams"),rd=$("#nrounds"),c=$("#courts"),s=$("#start"),d=$("#dur"),bk=$("#brk");
    if(nt)nt.value=NT(); if(rd){rd.max=maxRounds();rd.value=S.cfg.rounds;} if(c)c.value=String(S.courts); if(s)s.value=hhmm(S.cfg.start); if(d)d.value=S.cfg.dur; if(bk)bk.value=S.cfg.brk;
    updateCourtNote();
  }
  function bindCfg(route){
    $("#nteams").addEventListener("change",e=>{
      const n=clampEven(parseInt(e.target.value,10),MINT,MAXT);
      if(Object.keys(S.sc).length>0 && !confirm("Changer le nombre d'équipes réinitialise les appariements et les scores. Continuer ?")){ syncCfg(); return; }
      const t=S.teams.slice(0,n); while(t.length<n)t.push(""); S.teams=t; S.cfg.teams=n;
      S.rounds=[]; S.sc={}; S.order0=null; S.fsc={};
      if(S.cfg.rounds>maxRounds())S.cfg.rounds=maxRounds();
      ensureRounds(); save();
      renderTeams(); syncCfg(); renderNav(route);
    });
    $("#nrounds").addEventListener("input",e=>{const n=parseInt(e.target.value,10);if(!isNaN(n)&&n>=1&&n<=maxRounds()){S.cfg.rounds=n;ensureRounds();save();renderNav(route);}});
    $("#courts").addEventListener("change",e=>{const v=+e.target.value;if(v>=1&&v<=5){S.courts=v;save();updateCourtNote();}});
    $("#start").addEventListener("input",e=>{const m=parseHHMM(e.target.value);if(m!=null){S.cfg.start=m;save();}});
    $("#dur").addEventListener("input",e=>{const n=parseInt(e.target.value,10);if(!isNaN(n)&&n>0){S.cfg.dur=n;save();}});
    $("#brk").addEventListener("input",e=>{const n=parseInt(e.target.value,10);if(!isNaN(n)&&n>=0){S.cfg.brk=n;save();}});
  }

  function mountRound(r){
    const host=$("#rounds"); if(!host) return;
    host.innerHTML="";
    const sch=schedules();
    if(r>=sch.length){
      host.appendChild(elFrom(`<div class="waitbox">La ronde ${r+1} sera calculée dès que la ronde ${r} sera terminée (sur ${RD()} rondes). Saisis d'abord les scores de la ronde ${r}.</div>`));
      return;
    }
    const card=document.createElement("div"); card.className="round"; card.dataset.r=r; card.innerHTML=cardInner(sch[r],r);
    host.appendChild(card);
  }
  function refreshRound(){
    const host=$("#rounds"); if(!host) return;
    const card=host.querySelector(".round"); if(!card){ return; }
    const r=+card.dataset.r; const sch=schedules();
    if(r>=sch.length){ mountRound(r); return; }
    if(started(r)){ const st=card.querySelector('[data-role="st"]'); if(st){const d=roundComplete(r); st.textContent=d?"terminée":"en cours"; st.classList.toggle("done",d);} }
    else { card.innerHTML=cardInner(sch[r],r); }   // ronde non commencée : rebuild sûr
  }

  // bouton d'action « propre à la page » : lancer la présentation (nouvelle fenêtre)
  const presBtn=`<button class="btn ghost" data-pres title="Ouvre la projection dans une nouvelle fenêtre">📺 Présentation</button>`;
  function mountStep(route){
    const body=$("#tvbody"); if(!body) return;
    const name=esc(ACTIVE.name);
    if(route.step==="config"){
      const actions=`<button class="btn ghost" id="exportbtn" title="Exporter en JSON">⬇ Export</button>`
        +`<button class="btn danger" id="delbtn" title="Supprimer ce tournoi">🗑 Supprimer</button>`;
      body.innerHTML=introBlock("Configuration",
        `<input class="title-input" id="tname" value="${name}" aria-label="Nom du tournoi">`,
        "Paramètres du tournoi et noms des équipes.", actions)
        +cfgFormHtml();
      renderTeams(); syncCfg(); bindCfg(route);
      const tn=$("#tname"); if(tn) tn.addEventListener("change",()=>renameActive(tn.value));
      const ex=$("#exportbtn"); if(ex) ex.addEventListener("click",()=>exportTournament(ACTIVE.id));
      const del=$("#delbtn"); if(del) del.addEventListener("click",()=>{ if(confirm(`Supprimer « ${ACTIVE.name} » ? Cette action est définitive.`)){ deleteTournament(ACTIVE.id); location.hash="#/"; } });
    } else if(route.step==="classement"){
      body.innerHTML=introBlock(name, `<h1>Classement</h1>`, `<span id="rank-sub">mis à jour en direct</span>`, presBtn)
        +`<div class="rankwrap" id="rankwrap"></div>`;
      renderRank(); bindPres();
    } else if(route.step==="finale"){
      body.innerHTML=introBlock(name, `<h1>Phase finale</h1>`,
        "Moitié haute → tableau principal · moitié basse → consolante · têtes de série en direct.", presBtn)
        +`<div class="finals" id="finals"></div>`;
      renderFinals(); bindPres();
    } else { // ronde
      const r=route.r||0;
      body.innerHTML=introBlock(name, `<h1>Ronde ${r+1}</h1>`,
        "Saisis les scores ; le classement et la ronde suivante se calculent tout seuls.", presBtn)
        +`<div id="rounds"></div>`;
      mountRound(r); bindPres();
    }
  }
  function bindPres(){ const b=$("[data-pres]"); if(b) b.addEventListener("click",()=>openPresentation(ACTIVE.id)); }

  function viewTournament(route){
    if(!ACTIVE || ACTIVE.id!==route.id){ if(!setActive(route.id)){ location.hash="#/"; return; } }
    if(route.step==="presentation"){ viewPresentation(route); return; }
    ensureRounds();
    // borne la ronde demandée
    if(route.step==="ronde"){ const R=RD(); if(route.r==null||route.r<0) route.r=0; if(route.r>=R) route.r=R-1; }
    app().innerHTML=navHtml(route);
    bindTopbar(); bindTnav();
    mountStep(route);
  }

  // -------- présentation (plein écran, bascule ronde/classement, temps réel) --------
  function viewPresentation(route){
    document.body.classList.add("proj-mode");
    const pk="tdr_pres_"+route.id;
    let view = (sessionStorage.getItem(pk)||"ronde");
    app().innerHTML=`
      <div class="pjchrome">
        <div class="pjtoggle">
          <button class="pjt" data-v="ronde">Ronde en cours</button>
          <button class="pjt" data-v="classement">Classement</button>
          <button class="pjt exit" data-v="exit" title="Quitter la présentation">✕</button>
        </div>
      </div>
      <div id="proj"></div>`;
    const setView=v=>{ view=v; try{sessionStorage.setItem(pk,v);}catch(e){} $$(".pjt").forEach(b=>b.classList.toggle("on",b.dataset.v===v)); renderProjection(view); };
    const exit=()=>{ try{ if(window.opener && !window.opener.closed){ window.close(); return; } }catch(e){} location.hash="#/t/"+route.id+"/config"; };
    $$(".pjt").forEach(b=>b.addEventListener("click",()=>{ if(b.dataset.v==="exit"){ exit(); return; } setView(b.dataset.v); }));

    const refresh=()=>{ const t=readTournament(route.id); if(t){ S=t.data; } ensureRounds(); renderProjection(view); };
    setView(view); refresh();
    presStorage=ev=>{ if(!ev||ev.key===TKEY(route.id)||ev.key===IKEY) refresh(); };
    window.addEventListener("storage",presStorage);
    presTimer=setInterval(refresh,1500);
  }

  // ============================================================= ROUTER
  function parseHash(){
    let h=(location.hash||"").replace(/^#/,"");
    const p=h.split("/").filter(Boolean);
    if(p.length===0) return {view:"home"};
    if(p[0]==="nouveau") return {view:"create"};
    if(p[0]==="t"&&p[1]){ const step=p[2]||"config"; const r=p[3]!=null?parseInt(p[3],10):null; return {view:"tournament",id:p[1],step,r:isNaN(r)?null:r}; }
    return {view:"home"};
  }
  function render(){
    teardown();
    try{ idx.lastRoute=location.hash||"#/"; saveIndex(); }catch(e){}
    const route=parseHash();
    if(route.view==="create"){ viewCreate(); }
    else if(route.view==="tournament"){ viewTournament(route); }
    else { viewHome(); }
    try{ window.scrollTo(0,0); }catch(e){}
  }

  // ============================================================= SAISIE (délégation globale, liée une fois)
  function onInput(e){
    const t=e.target;
    if(t.dataset && t.dataset.sc){
      const id=t.dataset.sc; S.sc[id]=S.sc[id]||{}; S.sc[id][t.dataset.side]=t.value; save();
      renderRank();
      const row=t.closest(".m");
      if(row){ const sc=S.sc[id]; const ia=row.querySelector(".ta"),ib=row.querySelector(".tb");
        ia.classList.remove("w");ib.classList.remove("w");
        if(sc.a!==""&&sc.b!==""&&!isNaN(+sc.a)&&!isNaN(+sc.b)){ if(+sc.a>+sc.b)ia.classList.add("w"); else if(+sc.b>+sc.a)ib.classList.add("w"); }
        const card=row.closest(".round"); if(card){ const r=+card.dataset.r;
          const st=card.querySelector('[data-role="st"]');
          if(st){ const d=roundComplete(r); st.textContent=d?"terminée":"en cours"; st.classList.toggle("done",d); } }
      }
      renderFinals();
    } else if(t.dataset && t.dataset.fsc){
      const id=t.dataset.fsc; S.fsc[id]=S.fsc[id]||{}; S.fsc[id][t.dataset.side]=t.value; save();
      renderFinals();
    }
  }
  function onChange(e){
    if(e.target.dataset && e.target.dataset.sc){
      ensureRounds(); save();
      refreshRound(); renderRank(); renderFinals();
      const route=parseHash(); if(route.view==="tournament") renderNav(route);
    }
  }

  // ============================================================= THÈME
  function applyTheme(mode){ if(mode==="dark"||mode==="light") document.documentElement.setAttribute("data-theme",mode); else document.documentElement.removeAttribute("data-theme"); }
  function toggleTheme(){
    const cur=document.documentElement.getAttribute("data-theme");
    const dark=cur?cur==="dark":matchMedia("(prefers-color-scheme:dark)").matches;
    const next=dark?"light":"dark"; applyTheme(next); try{localStorage.setItem(THEMEKEY,next);}catch(e){}
  }

  // ============================================================= BOOTSTRAP
  try{ const th=localStorage.getItem(THEMEKEY); if(th) applyTheme(th); }catch(e){}
  migrateLegacy();
  document.addEventListener("input",onInput);
  document.addEventListener("change",onChange);
  // import depuis un fichier JSON (champ #importfile dans index.html, lié une seule fois)
  (function(){
    const imp=document.getElementById("importfile"); if(!imp) return;
    imp.addEventListener("change",e=>{
      const f=e.target.files&&e.target.files[0]; if(!f) return;
      const rd=new FileReader();
      rd.onload=()=>{ try{ const t=importFromText(String(rd.result)); location.hash="#/t/"+t.id+"/config"; }
        catch(err){ alert(err&&err.message?err.message:"Import impossible."); } finally{ imp.value=""; } };
      rd.onerror=()=>{ alert("Lecture du fichier impossible."); imp.value=""; };
      rd.readAsText(f);
    });
  })();
  window.addEventListener("hashchange",render);
  const empty=!location.hash||location.hash==="#"||location.hash==="#/";
  const want = empty ? (idx.lastRoute||"#/") : location.hash;
  if(location.hash!==want) location.hash=want; else render();
})();
