import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { createApp } from '../server.mjs';
import { compatibleModels, decisionRequest, distribution } from '../public/contract.js';
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
test('contract: discover explicit capabilities, never virtual models', () => {
  assert.deepEqual(compatibleModels({data:[{id:'mesh',capabilities:['system_one']},{id:'chat'},{id:'laya',capabilities:['system_one']}]}).map(m=>m.id), ['laya']);
  assert.throws(() => compatibleModels({}));
});
test('contract: both request modes, validation and hostile labels', () => {
  const base = {model:'laya',state:'hello',instructions:'Is this a greeting?',mode:'noul'};
  assert.equal(decisionRequest(base).questions.decision.type, 'noul');
  assert.equal(decisionRequest({...base,mode:'choice',choices:'yes\nno'}).questions.decision.criteria.yes, 'yes');
  assert.throws(()=>decisionRequest({...base,model:'mesh'}));
  assert.throws(()=>decisionRequest({...base,state:' '}));
  assert.throws(()=>decisionRequest({...base,mode:'choice',choices:'yes\nyes'}));
  assert.equal(Object.keys(decisionRequest({...base,mode:'choice',choices:'__proto__\nother'}).questions.decision.criteria).length,2);
});
test('contract: real response shapes and invalid probabilities', () => {
  assert.deepEqual(distribution({answers:{decision:{type:'noul',noul:.75}}}),[['Yes',.75],['No',.25]]);
  assert.deepEqual(distribution({answers:{decision:{type:'choice',probabilities:{a:.2,b:.8}}}}),[['b',.8],['a',.2]]);
  assert.throws(()=>distribution({answers:{decision:{type:'noul',noul:null}}}));
  assert.throws(()=>distribution({answers:{decision:{type:'noul',noul:2}}}));
});
test('proxy allowlist, browser boundaries, limits and upstream failures', async t => {
  let received;
  const upstream = createServer(async (req,res)=>{
    const chunks=[]; for await(const c of req) chunks.push(c);
    received={path:req.url,body:Buffer.concat(chunks).toString()};
    res.setHeader('Content-Type','application/json');
    if(req.url === '/v1/models') return res.end('{"data":[]}');
    const data=JSON.parse(received.body);
    if(data.fail){res.writeHead(404); return res.end('{}');}
    if(data.invalid) return res.end('not json');
    if(data.slow) return setTimeout(()=>res.end('{}'),100);
    res.end(JSON.stringify({answers:{decision:{type:'noul',noul:.9}}}));
  });
  const origin=await listen(upstream);
  const app=createApp({upstream:origin,timeout:40}); const base=await listen(app);
  t.after(()=>{app.closeAllConnections();app.close();upstream.closeAllConnections();upstream.close();});
  assert.equal((await fetch(base)).status,200);
  assert.deepEqual(await (await fetch(`${base}/api/models`)).json(),{data:[]});
  assert.equal(received.path,'/v1/models');
  const post = body=>fetch(`${base}/api/decision`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post({state:'hello'})).status,200); assert.equal(received.path,'/systemone');
  assert.equal((await post({fail:true})).status,404);
  assert.equal((await post({invalid:true})).status,502);
  assert.equal((await post({slow:true})).status,502);
  assert.equal((await post({text:'x'.repeat(130*1024)})).status,413);
  assert.equal((await fetch(`${base}/api/decision`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await fetch(`${base}/api/decision`,{method:'POST',body:'{}'})).status,415);
  assert.equal((await fetch(`${base}/api/models`,{headers:{Origin:'http://evil.example'}})).status,403);
  assert.equal(await new Promise(resolve => get(`${base}/api/models`, {headers:{Host:'evil.example'}}, res => {res.resume(); resolve(res.statusCode);})),403);
  assert.equal((await fetch(`${base}/api/models?url=http://evil.example`)).status,404);
  assert.equal((await fetch(`${base}/server.mjs`)).status,404);
  assert.throws(()=>createApp({upstream:'http://example.com/v1'}));
});
