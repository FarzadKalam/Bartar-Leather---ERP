// Isolated, disposable PostgreSQL. Never reads env files or production credentials.
import http from 'node:http';
import { createRequire } from 'node:module';
import { receiptDatabase } from '../fixtures/productionReceiptDatabase.mjs';
const {planProductionReturn}=createRequire(import.meta.url)('../../.tmp-tests/utils/productionReturn.js');
let fixture=await receiptDatabase();
let queue=Promise.resolve();
const server=http.createServer((req,res)=>{
  queue=queue.then(async()=>{
    try {
      if(req.headers.origin && req.headers.origin!=='http://127.0.0.1:3022') throw Error('Invalid preview origin');
      let raw='';for await(const part of req){raw+=part;if(raw.length>100000)throw Error('Request too large');}
      const body=raw?JSON.parse(raw):{};
      const {db,ids,user,stock}=fixture;
      await user(ids[body.actor]||ids.sender);
      let data;
      if(req.url==='/api/state') data={ids,source:await stock(ids.source),stage:await stock(ids.stage),
        transit:Number((await db.query('select coalesce(sum(i.stock),0) n from product_inventory i join production_transit_location t on t.shelf_id=i.shelf_id')).rows[0].n)};
      else if(req.url==='/api/reset'){await db.close();fixture=await receiptDatabase();data=true;}
      else if(req.url==='/api/products') data=[{id:ids.product,main_unit:'فوت مربع'}];
      else if(req.url==='/api/return'){
        const order=(await db.query('select * from production_orders where id=$1',[ids.order])).rows[0];
        const logs=(await db.query('select production_return_history($1,$2) d',[ids.order,order.production_returned_at])).rows[0].d;
        const moves=planProductionReturn(order.production_moves||[],logs);
        if(!moves.length)throw Error('موجودی قابل برگشت برای این سفارش وجود ندارد.');
        await db.query('select commit_production_operation($1)',[JSON.stringify({kind:'return',orders:[{id:ids.order,revision:order.production_revision,patch:{production_moves:null}}],
          moves:moves.map(m=>({product_id:m.product_id,source_shelf_id:m.from_shelf_id,target_shelf_id:m.to_shelf_id,source_bundle_id:m.bundle_id,target_bundle_id:m.target_bundle_id,quantity:m.quantity,new_bundle:false})),
          transfers:moves.map(m=>({transfer_type:'production',production_order_id:ids.order,product_id:m.product_id,delivered_qty:m.quantity,required_qty:m.quantity,from_shelf_id:m.from_shelf_id,to_shelf_id:m.to_shelf_id,source_bundle_id:m.bundle_id,target_bundle_id:m.target_bundle_id,bundle_id:m.target_bundle_id})),factors:{[ids.product]:1}})]);data=true;
      } else if(req.url==='/api/rpc'){
        const a=body.args||{};
        if(body.name==='list_production_receipts')data=(await db.query('select list_production_receipts($1) d',[a.order_ids])).rows[0].d;
        else if(body.name==='save_production_receipt_drafts'){await fixture.save(a.documents);data=null;}
        else if(body.name==='production_receipt_action'){await db.query('select production_receipt_action($1)',[JSON.stringify(a.command)]);data=null;}
        else throw Error('RPC is not part of the isolated preview');
      }else throw Error('Unknown preview endpoint');
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({data,error:null}));
    }catch(e){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({data:null,error:{message:e.message,code:e.code}}));}
  }).catch(()=>{res.end();});
});
server.listen(3023,'127.0.0.1',()=>console.log('Isolated receipt PostgreSQL ready on 127.0.0.1:3023'));
