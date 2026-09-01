const WebSocket = require('ws');
const http = require('http');
const BACKEND='http://localhost:8080';
function post(path, body, token){
  return new Promise((resolve,reject)=>{
    const d=JSON.stringify(body);
    const h={'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)};
    if(token) h['Authorization']='Bearer '+token;
    const req=http.request(BACKEND+path,{method:'POST',headers:h},r=>{
      let b='';r.on('data',x=>b+=x);r.on('end',()=>resolve({status:r.statusCode, body:JSON.parse(b||'{}'), raw:b}))
    });
    req.on('error',reject);req.write(d);req.end();
  });
}
async function login(u,p){
  const r=await post('/api/login',{username:u,password:p});
  if(!r.body.token) throw new Error(`login ${u} failed ${r.status} ${r.raw}`);
  console.log(`[LOGIN] ${u} ext=${r.body.user.extension} token_ok`);
  return r.body;
}
class WSClient{
  constructor(ext, token, name){
    this.ext=ext; this.name=name; this.messages=[];
    this.ws=new WebSocket(`ws://localhost:8080/ws?extension=${ext}&token=${encodeURIComponent(token)}`);
    this.ws.on('open',()=>console.log(`[WS:${name}:${ext}] OPEN`));
    this.ws.on('close',(c,r)=>console.log(`[WS:${name}:${ext}] CLOSE ${c} ${r}`));
    this.ws.on('error',e=>console.log(`[WS:${name}:${ext}] ERROR ${e.message}`));
    this.ws.on('message',d=>{
      const m=JSON.parse(d.toString());
      console.log(`[WS:${name}:${ext}] <= ${m.type} ${JSON.stringify(m).slice(0,300)}`);
      this.messages.push(m);
    });
  }
  waitFor(type, timeout=10000){
    const found=this.messages.find(m=>m.type===type);
    if(found) return Promise.resolve(found);
    return new Promise((res,rej)=>{
      const iv=setInterval(()=>{
        const f=this.messages.find(m=>m.type===type);
        if(f){clearInterval(iv);clearTimeout(to);res(f);}
      },100);
      const to=setTimeout(()=>{clearInterval(iv);rej(new Error(`timeout ${this.name}:${this.ext} waiting ${type}`))},timeout);
    });
  }
  send(obj){ console.log(`[WS:${this.name}:${this.ext}] => ${obj.type} to=${obj.to}`); this.ws.send(JSON.stringify(obj)); }
  close(){try{this.ws.close();}catch(e){}}
}
(async()=>{
  console.log('=== TRACE START 9276(victor) -> 1167(rose) ===');
  console.log('NOTE: This is WebRTC mode (backend hub). No SIP INVITE to Asterisk expected.');
  const victor=await login('victor','password');
  const rose=await login('rose','password');
  console.log(`\n[CHECK] victor ext=${victor.user.extension} rose ext=${rose.user.extension}`);
  const vc=new WSClient(victor.user.extension, victor.token, 'victor');
  const rc=new WSClient(rose.user.extension, rose.token, 'rose');
  await Promise.all([vc.waitFor('welcome'), rc.waitFor('welcome')]);
  console.log('[CHECK] Both WS connected, backend hub relay ready');
  // check network WS URL
  console.log('[NETWORK] WS URL ws://localhost:8080/ws?extension=&token=  (same for https via wss://192.168.1.8:8443/ws)');
  // initiate
  console.log('\n[STEP] POST /protected/call/initiate?method=webrtc target=1167');
  const init=await post('/protected/call/initiate?method=webrtc',{target_extension:rose.user.extension, media:'audio'}, victor.token);
  console.log(`[NETWORK] POST status=${init.status} body=${JSON.stringify(init.body).slice(0,500)}`);
  if(init.status!==200) throw new Error('initiate failed');
  const callId=init.body.call_id;
  console.log(`[CHECK] Initiate success call_id=${callId}`);
  // invitation
  console.log('\n[STEP] Waiting for rose to receive webrtc_call_invitation');
  const inv=await rc.waitFor('webrtc_call_invitation');
  console.log(`[CHECK] 1167 received INVITATION from ${inv.caller_extension} (SIP INVITE? NO - this is backend WS invitation)`);
  const initiated=await vc.waitFor('webrtc_call_initiated').catch(()=>null);
  console.log(`[CHECK] 9276 received webrtc_call_initiated? ${initiated? 'YES':'NO - but not required'}`);
  // SDP
  console.log('\n[STEP] SDP offer/answer via backend WS (not SIP SDP)');
  vc.send({type:'webrtc_offer', to:rose.user.extension, sdp:'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', call_id:callId});
  const offer=await rc.waitFor('webrtc_offer');
  console.log(`[CHECK] SDP offer relayed victor->rose OK`);
  rc.send({type:'webrtc_answer', to:victor.user.extension, sdp:'v=0 answer', call_id:callId});
  const answer=await vc.waitFor('webrtc_answer');
  console.log(`[CHECK] SDP answer relayed rose->victor OK`);
  // ICE
  console.log('\n[STEP] ICE candidates');
  vc.send({type:'webrtc_ice_candidate', to:rose.user.extension, candidate:'candidate:1 1 udp 2122260223 192.168.1.8 5000 typ host', call_id:callId});
  await rc.waitFor('webrtc_ice_candidate');
  console.log('[CHECK] ICE victor->rose OK');
  rc.send({type:'webrtc_ice_candidate', to:victor.user.extension, candidate:'candidate:2 1 udp 2122260223 192.168.1.8 5001 typ host', call_id:callId});
  await vc.waitFor('webrtc_ice_candidate');
  console.log('[CHECK] ICE rose->victor OK');
  // hangup
  console.log('\n[STEP] Hangup');
  vc.send({type:'webrtc_call_ended', to:rose.user.extension, channel:callId});
  await rc.waitFor('webrtc_call_ended');
  console.log('[CHECK] Hangup delivered');
  console.log('\n=== TRACE COMPLETE ===');
  console.log('CONCLUSION: Backend hub relay for 9276->1167 works end-to-end (initiate, invitation, SDP, ICE, hangup) all via WS.');
  console.log('SIP INVITE to Asterisk: NOT SENT (expected for WebRTC mode)');
  console.log('Asterisk SIP responses 100/180/200: N/A (bypassed)');
  console.log('getUserMedia: CANNOT be tested from Node - must check browser console: navigator.mediaDevices.getUserMedia({audio:true})');
  vc.close(); rc.close();
  process.exit(0);
})().catch(e=>{console.error('TRACE FAIL', e.message); process.exit(1)});
