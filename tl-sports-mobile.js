(function(){
  var ID='tl-mob',old=document.getElementById(ID);
  if(old)old.remove();

  var ui=document.createElement('div');
  ui.id=ID;
  ui.style.cssText='position:fixed;left:0;right:0;bottom:0;max-height:82vh;overflow:auto;background:#fff;border-top:2px solid #4a90d9;border-radius:20px 20px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.2);font:16px/1.5 -apple-system,sans-serif;z-index:2147483647;-webkit-overflow-scrolling:touch';

  var hdr=document.createElement('div');
  hdr.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:16px 18px 12px;background:#e8f0fe;border-radius:20px 20px 0 0;border-bottom:1px solid #c8daff;position:sticky;top:0;z-index:1';
  var ttl=document.createElement('div');
  ttl.style.cssText='font-size:18px;font-weight:700;color:#1a3a6b';
  ttl.textContent='⚾ 티켓링크 KBO';
  var xBtn=document.createElement('button');
  xBtn.textContent='✕';
  xBtn.style.cssText='border:0;background:rgba(0,0,0,.1);border-radius:8px;width:36px;height:36px;font-size:18px;cursor:pointer;color:#333;flex-shrink:0';
  xBtn.onclick=function(){ui.remove();};
  hdr.appendChild(ttl);hdr.appendChild(xBtn);

  var filterWrap=document.createElement('div');
  filterWrap.style.cssText='padding:10px 14px;border-bottom:1px solid #e8f0fe;background:#f5f8ff;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch;position:sticky;top:62px;z-index:1';
  var TEAMS=['LG트윈스','한화이글스','삼성라이온즈','kt wiz','KIA타이거즈','두산베어스','SSG랜더스','NC다이노스','롯데자이언츠','키움히어로즈'];
  var sel='';
  TEAMS.forEach(function(t){
    var b=document.createElement('button');
    b.textContent=t;b.dataset.team=t;
    b.style.cssText='display:inline-block;border:1.5px solid #4a90d9;background:#fff;padding:6px 14px;border-radius:20px;cursor:pointer;font-size:13px;margin-right:6px;white-space:nowrap;-webkit-tap-highlight-color:transparent';
    b.onclick=function(){
      sel=sel===t?'':t;
      filterWrap.querySelectorAll('button').forEach(function(x){
        var on=x.dataset.team===sel;
        x.style.background=on?'#4a90d9':'#fff';
        x.style.color=on?'#fff':'#333';
        x.style.fontWeight=on?'700':'400';
      });
      render();
    };
    filterWrap.appendChild(b);
  });

  var statusEl=document.createElement('div');
  statusEl.style.cssText='font-size:13px;color:#888;padding:8px 16px 4px';
  statusEl.textContent='경기 불러오는 중...';

  var body=document.createElement('div');

  ui.appendChild(hdr);
  ui.appendChild(filterWrap);
  ui.appendChild(statusEl);
  ui.appendChild(body);
  document.body.appendChild(ui);

  var allGames=[];
  function norm(s){return(s||'').replace(/\s/g,'');}

  function parseSchedules(json){
    var arr=null;
    var candidates=[
      json&&json.data,
      json&&json.data&&json.data.schedules,
      json&&json.list,
      json&&json.content,
      json&&json.schedules
    ];
    for(var i=0;i<candidates.length;i++){
      if(Array.isArray(candidates[i])){arr=candidates[i];break;}
    }
    if(!arr)return[];
    return arr.map(function(e){
      var id=e.scheduleId||e.id;
      var pid=e.productId||e.pid;
      var date=e.scheduleDate||e.startDateTime||e.date||'';
      var home=(e.homeTeam&&e.homeTeam.teamName)||e.homeTeamName||'?';
      var away=(e.awayTeam&&e.awayTeam.teamName)||e.awayTeamName||'?';
      var venue=e.venueName||e.venue||'-';
      var ds=date?new Date(date).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',weekday:'short'}):'-';
      return{id:id,productId:pid,home:home,away:away,venue:venue,ds:ds};
    }).filter(function(e){return e.id&&e.productId;});
  }

  function render(){
    body.innerHTML='';
    var list=sel
      ?allGames.filter(function(g){var t=norm(sel);return norm(g.home).includes(t)||norm(g.away).includes(t);})
      :allGames;
    statusEl.textContent=list.length+'개 경기';
    if(!list.length){
      var e=document.createElement('div');
      e.style.cssText='text-align:center;padding:28px;color:#aaa;font-size:15px';
      e.textContent='해당 팀 경기가 없어요';
      body.appendChild(e);return;
    }
    list.forEach(function(g){
      var row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #f0f0f0;gap:10px';
      var left=document.createElement('div');left.style.cssText='flex:1;min-width:0';
      var t=document.createElement('div');t.style.cssText='font-size:15px;font-weight:500;color:#222';t.textContent=g.home+' vs '+g.away;
      var s=document.createElement('div');s.style.cssText='font-size:13px;color:#888;margin-top:2px';s.textContent=g.ds+' · '+g.venue;
      left.appendChild(t);left.appendChild(s);
      var btn=document.createElement('button');
      btn.textContent='예매';
      btn.style.cssText='flex-shrink:0;padding:10px 20px;background:#4a90d9;color:#fff;border:0;border-radius:20px;font-size:14px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent';
      btn.onclick=function(){
        /* PC 버전과 동일: scheduleId만으로 예매창 이동 */
        location.href='/reserve/product/'+g.productId+'?scheduleId='+g.id;
      };
      row.appendChild(left);row.appendChild(btn);
      body.appendChild(row);
    });
  }

  function loadFromPerformance(){
    /* performance API로 이미 호출된 schedules URL 재사용 */
    var urls=performance.getEntriesByType('resource')
      .map(function(e){return e.name;})
      .filter(function(u){return u.includes('mapi.ticketlink.co.kr')&&u.includes('/sports/schedules');})
      .reverse();
    if(!urls.length){
      statusEl.textContent='경기 목록을 찾지 못했어요. m.ticketlink.co.kr/sports/137/59 페이지에서 실행해주세요.';
      statusEl.style.color='#e67e00';
      return;
    }
    fetch(urls[0],{cache:'no-store',credentials:'include'})
    .then(function(r){return r.json();})
    .then(function(json){
      var list=parseSchedules(json);
      if(list.length){allGames=list;render();}
      else{statusEl.textContent='경기 데이터를 파싱하지 못했어요.';statusEl.style.color='#e67e00';}
    })
    .catch(function(e){
      statusEl.textContent='로드 실패: '+e.message;
      statusEl.style.color='#e74c3c';
    });
  }

  loadFromPerformance();
})();
