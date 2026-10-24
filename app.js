'use strict';
const M=SoccerModel,$=id=>document.getElementById(id);
let shots=[],seen=new Set(),timer=null,running=false,generation=0,cursor=0,stream=null,demoId=0,failures=0;
const local=['localhost','127.0.0.1','::1'].includes(location.hostname);
function message(text,state){$('notice').textContent=text;$('connection').textContent=state;}
function formatSpeed(n){if(n===null)return '—';return (n*({kmh:3.6,mps:1,mph:2.2369362921}[$('unit').value])).toFixed(1);}
function render(){
 const s=M.summary(shots),last=shots[shots.length-1],unit={kmh:'km/h',mps:'m/s',mph:'mph'}[$('unit').value];
 $('speed').textContent=formatSpeed(last?.speed_mps??null);$('average').textContent=formatSpeed(s.average);$('count').textContent=s.count;
 $('accuracy').textContent=s.classified?Math.round(100*s.hits/s.classified)+'%':'—';$('accuracy-note').textContent=`${s.hits} hits / ${s.classified} classified shots`;
 document.querySelectorAll('.unit-label').forEach(e=>e.textContent=unit);
 $('result').textContent=last?{hit:'Target hit.',miss:'Keep aiming.',unknown:'Speed recorded.'}[last.result]:'Ready when you are.';
 $('result-description').textContent=last?(last.result==='unknown'?'Target outcome is not available from this prototype.':`Shot ${last.shot_id} • ${last.source==='demo'?'generated demonstration':'received from device'}`):'Start the demonstration or connect the local device.';
 $('selected').textContent=last?.selected_zone??'—';$('detected').textContent=last?.detected_zone??'—';$('validity').textContent=last?.speed_status??'Waiting';$('source').textContent=last?.source??($('mode').value==='demo'?'Demonstration':'Awaiting device');
 document.querySelectorAll('.zone').forEach(e=>{e.classList.toggle('selected',e.dataset.zone===last?.selected_zone);e.classList.toggle('detected',e.dataset.zone===last?.detected_zone);});
 $('rows').replaceChildren();
 if(!shots.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='empty';td.textContent='Your shots will appear here.';tr.append(td);$('rows').append(tr);}
 for(const shot of [...shots].reverse()){
  const tr=document.createElement('tr');[shot.shot_id,formatSpeed(shot.speed_mps)+' '+unit,shot.selected_zone??'—',shot.detected_zone??'—',shot.result,shot.source].forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i===4)td.className=shot.result;tr.append(td);});$('rows').append(tr);
 }
 $('export').disabled=!shots.length;
}
function accept(s){if(!M.validate(s))throw Error('Invalid shot payload');const key=M.key(s);if(seen.has(key))return;shots.push(s);seen.add(key);if(shots.length>200)seen.delete(M.key(shots.shift()));render();}
function reset(){shots=[];seen.clear();render();}
function stop(){running=false;generation++;clearTimeout(timer);$('start').disabled=false;$('pause').disabled=true;}
async function poll(g){
 if(!running||g!==generation)return;
 try{
  const control=new AbortController(),timeout=setTimeout(()=>control.abort(),2000);let r;
  try{r=await fetch('/api/events?after='+cursor,{cache:'no-store',signal:control.signal});}finally{clearTimeout(timeout);}
  if(!running||g!==generation)return;
  if(!r.ok)throw Error('Device connection unavailable');const data=await r.json();
  if(!running||g!==generation)return;
  if(typeof data.stream_id!=='string'||!Number.isSafeInteger(data.cursor)||data.cursor<0||!Array.isArray(data.shots)||data.shots.length>256||!data.shots.every(M.validate))throw Error('Invalid event response');
  if((data.mode!=='sensor'&&data.mode!=='demo')||!data.shots.every(s=>s.source===data.mode))throw Error('Invalid data source');
  if(stream!==null&&stream!==data.stream_id)reset();stream=data.stream_id;
  data.shots.forEach(accept);cursor=data.cursor;failures=0;
  const fault=data.queue_overflows>0?' Sensor queue overflow reported; measurements require review.':'';
  message((data.mode==='demo'?'Local simulator connected. These are generated shots.':'Device connected. Listening for shot results.')+(data.gap?' Some older results were outside the replay buffer.':'')+fault,data.mode==='demo'?'Simulator connected':'Device connected');
 }catch(e){if(!running||g!==generation)return;failures++;message('Connection lost or invalid data. Retrying; previous results remain visible.','Disconnected');}
 if(running&&g===generation)timer=setTimeout(()=>poll(g),failures?Math.min(4000,250*2**failures):250);
}
$('start').addEventListener('click',()=>{
 if($('mode').value==='live'&&!local){message('For a real ESP32, run the included local bridge and open http://127.0.0.1:8000. This hosted preview supports demo mode.','Local bridge required');return;}
 running=true;$('start').disabled=true;$('pause').disabled=false;const g=++generation;
 if($('mode').value==='demo'){
  message('Demonstration running. All shots are generated, not sensor measurements.','Demo running');
  function tick(){if(!running||generation!==g)return;accept(M.demoShot(++demoId));timer=setTimeout(tick,2200);}tick();
 }else{message('Connecting to local bridge…','Connecting');poll(g);}
});
$('pause').addEventListener('click',()=>{stop();message('Paused. Results remain available.','Paused');});
$('clear').addEventListener('click',()=>{reset();message('View cleared. New results will appear when running.','View cleared');});
$('mode').addEventListener('change',()=>{stop();reset();cursor=0;stream=null;failures=0;$('start').textContent=$('mode').value==='demo'?'Start demo':'Connect device';message($('mode').value==='demo'?'Demo mode uses generated shots. No sensor is connected.':'Use the local bridge with --device for Wi-Fi results or --demo for a simulator.','Ready');});
$('unit').addEventListener('change',render);
$('export').addEventListener('click',()=>{
 const fields=['device_id','boot_id','shot_id','source','speed_mps','speed_status','selected_zone','detected_zone','result','device_time_us'];
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const csv=[fields.join(','),...shots.map(s=>fields.map(k=>cell(s[k])).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='soccer-shot-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();
