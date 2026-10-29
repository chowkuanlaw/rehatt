'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('../check-windows.cjs');
test('Windows check skips unrelated windows and never prints conversation content', async () => {
  const logs = [], actions = [];
  const worker = { request: async (method, args) => {
    actions.push(method);
    if (method === 'windows') return { ok:true, windows:[{id:'other'},{id:'ai'}] };
    if (args.target.id === 'other') return {ok:false};
    return {ok:true,provider:'chatgpt',contextKey:'context',nodes:[
      {index:0,id:'doc',type:'Document'},
      {index:1,id:'marker',type:'Text',name:'ChatGPT said:'},
      {index:2,id:'answer',type:'Text',name:'PRIVATE CONVERSATION'},
      {index:3,id:'copy',type:'Button',name:'Copy',enabled:true},
      {index:4,id:'input',type:'Edit',automationId:'prompt-textarea',enabled:true}
    ]};
  }};
  assert.deepEqual(await check(worker,line=>logs.push(line)),{identified:1,readable:1});
  assert.equal(logs.join('\n').includes('PRIVATE CONVERSATION'),false);
  assert.match(logs.join('\n'),/input field found/);
  assert.deepEqual(actions,['windows','read','read']);
});
test('Windows check rejects worker startup failure', async () => {
  await assert.rejects(check({request:async()=>({ok:false,error:'Startup failure'})},()=>{}),/Startup failure/);
});
