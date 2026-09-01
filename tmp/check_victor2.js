const http=require("http");
function post(p,b){return new Promise((res,rej)=>{
  const d=JSON.stringify(b);
  const req=http.request("http://localhost:8080"+p,{method:"POST",headers:{"Content-Type":"application/json"}},r=>{
    let bb="";r.on("data",x=>bb+=x);
    r.on("end",()=>res({s:r.statusCode,j:JSON.parse(bb||"{}")}))
  });
  req.on("error",rej);req.write(d);req.end();
});
(async()=>{
  const trials=[["victor","Victor@2026"],["victor","password"],["Victor","Victor@2026"],["Victor","password"]];
  for(const u of trials){
    let r=await post("/api/login",{username:u[0],password:u[1]});
    console.log(u.join("/"), r.s, r.j.error || r.j.user?.extension || JSON.stringify(r.j).slice(0,80));
  }
})();
