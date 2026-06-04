import { useState, useEffect } from "react";

const STORAGE_KEY = "seating_v3";
const SECRET_KEY  = "seating_secret_v3";

const T = {
  bg: "#f0f4f8",
  cardBg: "#ffffff", cardBorder: "#e2e8f0",
  shadow: "0 4px 20px rgba(15,23,42,0.05)",
  headerBg: "linear-gradient(135deg,#1e293b 0%,#334155 100%)",
  podiumBg: "linear-gradient(135deg,#1e293b 0%,#334155 100%)",
  deskBg: "#ffffff", deskBorder: "#94a3b8", deskText: "#1e293b",
  deskInactiveBg: "#f1f5f9", deskInactiveBorder: "#cbd5e1",
  selected: { bg:"#fef2f2", border:"#ef4444", text:"#991b1b" },
  drag:     { bg:"#ecfdf5", border:"#10b981" },
  locked:   { bg:"#fefce8", border:"#eab308", text:"#854d0e" },
  panelBg: "linear-gradient(135deg,#1e293b 0%,#0f172a 100%)",
  panelInput: "rgba(255,255,255,0.06)", panelInputBorder: "rgba(255,255,255,0.12)",
};

function initDesks(rows, cols) {
  return Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>({id:`${r}-${c}`,active:true,student:null,locked:false})));
}
function parseStudents(text) {
  return text.split(/[\n,,、]+/).map(s=>s.trim()).filter(Boolean);
}
function parseForbidden(lines) {
  return lines.filter(l=>l.trim()).map(l=>l.split(/[,,]+/).map(s=>s.trim()).filter(Boolean)).filter(g=>g.length>=2);
}
function is3x3Adjacent(r1,c1,r2,c2){return Math.abs(r1-r2)<=1&&Math.abs(c1-c2)<=1&&!(r1===r2&&c1===c2);}
function mdist(r1,c1,r2,c2){return Math.abs(r1-r2)+Math.abs(c1-c2);}
function isSamePair(c1,c2){return Math.floor(c1/2)===Math.floor(c2/2);}

