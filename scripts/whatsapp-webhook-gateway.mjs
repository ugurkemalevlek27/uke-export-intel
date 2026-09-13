import {createServer} from 'node:http';

// Only this callback is forwarded. CRM, sessions and other API routes are unreachable here.
const path='/api/integrations/whatsapp/20/webhook';
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname!==path || !['GET','POST'].includes(req.method)) {res.writeHead(404).end();return;}
    const chunks=[]; let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>262144){res.writeHead(413).end();return;}chunks.push(chunk);}
    const headers={'content-type':'application/json'};
    if(typeof req.headers['x-hub-signature-256']==='string') headers['x-hub-signature-256']=req.headers['x-hub-signature-256'];
    const response=await fetch(`http://127.0.0.1:3001${path}${url.search}`,{method:req.method,headers,
      body:req.method==='POST'?Buffer.concat(chunks):undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});
    res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'text/plain'});
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.writeHead(502).end('webhook_upstream_unavailable');}
});
server.requestTimeout=25000;
server.listen(5679,'127.0.0.1',()=>console.log('WhatsApp-only gateway: http://127.0.0.1:5679'));
