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

  function parseDOM(){
    allGames=[];
    var items=document.querySelectorAll('.match_card_item');
    if(!items.length){
      statusEl.textContent='경기 목록을 찾지 못했어요. m.ticketlink.co.kr/sports/137/59 에서 실행해주세요.';
      statusEl.style.color='#e67e00';
      return;
    }
    items.forEach(function(item){
      var txt=(item.textContent||'').replace(/\s+/g,' ').trim();

      /* 팀명 파싱 */
      var teamMatch=txt.match(/([가-힣A-Za-z\s]+(?:트윈스|이글스|라이온즈|wiz|타이거즈|베어스|랜더스|다이노스|자이언츠|히어로즈))\s*vs\s*홈\s*([가-힣A-Za-z\s]+(?:트윈스|이글스|라이온즈|wiz|타이거즈|베어스|랜더스|다이노스|자이언츠|히어로즈))/);
      var away=teamMatch?teamMatch[1].trim():'?';
      var home=teamMatch?teamMatch[2].trim():'?';

      /* 날짜 파싱 */
      var dateMatch=txt.match(/(\d{2})\.(\d{2})\(([^)]+)\)\s*(\d{2}:\d{2})/);
      var dateStr=dateMatch?(dateMatch[1]+'.'+dateMatch[2]+'('+dateMatch[3]+') '+dateMatch[4]):'-';

      /* 구장 */
      var venueMatch=txt.match(/(잠실야구장|고척스카이돔|수원KT위즈파크|대전한화생명볼파크|광주기아챔피언스필드|사직야구장|창원NC파크|인천SSG랜더스필드|포항야구장|대구삼성라이온즈파크)/);
      var venue=venueMatch?venueMatch[1]:'-';

      /* 상태 및 버튼 */
      var bookBtn=item.querySelector('.btn_primary');
      var isPending=txt.includes('오픈예정');
      var openMatch=txt.match(/(\d{2}\.\d{2}\([^)]+\)\s*\d{2}:\d{2})\s*오픈예정/);
      var openInfo=openMatch?openMatch[1]+' 오픈':'';

      allGames.push({
        home:home, away:away,
        dateStr:dateStr, venue:venue,
        canBook:!!bookBtn&&!isPending,
        isPending:isPending,
        openInfo:openInfo,
        bookBtn:bookBtn,
        item:item
      });
    });
    render();
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

      var left=document.createElement('div');
      left.style.cssText='flex:1;min-width:0';
      var t=document.createElement('div');
      t.style.cssText='font-size:15px;font-weight:500;color:#222';
      t.textContent=g.away+' vs '+g.home;
      var s=document.createElement('div');
      s.style.cssText='font-size:13px;color:#888;margin-top:2px';
      s.textContent=g.dateStr+' · '+g.venue;
      left.appendChild(t);left.appendChild(s);

      if(g.openInfo){
        var o=document.createElement('div');
        o.style.cssText='font-size:11px;color:#e67e00;margin-top:2px';
        o.textContent='🕐 '+g.openInfo;
        left.appendChild(o);
      }

      var btn=document.createElement('button');
      btn.style.cssText='flex-shrink:0;padding:10px 16px;border:0;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;white-space:nowrap';

      if(g.canBook){
        btn.textContent='예매';
        btn.style.background='#4a90d9';
        btn.style.color='#fff';
        btn.onclick=function(){
          ui.remove();
          g.bookBtn.click();
        };
      } else if(g.isPending){
        btn.textContent='오픈예정';
        btn.style.background='#f0f0f0';
        btn.style.color='#999';
        btn.disabled=true;
      } else {
        btn.textContent='취소대기';
        btn.style.background='#fff3e0';
        btn.style.color='#e67e00';
        btn.onclick=function(){
          ui.remove();
          g.bookBtn.click();
        };
      }

      row.appendChild(left);row.appendChild(btn);
      body.appendChild(row);
    });
  }

  /* 페이지 렌더링 완료 후 파싱 */
  if(document.querySelectorAll('.match_card_item').length){
    parseDOM();
  } else {
    statusEl.textContent='경기 목록 로딩 중... 잠시 후 다시 시도해주세요.';
    setTimeout(parseDOM, 1500);
  }
})();
