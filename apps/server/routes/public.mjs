/** Public API routes. Authorization remains inside every scoped operation. */
export async function publicRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
      if(method==='GET'&&path.startsWith('/api/public/link/')){
        const code=path.split('/').at(-1),link=db.get('SELECT * FROM qr_links WHERE code=? AND expires_at>?',code,now()),v=link?getVenue(link.venue_id):db.get('SELECT * FROM venues WHERE qr_code=?',code);
        if(!v)fail(404,'This QR link has expired or does not exist.');
        return json(res,200,{venueName:v.name,shopReady:!!config.COMMERCE_URL,requiresAdultConfirmation:true});
      }
      if(method==='POST'&&path==='/api/public/scans'){
        rateLimit(db,`scan:${ip}`,60,60000);
        if(b.age21!==true||b.consent!==true)fail(400,'Please confirm age and attribution consent before continuing.');
        const code=text(b.code,'QR code',40),link=db.get('SELECT * FROM qr_links WHERE code=? AND expires_at>?',code,now()),v=link?getVenue(link.venue_id):db.get('SELECT * FROM venues WHERE qr_code=?',code);
        if(!v)fail(404,'This QR link has expired.');
        const signedCookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mixx_click='))?.slice(11)?.split('.');
        let scanId;
        if(signedCookie?.length===4){const [c,s,t,signature]=signedCookie;if(c===code&&Number(t)>now()-60000&&equal(signature,mac(config.APP_SECRET,`${c}.${s}.${t}`))&&db.get('SELECT id FROM scans WHERE id=?',s))scanId=s;}
        if(!scanId){scanId=id();db.run('INSERT INTO scans VALUES(?,?,?,?,?,?,?)',scanId,v.id,link?.tv_id||null,link?.content_id||null,link?.campaign_id||null,link?.manifest_id||null,now());}
        const base=`${code}.${scanId}.${now()}`;res.setHeader('Set-Cookie',`mixx_click=${base}.${mac(config.APP_SECRET,base)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=60${config.PRODUCTION?'; Secure':''}`);
        return json(res,200,{scanId,url:config.COMMERCE_URL?destinationUrl(config,scanId):null});
      }
      if(method==='GET'&&/^\/qr\/[A-Za-z0-9_-]+\.svg$/.test(path)){
        const code=path.split('/').at(-1).replace('.svg','');if(!db.get('SELECT code FROM qr_links WHERE code=? AND expires_at>?',code,now())&&!db.get('SELECT id FROM venues WHERE qr_code=?',code))fail(404,'QR not found.');
        res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'private, max-age=300'});return res.end(qrSvg(`${config.APP_ORIGIN}/r/${code}`));
      }
}