function buildSeating(desks,students,forbiddenGroups,mode){
  // 활성 자리 전체
  const allActive=[];
  desks.forEach((row,r)=>row.forEach((d,c)=>{if(d.active)allActive.push([r,c]);}));

  // 잠긴 자리
  const lockedMap={};
  allActive.forEach(([r,c])=>{const d=desks[r][c];if(d.locked&&d.student)lockedMap[`${r}-${c}`]=d.student;});
  const lockedNames=new Set(Object.values(lockedMap));

  // 배치할 학생 & 빈 자리
  const toPlace=students.filter(s=>!lockedNames.has(s));
  const freeSlots=allActive.filter(([r,c])=>!lockedMap[`${r}-${c}`]);

  // 유효 기피 그룹
  const validGroups=forbiddenGroups
    .map(g=>g.filter(s=>students.includes(s)))
    .filter(g=>g.length>=2);

  const attempts=validGroups.length>0?300:1;
  let bestPlaced=null,bestScore=[Infinity,-Infinity];

  for(let t=0;t<attempts;t++){
    const placed={...lockedMap};
    const used=new Set(Object.keys(lockedMap));
    // 매 시도마다 자리 순서 셔플 → 다양한 배치 보장
    const shuffledSlots=[...freeSlots].sort(()=>Math.random()-0.5);

    if(validGroups.length>0){
      // 기피 그룹 먼저 배치 (인원 많은 순)
      const groupMembers=new Set(validGroups.flat());
      const normals=toPlace.filter(s=>!groupMembers.has(s));
      const sorted=[...validGroups].sort((a,b)=>b.length-a.length);
      const maxR=Math.max(...freeSlots.map(s=>s[0]));
      const maxC=Math.max(...freeSlots.map(s=>s[1]));

      for(const grp of sorted){
        const assigned=[];
        // 이미 배치된 그룹원은 위치만 등록 (중복 배치 방지)
        grp.forEach(s=>{
          const existing=Object.entries(placed).find(([,v])=>v===s);
          if(existing){const[r,c]=existing[0].split("-").map(Number);assigned.push([r,c]);}
        });
        for(const student of grp){
          if(Object.values(placed).includes(student))continue; // 이미 배치됨 → 스킵
          const avail=shuffledSlots.filter(([r,c])=>!used.has(`${r}-${c}`));
          if(!avail.length)break;
          let pick;
          if(!assigned.length){
            const edge=avail.filter(([r,c])=>r===0||c===0||r===maxR||c===maxC);
            const pool=edge.length?edge:avail;
            pick=pool[Math.floor(Math.random()*pool.length)];
          }else{
            const nonAdj=avail.filter(([r,c])=>assigned.every(([pr,pc])=>!is3x3Adjacent(pr,pc,r,c)));
            const pool=nonAdj.length?nonAdj:avail;
            // 동점 후보 중 랜덤 선택
            let bd=-1,cands=[];
            for(let i=0;i<pool.length;i++){const[r,c]=pool[i];const d=Math.min(...assigned.map(([pr,pc])=>mdist(r,c,pr,pc)));if(d>bd){bd=d;cands=[pool[i]];}else if(d===bd)cands.push(pool[i]);}
            pick=cands[Math.floor(Math.random()*cands.length)];
          }
          assigned.push(pick);used.add(`${pick[0]}-${pick[1]}`);placed[`${pick[0]}-${pick[1]}`]=student;
        }
      }
      // 나머지 학생 랜덤 배치
      const remSlots=shuffledSlots.filter(([r,c])=>!used.has(`${r}-${c}`));
      [...normals].sort(()=>Math.random()-0.5).forEach((s,i)=>{if(i<remSlots.length){placed[`${remSlots[i][0]}-${remSlots[i][1]}`]=s;}});
    }else{
      // 기피관계 없음 → 단순 랜덤 배치 (반드시 전원 배정)
      const shuffledSlots=[...freeSlots].sort(()=>Math.random()-0.5);
      [...toPlace].sort(()=>Math.random()-0.5).forEach((s,i)=>{placed[`${shuffledSlots[i][0]}-${shuffledSlots[i][1]}`]=s;});
    }

    // 점수 계산
    let violations=0,minDist=Infinity;
    for(const grp of validGroups){
      const pos=grp.map(s=>{const e=Object.entries(placed).find(([,v])=>v===s);return e?e[0].split("-").map(Number):null;}).filter(Boolean);
      for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){
        const[r1,c1]=pos[i],[r2,c2]=pos[j];
        if(is3x3Adjacent(r1,c1,r2,c2))violations++;
        const d=mdist(r1,c1,r2,c2);if(d<minDist)minDist=d;
      }
    }
    if(minDist===Infinity)minDist=0;
    const score=[violations,-minDist];
    if(score[0]<bestScore[0]||(score[0]===bestScore[0]&&score[1]<bestScore[1])){bestScore=score;bestPlaced={...placed};}
    if(bestScore[0]===0&&t>=50)break;
  }

  return{
    desks:desks.map(row=>row.map(d=>({...d,student:bestPlaced?bestPlaced[d.id]??null:null}))),
    ok:bestScore[0]===0
  };
}

// ── Canvas helpers ──────────────────────────────────────────
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function roundRectCustom(ctx,x,y,w,h,tl,tr,br,bl){
  ctx.beginPath();ctx.moveTo(x+tl,y);ctx.lineTo(x+w-tr,y);
  if(tr>0)ctx.quadraticCurveTo(x+w,y,x+w,y+tr);else ctx.lineTo(x+w,y);
  ctx.lineTo(x+w,y+h-br);
  if(br>0)ctx.quadraticCurveTo(x+w,y+h,x+w-br,y+h);else ctx.lineTo(x+w,y+h);
  ctx.lineTo(x+bl,y+h);
  if(bl>0)ctx.quadraticCurveTo(x,y+h,x,y+h-bl);else ctx.lineTo(x,y+h);
  ctx.lineTo(x,y+tl);
  if(tl>0)ctx.quadraticCurveTo(x,y,x+tl,y);else ctx.lineTo(x,y);
  ctx.closePath();
}

