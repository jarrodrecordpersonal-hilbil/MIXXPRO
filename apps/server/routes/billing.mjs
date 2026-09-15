/** Billing API routes. Authorization remains inside every scoped operation. */
export async function billingRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
      if(method==='GET'&&path==='/api/billing'){
        const {venue}=access(req);const plans=[{id:'free',name:'Free',amount:0,available:true}];
        for(const [key,name]of [['paid','Ad-free'],['premium','Premium clean']]){
          const priceId=config[`STRIPE_PRICE_${key.toUpperCase()}`];let amount=null,available=false;
          if(priceId&&config.STRIPE_SECRET_KEY){const p=await billing(config,`prices/${encodeURIComponent(priceId)}`);if(p.active&&p.currency==='usd'&&p.recurring?.interval==='month'&&p.billing_scheme==='per_unit'&&Number.isSafeInteger(p.unit_amount)){amount=p.unit_amount;available=true;}}
          plans.push({id:key,name,amount,available});
        }return json(res,200,{plan:venue.plan,seats:venue.seats,tvCount:tvRows(venue.id).length,plans,connected:!!config.STRIPE_SECRET_KEY,subscription:!!venue.stripe_subscription&&!['canceled','incomplete_expired'].includes(venue.billing_status)});
      }
      if(method==='POST'&&path==='/api/billing/checkout'){
        const {venue,user,role}=access(req,true);if(role!=='owner')fail(403,'Only the venue owner can change billing.');
        const plan=choice(b.plan,['paid','premium'],'plan'),seats=integer(b.seats,'TV seats',Math.max(1,tvRows(venue.id).length),100);
        if(venue.stripe_subscription&&!['canceled','incomplete_expired'].includes(venue.billing_status))fail(409,'Manage your existing subscription in the billing portal.');
        const price=config[`STRIPE_PRICE_${plan.toUpperCase()}`];if(!price)fail(503,'This plan is not priced yet. No payment has been taken.');
        let pending=db.get('SELECT * FROM billing_requests WHERE venue_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1',venue.id,now()-3600000);
        if(pending&&(pending.plan!==plan||pending.seats!==seats))fail(409,'Finish or let the existing checkout expire before choosing a different plan.');
        if(pending?.url)return json(res,200,{url:pending.url});
        if(!pending){pending={id:id(),plan,seats,created_at:now()};db.run('INSERT INTO billing_requests VALUES(?,?,?,?,?,?)',pending.id,venue.id,plan,seats,null,pending.created_at);}
        const p={mode:'subscription','line_items[0][price]':price,'line_items[0][quantity]':String(seats),success_url:`${config.APP_ORIGIN}/?billing=success`,cancel_url:`${config.APP_ORIGIN}/?billing=cancelled`,client_reference_id:venue.id,'subscription_data[metadata][venue_id]':venue.id,'metadata[venue_id]':venue.id,expires_at:String(Math.floor((pending.created_at+3600000)/1000))};
        if(venue.stripe_customer)p.customer=venue.stripe_customer;else p.customer_email=user.email;
        const checkout=await billing(config,'checkout/sessions',p,`checkout:${pending.id}`);
        db.run('UPDATE billing_requests SET url=? WHERE id=?',checkout.url,pending.id);return json(res,200,{url:checkout.url});
      }
      if(method==='POST'&&path==='/api/billing/portal'){
        const {venue,role}=access(req,true);if(role!=='owner')fail(403,'Owner access required.');if(!venue.stripe_customer)fail(409,'No billing account is connected.');
        return json(res,200,await billing(config,'billing_portal/sessions',{customer:venue.stripe_customer,return_url:config.APP_ORIGIN}));
      }
      if(method==='POST'&&path==='/api/hooks/stripe'){
        verifyHook(raw,req.headers['stripe-signature'],config.STRIPE_WEBHOOK_SECRET);
        if(db.get('SELECT event_id FROM hooks WHERE event_id=?','stripe:'+text(b.id,'Event ID',100)))return json(res,200,{duplicate:true});
        if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(b.type)){
          const sub=await billing(config,`subscriptions/${encodeURIComponent(b.data?.object?.id||'')}`),venueId=sub.metadata?.venue_id;
          const v=db.get('SELECT * FROM venues WHERE id=?',venueId||'');if(!v)fail(400,'Subscription venue is missing.');
          if(v.stripe_subscription&&v.stripe_subscription!==sub.id&&!['canceled','incomplete_expired'].includes(v.billing_status))fail(409,'A different subscription is already associated with this venue.');
          const item=sub.items?.data?.[0],price=item?.price?.id,paid=price===config.STRIPE_PRICE_PAID,premium=price===config.STRIPE_PRICE_PREMIUM;
          if(!paid&&!premium)fail(400,'Unrecognized subscription price.');
          const active=['active','trialing'].includes(sub.status),plan=active?(premium?'premium':'paid'):'free',seats=active?integer(item.quantity,'Seats',1,100):config.FREE_TV_LIMIT;
          transaction(()=>{db.run('UPDATE venues SET stripe_subscription=?,stripe_customer=?,billing_status=?,plan=?,seats=? WHERE id=?',sub.id,typeof sub.customer==='string'?sub.customer:sub.customer.id,sub.status,plan,seats,v.id);db.run('INSERT INTO hooks VALUES(?,?,?)','stripe:'+b.id,'stripe',now());tvRows(v.id).forEach(t=>enqueue(t.id,'refresh'));});
        }else db.run('INSERT INTO hooks VALUES(?,?,?)','stripe:'+b.id,'stripe-ignored',now());return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/hooks/order'){
        verifyHook(raw,req.headers['x-mixx-signature'],config.COMMERCE_WEBHOOK_SECRET);
        const eventId=text(b.eventId,'Event ID',100),orderId=text(b.orderId,'Order ID',120);
        if(db.get('SELECT event_id FROM hooks WHERE event_id=?','order:'+eventId))return json(res,200,{duplicate:true});
        choice(b.currency,['USD'],'currency');choice(b.status,['settled','refunded'],'order status');
        const net=integer(b.netMerchandiseCents,'Net merchandise amount',0,100000000),refund=integer(b.refundedCents??0,'Cumulative refund',0,net);
        const scan=db.get('SELECT * FROM scans WHERE id=?',text(b.scanId,'Scan ID',80));if(!scan)fail(400,'The order needs a valid MIXXPRO scan ID.');
        transaction(()=>{
          const existing=db.get('SELECT * FROM orders WHERE external_id=?',orderId);
          if(existing&&(existing.scan_id!==scan.id||existing.net_cents!==net))fail(409,'Order identity and original merchandise amount cannot change.');
          const bps=existing?.commission_bps??config.COMMISSION_BPS;
          if(existing&&refund<existing.refund_cents)fail(409,'An older refund snapshot cannot reverse a newer one.');
          const before=existing?commission(net,existing.refund_cents,bps):0,after=commission(net,refund,bps),delta=after-before;
          if(existing)db.run('UPDATE orders SET refund_cents=? WHERE external_id=?',refund,orderId);else db.run('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?)',orderId,scan.id,scan.venue_id,net,refund,bps,'USD',now());
          if(delta)db.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)',id(),scan.venue_id,orderId,delta>0?'commission':'refund',delta,'USD','order:'+eventId,now());
          db.run('INSERT INTO hooks VALUES(?,?,?)','order:'+eventId,'order',now());
        });return json(res,200,{ok:true});
      }
}
