const http=require('http');
function post(p,b,t){
  return new Promise((res,rej)=>{
    const d=JSON.stringify(b);
    const h={'Content-Type':'application/json'};
    if(t) h['Authorization']='Bearer '+t;
    const req=http.request('http://localhost:8080'+p,{method:'POST',headers:h},r=>{
      let bb='';r.on('data',x=>bb+=x);
      r.on('end',()=>res({s:r.statusCode,j:JSON.parse(bb||'{}')}))
    });
    req.on('error',rej);req.write(d);req.end();
  });
}
(async()=>{
  let r=await post('/api/login',{username:'victor',password:'Victor@2026'});
  console.log('victor',r.j.user?.extension,r.s,r.j.error||'ok');
  r=await post('/api/login',{username:'rose',password:'rose123'});
  console.log('rose rose123',r.s, r.j.error||JSON.stringify(r.j).slice(0,400));
  r=await post('/api/login',{username:'rose',password:'password'});
  console.log('rose password',r.s, (r.j.error||JSON.stringify(r.j)).slice(0,400));
  r=await post('/api/login',{username:'admin',password:'password'});
  console.log('admin',r.j.user?.extension, r.s);
})()