function drawDesk(ctx,x,y,w,h,desk,pairSide=null){
  const r=10;
  // 빈자리·비활성 → 흰색 (인쇄 시 안 보이게)
  if(!desk.active||!desk.student){
    ctx.fillStyle="#ffffff";
    if(pairSide==="left")roundRectCustom(ctx,x,y,w,h,r,0,0,r);
    else if(pairSide==="right")roundRectCustom(ctx,x,y,w,h,0,r,r,0);
    else roundRect(ctx,x,y,w,h,r);
    ctx.fill();return;
  }
  // 배경
  ctx.fillStyle=desk.locked?"#fefce8":"#ffffff";
  if(pairSide==="left")roundRectCustom(ctx,x,y,w,h,r,0,0,r);
  else if(pairSide==="right")roundRectCustom(ctx,x,y,w,h,0,r,r,0);
  else roundRect(ctx,x,y,w,h,r);
  ctx.fill();
  // 테두리
  ctx.strokeStyle=desk.locked?"#eab308":"#94a3b8";ctx.lineWidth=1.5;
  if(pairSide==="left"){ctx.beginPath();ctx.moveTo(x+w,y);ctx.lineTo(x+r,y);ctx.quadraticCurveTo(x,y,x,y+r);ctx.lineTo(x,y+h-r);ctx.quadraticCurveTo(x,y+h,x+r,y+h);ctx.lineTo(x+w,y+h);ctx.stroke();}
  else if(pairSide==="right"){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x,y+h);ctx.stroke();}
  else ctx.stroke();
  // 자물쇠
  if(desk.locked){ctx.font="13px sans-serif";ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText("🔒",x+5,y+4);}
  // 이름
  ctx.fillStyle=desk.locked?"#854d0e":"#1e293b";
  const fs=Math.min(16,Math.max(11,h*0.26));
  ctx.font=`600 ${fs}px 'Apple SD Gothic Neo','Malgun Gothic',sans-serif`;
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText(desk.student,x+w/2,y+h/2);
}

function exportSeatingImage(desks,rows,cols,mode,teacherView){
  const isPair=mode==="pair";
  const cellW=115,cellH=72,gap=12,pairOuterGap=22;
  const padding=40,podiumH=44,headerGap=32;
  // 컬럼 x 위치 (짝꿍: 같은 쌍 내부 붙어있음)
  const colX=[];let cx=padding;
  for(let c=0;c<cols;c++){
    colX.push(cx);
    if(isPair)cx+=cellW+(c%2===0?0:(c<cols-1?pairOuterGap:0));
    else cx+=cellW+(c<cols-1?gap:0);
  }
  const totalWidth=colX[cols-1]+cellW+padding;
  const gridStartY=padding+podiumH+headerGap;
  const totalHeight=gridStartY+rows*cellH+(rows-1)*gap+padding+podiumH+16;
  const dpr=2;
  const canvas=document.createElement("canvas");
  canvas.width=totalWidth*dpr;canvas.height=totalHeight*dpr;
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,totalWidth,totalHeight);
  // 교탁 (학생: 위 / 교사: 아래)
  const podiumW=200,podiumX=(totalWidth-podiumW)/2;
  const podiumY=teacherView?(gridStartY+rows*cellH+(rows-1)*gap+16):padding;
  const pg=ctx.createLinearGradient(podiumX,podiumY,podiumX+podiumW,podiumY+podiumH);
  pg.addColorStop(0,"#1e293b");pg.addColorStop(1,"#334155");
  ctx.fillStyle=pg;roundRect(ctx,podiumX,podiumY,podiumW,podiumH,10);ctx.fill();
  ctx.fillStyle="#fff";ctx.font="bold 14px 'Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText("교탁 (칠판)",podiumX+podiumW/2,podiumY+podiumH/2);
  // 책상
  for(let r=0;r<rows;r++){
    const sr=teacherView?(rows-1-r):r;
    const y=gridStartY+r*(cellH+gap);
    if(isPair){
      for(let c=0;c<cols;c+=2){
        const scL=teacherView?(cols-1-c):c;
        const scR=teacherView?(cols-1-(c+1)):(c+1);
        const dL=desks[sr][scL];
        const dR=c+1<cols?desks[sr][scR]:null;
        const x1=colX[c],x2=c+1<cols?colX[c+1]:null;
        drawDesk(ctx,x1,y,cellW,cellH,dL,"left");
        if(dR&&x2!==null){
          drawDesk(ctx,x2,y,cellW,cellH,dR,"right");
          if(dL.student&&dR.student){ctx.beginPath();ctx.moveTo(x2,y+5);ctx.lineTo(x2,y+cellH-5);ctx.strokeStyle="#94a3b8";ctx.lineWidth=1;ctx.stroke();}
        }
      }
    }else{
      for(let c=0;c<cols;c++){
        const sc=teacherView?(cols-1-c):c;
        drawDesk(ctx,colX[c],y,cellW,cellH,desks[sr][sc],null);
      }
    }
  }
  canvas.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const date=new Date().toISOString().split("T")[0];
    a.href=url;a.download=`자리배치도_${teacherView?"교사용":"학생용"}_${date}.png`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),100);
  },"image/png");
}

// ── App ─────────────────────────────────────────────────────
export default function App(){
  const[mode,setMode]=useState("single");
  const[rows,setRows]=useState(5);
  const[cols,setCols]=useState(6);
  const[desks,setDesks]=useState(()=>initDesks(5,6));
  const[studentText,setStudentText]=useState("");
  const[forbiddenLines,setForbiddenLines]=useState([""]);
  const[selected,setSelected]=useState(null);
  const[teacherOpen,setTeacherOpen]=useState(false);
  const[secretDesks,setSecretDesks]=useState(null);
  const[msg,setMsg]=useState("");
  const[warning,setWarning]=useState("");
  const[dragSrc,setDragSrc]=useState(null);
  const[dragOver,setDragOver]=useState(null);

  const flash=(m,dur=2500)=>{setMsg(m);setTimeout(()=>setMsg(""),dur);};

  useEffect(()=>{
    try{const s=localStorage.getItem(STORAGE_KEY);if(s){const d=JSON.parse(s);if(d.desks)setDesks(d.desks);if(d.rows)setRows(d.rows);if(d.cols)setCols(d.cols);if(d.studentText)setStudentText(d.studentText);if(d.forbiddenLines)setForbiddenLines(d.forbiddenLines);if(d.mode)setMode(d.mode);}const sec=localStorage.getItem(SECRET_KEY);if(sec)setSecretDesks(JSON.parse(sec));}catch{}
  },[]);
  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({desks,rows,cols,studentText,forbiddenLines,mode}));}catch{}},[desks,rows,cols,studentText,forbiddenLines,mode]);
  useEffect(()=>{
    const handler=(e)=>{
      const tag=document.activeElement?.tagName;
      if(tag==="INPUT"||tag==="TEXTAREA")return;
      if(e.key==="z"||e.key==="Z")setTeacherOpen(o=>!o);
      if((e.key==="s"||e.key==="S")&&!e.ctrlKey&&!e.metaKey){
        try{localStorage.setItem(SECRET_KEY,JSON.stringify(desks));setSecretDesks(desks);}catch{}
        setWarning("🔒 비밀 자리 저장됨");
        if(!teacherOpen)flash("💾 저장됨");
      }
    };
    window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);
  },[teacherOpen,desks]);

  const students=parseStudents(studentText);
  const forbiddenGroups=parseForbidden(forbiddenLines);

  const applyGrid=(nr,nc)=>{setDesks(prev=>Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>prev[r]?.[c]??{id:`${r}-${c}`,active:true,student:null,locked:false})));setRows(nr);setCols(nc);};
  const toggleDesk=(r,c)=>setDesks(prev=>prev.map((row,ri)=>row.map((d,ci)=>ri===r&&ci===c?{...d,active:!d.active,student:null,locked:false}:d)));
  const handleDeskClick=(r,c)=>{
    if(!desks[r][c].active)return;
    if(!selected){setSelected({r,c});return;}
    if(selected.r===r&&selected.c===c){setSelected(null);return;}
    setDesks(prev=>{const next=prev.map(row=>row.map(d=>({...d})));const tmp=next[selected.r][selected.c].student;next[selected.r][selected.c].student=next[r][c].student;next[r][c].student=tmp;return next;});
    setSelected(null);
  };
  const handleDeskDblClick=(r,c)=>{
    if(!desks[r][c].active||!desks[r][c].student)return;
    setDesks(prev=>prev.map((row,ri)=>row.map((d,ci)=>ri===r&&ci===c?{...d,locked:!d.locked}:d)));
  };
  const randomAssign=(useSecret=false)=>{
    if(useSecret&&secretDesks){setDesks(secretDesks);setWarning("🔓 비밀 자리 배치 적용됨");return;}
    // 자리 수 vs 학생 수 체크
    const activeDesks=desks.flat().filter(d=>d.active);
    const lockedStudents=new Set(activeDesks.filter(d=>d.locked&&d.student).map(d=>d.student));
    const needPlace=students.filter(s=>!lockedStudents.has(s)).length;
    const freeDesk=activeDesks.filter(d=>!d.locked).length;
    if(needPlace>freeDesk){
      setWarning(`⚠ 학생 수와 자리 수가 맞지 않아요. (학생 ${students.length}명 / 활성 자리 ${activeDesks.length}개)`);
      return;
    }
    const{desks:result,ok}=buildSeating(desks,students,forbiddenGroups,mode);
    if(!ok)setWarning("⚠ 기피 조건을 완전히 만족하기 어려워 최대한 멀리 배치했어요.");
    else{setWarning("");flash("✨ 자리가 새로 배치되었어요!");}
    setDesks(result);
  };
  const clearAssign=()=>{setDesks(prev=>prev.map(row=>row.map(d=>({...d,student:null,locked:false}))));flash("🗑 배정 초기화");};
  const onDrop=(r,c,sr,sc)=>{
    if(sr===r&&sc===c)return;
    setDesks(prev=>{const next=prev.map(row=>row.map(d=>({...d})));const tmp=next[sr][sc].student;next[sr][sc].student=next[r][c].student;next[r][c].student=tmp;return next;});
  };
  const saveImage=(teacherView)=>{
    try{exportSeatingImage(desks,rows,cols,mode,teacherView);flash(teacherView?"📋 교사용 이미지 저장됨":"📸 학생용 이미지 저장됨");}
    catch(e){flash("⚠ 저장 실패: "+e.message);}
  };

  const cellW=Math.min(120,Math.floor(740/cols));
  const cellH=Math.max(58,Math.floor(cellW*0.6));
  const isPair=mode==="pair";
  const assignedNames=desks.flat().map(d=>d.student).filter(Boolean);
  const unassigned=students.filter(s=>!assignedNames.includes(s));

  // ── 책상 스타일/콘텐츠 ──────────────────────────────────
  const getDeskStyle=(desk,r,c)=>{
    const isSel=selected?.r===r&&selected?.c===c;
    const isDrag=dragOver?.r===r&&dragOver?.c===c;
    return{
      width:cellW,height:cellH,borderRadius:10,
      border:isSel?`2px solid ${T.selected.border}`:isDrag?`2px solid ${T.drag.border}`:desk.locked?`1.8px solid ${T.locked.border}`:desk.active?`1.5px solid ${T.deskBorder}`:`1.5px dashed ${T.deskInactiveBorder}`,
      background:!desk.active?T.deskInactiveBg:isSel?T.selected.bg:isDrag?T.drag.bg:desk.locked?T.locked.bg:T.deskBg,
      cursor:desk.active?"pointer":"default",
      display:"flex",alignItems:"center",justifyContent:"center",position:"relative",
      transition:"all 0.15s ease",boxSizing:"border-box",userSelect:"none",flexShrink:0,
      boxShadow:!desk.active?"none":isSel?"0 4px 12px rgba(239,68,68,0.15)":desk.locked?"0 2px 8px rgba(234,179,8,0.15)":"0 1px 4px rgba(15,23,42,0.05)",
    };
  };
  const deskContent=(desk,r,c)=>{
    const isSel=selected?.r===r&&selected?.c===c;
    if(!desk.active||!desk.student)return null;
    return(<>
      {desk.locked&&<div style={{position:"absolute",top:3,left:6,fontSize:11}}>🔒</div>}
      <div style={{fontSize:Math.max(12,cellH*0.26),fontWeight:600,color:desk.locked?T.locked.text:isSel?T.selected.text:T.deskText,textAlign:"center",padding:"0 6px",lineHeight:1.2,wordBreak:"keep-all",letterSpacing:-0.3}}>{desk.student}</div>
    </>);
  };
  const toggleBtn=(r,c,desk)=>(
    <button onClick={e=>{e.stopPropagation();toggleDesk(r,c);}}
      style={{position:"absolute",top:3,right:3,width:17,height:17,borderRadius:"50%",border:"none",cursor:"pointer",fontSize:11,background:desk.active?"rgba(239,68,68,0.12)":"rgba(16,185,129,0.12)",color:desk.active?"#dc2626":"#059669",display:"flex",alignItems:"center",justifyContent:"center",padding:0,fontWeight:700}}>
      {desk.active?"−":"+"}
    </button>
  );
  const renderDesk=(desk,r,c)=>(
    <div key={c} onClick={()=>handleDeskClick(r,c)} onDoubleClick={()=>handleDeskDblClick(r,c)}
      draggable={desk.active&&!!desk.student}
      onDragStart={()=>setDragSrc({r,c})}
      onDragOver={e=>{e.preventDefault();setDragOver({r,c});}}
      onDragLeave={()=>setDragOver(null)}
      onDrop={e=>{e.preventDefault();if(dragSrc){onDrop(r,c,dragSrc.r,dragSrc.c);setDragSrc(null);setDragOver(null);}}}
      onDragEnd={()=>{setDragSrc(null);setDragOver(null);}}
      style={getDeskStyle(desk,r,c)}>
      {deskContent(desk,r,c)}
      {teacherOpen&&toggleBtn(r,c,desk)}
    </div>
  );

  // ── JSX ─────────────────────────────────────────────────
  return(
    <div style={{fontFamily:"'Apple SD Gothic Neo','Malgun Gothic','Pretendard',sans-serif",minHeight:"100vh",background:T.bg,padding:20}}>
      <div style={{maxWidth:1080,margin:"0 auto"}}>

        {/* 헤더 */}
        <div style={{background:T.headerBg,borderRadius:16,padding:"18px 24px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,boxShadow:"0 8px 24px rgba(15,23,42,0.12)"}}>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:19,letterSpacing:-0.3,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>🏫</span><span>스마트 자리배치도</span></div>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:12,marginTop:4}}>학생 <b style={{color:"#fff"}}>{students.length}</b>명 · 책상 <b style={{color:"#fff"}}>{desks.flat().filter(d=>d.active).length}</b>개</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {msg&&<div style={{background:"#fff",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:600,color:"#1e293b",maxWidth:260}}>{msg}</div>}
            <button onClick={e=>randomAssign(e.ctrlKey||e.metaKey)} style={{padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",background:"#fff",color:"#1e293b",fontWeight:700,fontSize:13,boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}>🎲 랜덤 배치</button>
            <button onClick={()=>saveImage(false)} style={{padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.3)",cursor:"pointer",background:"rgba(255,255,255,0.1)",color:"#fff",fontWeight:600,fontSize:12}}>📸 학생용</button>
            <button onClick={()=>saveImage(true)}  style={{padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.3)",cursor:"pointer",background:"rgba(255,255,255,0.1)",color:"#fff",fontWeight:600,fontSize:12}}>📋 교사용</button>
          </div>
        </div>

        {/* 교사 패널 */}
        {teacherOpen&&(
          <div style={{background:T.panelBg,borderRadius:16,padding:22,marginBottom:16,color:"#fff",boxShadow:"0 8px 24px rgba(15,23,42,0.2)"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:16,color:"#fbbf24",display:"flex",alignItems:"center",gap:8}}>
              <span>🔐</span><span>교사 설정 패널</span>
              <span style={{fontSize:11,color:"#94a3b8",fontWeight:500,marginLeft:4,padding:"3px 8px",background:"rgba(148,163,184,0.15)",borderRadius:8}}>Z키로 닫기</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
              <div style={{background:"rgba(255,255,255,0.03)",padding:14,borderRadius:12,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#93c5fd",marginBottom:6}}>👥 학생 명단</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:6}}>줄바꿈 또는 쉼표로 구분</div>
                <textarea value={studentText} onChange={e=>setStudentText(e.target.value)} placeholder={"홍길동\n이순신\n강감찬"} rows={8}
                  style={{width:"100%",background:T.panelInput,border:`1px solid ${T.panelInputBorder}`,borderRadius:10,padding:10,fontSize:13,color:"#fff",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
                <div style={{fontSize:11,color:"#67e8f9",marginTop:4,fontWeight:600}}>총 {students.length}명</div>
              </div>
              <div style={{background:"rgba(255,255,255,0.03)",padding:14,borderRadius:12,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fca5a5",marginBottom:6}}>🚫 기피관계</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:8}}>한 줄 = 기피 그룹 · 쉼표 구분</div>
                {forbiddenLines.map((line,i)=>(
                  <div key={i} style={{display:"flex",gap:4,marginBottom:6}}>
                    <input value={line} onChange={e=>setForbiddenLines(prev=>prev.map((l,li)=>li===i?e.target.value:l))} placeholder="예: 홍길동, 이순신"
                      style={{flex:1,background:T.panelInput,border:`1px solid ${T.panelInputBorder}`,borderRadius:8,padding:"7px 10px",fontSize:12,color:"#fff",fontFamily:"inherit"}}/>
                    <button onClick={()=>setForbiddenLines(prev=>prev.filter((_,li)=>li!==i))} style={{background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,color:"#fca5a5",cursor:"pointer",padding:"0 10px",fontSize:13}}>✕</button>
                  </div>
                ))}
                <button onClick={()=>setForbiddenLines(prev=>[...prev,""])} style={{background:"transparent",border:"1px dashed rgba(255,255,255,0.2)",borderRadius:8,color:"rgba(255,255,255,0.6)",cursor:"pointer",padding:"8px 12px",fontSize:12,width:"100%",marginTop:2}}>+ 그룹 추가</button>
                <div style={{marginTop:10,fontSize:11,color:"rgba(255,255,255,0.35)",lineHeight:1.6}}>💡 한 그룹 기피 관계 인원이 많아질수록 다양한 자리배치 경우의 수가 줄어듭니다.</div>
              </div>
              <div style={{background:"rgba(255,255,255,0.03)",padding:14,borderRadius:12,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#93c5fd",marginBottom:8}}>⚙️ 교실 설정</div>
                {[["single","📋 한 줄 배치"],["pair","👫 짝꿍 배치"]].map(([v,l])=>(
                  <div key={v} onClick={()=>setMode(v)} style={{padding:"9px 12px",borderRadius:10,marginBottom:6,cursor:"pointer",border:`1.5px solid ${mode===v?"#60a5fa":"rgba(255,255,255,0.1)"}`,background:mode===v?"rgba(96,165,250,0.15)":"transparent",fontSize:13,color:mode===v?"#bfdbfe":"rgba(255,255,255,0.7)",fontWeight:mode===v?600:400}}>{l}</div>
                ))}
                <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:10,marginBottom:4}}>행: <b style={{color:"#fff"}}>{rows}</b></div>
                <input type="range" min={2} max={10} value={rows} onChange={e=>applyGrid(Number(e.target.value),cols)} style={{width:"100%",accentColor:"#60a5fa"}}/>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:6,marginBottom:4}}>열: <b style={{color:"#fff"}}>{cols}</b></div>
                <input type="range" min={2} max={12} value={cols} onChange={e=>applyGrid(rows,Number(e.target.value))} style={{width:"100%",accentColor:"#60a5fa"}}/>
              </div>
              <div style={{background:"rgba(255,255,255,0.03)",padding:14,borderRadius:12,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fbbf24",marginBottom:8}}>🔒 비밀 자리</div>
                <button onClick={()=>{try{localStorage.setItem(SECRET_KEY,JSON.stringify(desks));setSecretDesks(desks);}catch{}setWarning("🔒 비밀 자리 저장됨");}} style={{width:"100%",padding:"9px",borderRadius:10,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#eab308,#ca8a04)",color:"#fff",fontWeight:700,fontSize:12,marginBottom:6}}>💾 비밀 자리 저장 (S)</button>
                <button onClick={()=>randomAssign(true)} style={{width:"100%",padding:"9px",borderRadius:10,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#475569,#334155)",color:"#fff",fontWeight:700,fontSize:12,marginBottom:6}}>🔓 비밀 자리 적용</button>
                <button onClick={clearAssign} style={{width:"100%",padding:"9px",borderRadius:10,border:"1px solid rgba(255,255,255,0.15)",cursor:"pointer",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.7)",fontWeight:600,fontSize:12,marginBottom:12}}>🗑 배정 초기화</button>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",lineHeight:1.9}}>💡 더블클릭 = 🔒 고정<br/>💡 클릭→클릭 = 교체<br/>💡 드래그 = 이동<br/>💡 Ctrl+랜덤 = 비밀자리</div>
              </div>
            </div>
            {warning&&(<div style={{marginTop:14,padding:"12px 14px",background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.35)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#fde68a",fontWeight:600}}>{warning}</span><button onClick={()=>setWarning("")} style={{background:"transparent",border:"none",color:"#fde68a",cursor:"pointer",fontSize:14,padding:0}}>✕</button></div>)}
            {unassigned.length>0&&(<div style={{marginTop:10,padding:"10px 14px",background:"rgba(251,191,36,0.08)",borderRadius:10,border:"1px solid rgba(251,191,36,0.2)"}}><span style={{fontSize:12,color:"#fbbf24",fontWeight:700}}>⚠ 미배정 {unassigned.length}명: </span><span style={{fontSize:12,color:"rgba(255,255,255,0.7)"}}>{unassigned.join(", ")}</span></div>)}
          </div>
        )}

        {/* 교실 */}
        <div style={{background:T.cardBg,borderRadius:18,padding:32,boxShadow:T.shadow,border:`1px solid ${T.cardBorder}`,overflowX:"auto"}}>
          <div style={{background:T.podiumBg,borderRadius:10,padding:"12px 40px",textAlign:"center",color:"#fff",fontWeight:700,fontSize:14,marginBottom:32,width:"fit-content",margin:"0 auto 32px",letterSpacing:2}}>교탁 (칠판)</div>
          <div style={{display:"flex",flexDirection:"column",gap:14,alignItems:"center"}}>
            {desks.map((row,r)=>(
              <div key={r} style={{display:"flex"}}>
                {isPair?(
                  Array.from({length:Math.ceil(cols/2)},(_,pi)=>{
                    const c1=pi*2,c2=pi*2+1,isLast=pi===Math.ceil(cols/2)-1;
                    const pairDeskStyle=(desk,r,c,side)=>{
                      const base=getDeskStyle(desk,r,c);
                      return{...base,borderRadius:side==="left"?"10px 0 0 10px":"0 10px 10px 0",borderRight:side==="left"?"none":base.borderRight,borderLeft:side==="right"?"none":base.borderLeft};
                    };
                    return(
                      <div key={pi} style={{display:"flex",marginRight:isLast?0:22,borderRadius:10,border:`1.5px solid ${T.deskBorder}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(15,23,42,0.05)"}}>
                        <div onClick={()=>handleDeskClick(r,c1)} onDoubleClick={()=>handleDeskDblClick(r,c1)}
                          draggable={row[c1].active&&!!row[c1].student}
                          onDragStart={()=>setDragSrc({r,c:c1})} onDragOver={e=>{e.preventDefault();setDragOver({r,c:c1});}} onDragLeave={()=>setDragOver(null)}
                          onDrop={e=>{e.preventDefault();if(dragSrc){onDrop(r,c1,dragSrc.r,dragSrc.c);setDragSrc(null);setDragOver(null);}}} onDragEnd={()=>{setDragSrc(null);setDragOver(null);}}
                          style={{width:cellW,height:cellH,borderRadius:0,border:"none",borderRight:`1px solid ${T.deskBorder}`,background:!row[c1].active?T.deskInactiveBg:selected?.r===r&&selected?.c===c1?T.selected.bg:dragOver?.r===r&&dragOver?.c===c1?T.drag.bg:row[c1].locked?T.locked.bg:T.deskBg,cursor:row[c1].active?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",transition:"all 0.15s ease",boxSizing:"border-box",userSelect:"none",flexShrink:0,outline:selected?.r===r&&selected?.c===c1?`2px solid ${T.selected.border}`:dragOver?.r===r&&dragOver?.c===c1?`2px solid ${T.drag.border}`:"none",outlineOffset:"-2px"}}>
                          {deskContent(row[c1],r,c1)}{teacherOpen&&toggleBtn(r,c1,row[c1])}
                        </div>
                        {c2<cols&&(
                          <div onClick={()=>handleDeskClick(r,c2)} onDoubleClick={()=>handleDeskDblClick(r,c2)}
                            draggable={row[c2].active&&!!row[c2].student}
                            onDragStart={()=>setDragSrc({r,c:c2})} onDragOver={e=>{e.preventDefault();setDragOver({r,c:c2});}} onDragLeave={()=>setDragOver(null)}
                            onDrop={e=>{e.preventDefault();if(dragSrc){onDrop(r,c2,dragSrc.r,dragSrc.c);setDragSrc(null);setDragOver(null);}}} onDragEnd={()=>{setDragSrc(null);setDragOver(null);}}
                            style={{width:cellW,height:cellH,borderRadius:0,border:"none",background:!row[c2].active?T.deskInactiveBg:selected?.r===r&&selected?.c===c2?T.selected.bg:dragOver?.r===r&&dragOver?.c===c2?T.drag.bg:row[c2].locked?T.locked.bg:T.deskBg,cursor:row[c2].active?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",transition:"all 0.15s ease",boxSizing:"border-box",userSelect:"none",flexShrink:0,outline:selected?.r===r&&selected?.c===c2?`2px solid ${T.selected.border}`:dragOver?.r===r&&dragOver?.c===c2?`2px solid ${T.drag.border}`:"none",outlineOffset:"-2px"}}>
                            {deskContent(row[c2],r,c2)}{teacherOpen&&toggleBtn(r,c2,row[c2])}
                          </div>
                        )}
                      </div>
                    );
                  })
                ):(
                  <div style={{display:"flex",gap:12}}>{row.map((desk,c)=>renderDesk(desk,r,c))}</div>
                )}
              </div>
            ))}
          </div>
          {selected&&(
            <div style={{textAlign:"center",marginTop:22,fontSize:13,color:T.selected.text,fontWeight:600,background:T.selected.bg,padding:"8px 16px",borderRadius:10,width:"fit-content",margin:"22px auto 0",border:`1px solid ${T.selected.border}`}}>
              🔴 &ldquo;{desks[selected.r][selected.c].student||"빈자리"}&rdquo; 선택됨 — 바꿀 자리를 클릭하세요
            </div>
          )}
        </div>
        <div style={{marginTop:14,fontSize:11,color:"#64748b",textAlign:"center",fontWeight:500}}>
          자리 클릭 후 다른 자리 클릭 = 교체 · 드래그 = 이동 · 더블클릭 = 🔒 자리 고정
        </div>
        <div style={{marginTop:6,fontSize:11,color:"#94a3b8",textAlign:"center",fontWeight:400,letterSpacing:1}}>
          created by GIGA mini
        </div>
      </div>
    </div>
  );
}
