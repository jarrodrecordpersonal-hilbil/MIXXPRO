/** Auth API routes. Authorization remains inside every scoped operation. */
export async function authRoutes(context){
  const {req,res,path,method,url,ip,b,raw,db,config,uiVersion,json,audit,transaction,readSession,requireSession,access,admin,device,getVenue,schedulesFor,tvRows,issueSession,createVenue,enqueue,summarize,effective,manifest,billing,id,now,types,DEFAULT_MIX,parse,escape,token,hash,mac,equal,passwordHash,verifyPassword,verifyHook,rateLimit,fail,text,integer,choice,mixDefinition,WORLDS,THEMES,hardwareEligible,commission,bunnyUrl,bunnyList,bunnyVideo,r2UploadUrl,destinationUrl,qrSvg}=context;
      const googleReady=!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
      if(method==='GET'&&path==='/api/ui-version')return json(res,200,{version:uiVersion});
      if(method==='GET'&&path==='/api/health')return json(res,200,{ok:true,version:'0.2.0'});
      if(method==='GET'&&path==='/api/config')return json(res,200,{worlds:WORLDS,themes:THEMES,demo:config.DEMO_MODE,signups:config.SIGNUPS_ENABLED,googleReady,mediaReady:!!(config.BUNNY_CDN_HOST&&config.BUNNY_TOKEN_KEY),commerceReady:!!config.COMMERCE_URL,commissionConfigured:config.COMMISSION_BPS>0});
      if(method==='GET'&&path==='/api/auth/google'){
        if(!googleReady)fail(503,'Google sign-in is not configured yet.');
        rateLimit(db,`google-start:${ip}`,30,900000);
        const state=token(24),signature=mac(config.APP_SECRET,state),redirectUri=`${config.APP_ORIGIN}/api/auth/google/callback`;
        res.setHeader('Set-Cookie',`mixx_google_state=${state}.${signature}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=600${config.PRODUCTION?'; Secure':''}`);
        const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,prompt:'select_account'});
        res.writeHead(302,{Location:`https://accounts.google.com/o/oauth2/v2/auth?${params}`,'Cache-Control':'no-store'});return res.end();
      }
      if(method==='GET'&&path==='/api/auth/google/callback'){
        if(!googleReady)fail(503,'Google sign-in is not configured yet.');
        rateLimit(db,`google-callback:${ip}`,30,900000);
        if(url.searchParams.get('error')){res.writeHead(302,{Location:'/?google=cancelled','Cache-Control':'no-store'});return res.end();}
        const code=url.searchParams.get('code')||'',state=url.searchParams.get('state')||'';
        const saved=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mixx_google_state='))?.slice(18)?.split('.')||[];
        const validState=saved.length===2&&equal(saved[0],state)&&equal(saved[1],mac(config.APP_SECRET,state));
        res.setHeader('Set-Cookie',`mixx_google_state=; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=0${config.PRODUCTION?'; Secure':''}`);
        if(!code||!validState)fail(403,'Google sign-in session expired. Please try again.');
        const redirectUri=`${config.APP_ORIGIN}/api/auth/google/callback`;
        const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code'})});
        if(!tokenResponse.ok)fail(401,'Google could not complete sign-in. Please try again.');
        const tokens=await tokenResponse.json();if(!tokens.id_token)fail(401,'Google did not return a valid identity.');
        const infoResponse=await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
        if(!infoResponse.ok)fail(401,'Google identity verification failed.');
        const profile=await infoResponse.json();
        if(profile.aud!==process.env.GOOGLE_CLIENT_ID||profile.email_verified!=='true'||!profile.email)fail(401,'A verified Google email is required.');
        const email=String(profile.email).trim().toLowerCase(),name=String(profile.name||profile.given_name||email.split('@')[0]).slice(0,80);
        let user=db.get('SELECT * FROM users WHERE email=?',email),venue=null;
        if(!user){
          if(!config.SIGNUPS_ENABLED)fail(403,'New account creation is temporarily unavailable.');
          const userId=id(),pw=await passwordHash(token(32));
          transaction(()=>{db.run('INSERT INTO users(id,email,password_hash,name,created_at) VALUES(?,?,?,?,?)',userId,email,pw,name,now());venue=createVenue(userId,{name:`${String(profile.given_name||name).slice(0,50)}'s Venue`,type:'other',timezone:'America/Chicago'});});
          user=db.get('SELECT * FROM users WHERE id=?',userId);audit(userId,venue.id,'signup.google');
        }
        issueSession(res,user.id);audit(user.id,venue?.id||null,'login.google');res.writeHead(302,{Location:'/?google=ok','Cache-Control':'no-store'});return res.end();
      }
      if(method==='POST'&&path==='/api/auth/signup'){
        if(!config.SIGNUPS_ENABLED)fail(403,'Signups are currently invitation-only.');rateLimit(db,`signup:${ip}`,10,3600000);
        const email=text(b.email,'Email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.');
        const password=text(b.password,'Password',200);if(password.length<12)fail(400,'Use at least 12 characters for your password.');
        const name=text(b.name,'Your name',80),pw=await passwordHash(password),userId=id();
        if(db.get('SELECT id FROM users WHERE email=?',email))fail(409,'This email cannot be registered. Try signing in.');
        const venue=transaction(()=>{db.run('INSERT INTO users(id,email,password_hash,name,created_at) VALUES(?,?,?,?,?)',userId,email,pw,name,now());return createVenue(userId,{...b,name:b.venueName});});
        issueSession(res,userId);audit(userId,venue.id,'signup');return json(res,201,{venueId:venue.id});
      }
      if(method==='POST'&&path==='/api/auth/login'){
        rateLimit(db,`login:${ip}`,30,900000);const email=text(b.email,'Email',254).toLowerCase(),password=text(b.password,'Password',200);
        rateLimit(db,`account:${hash(email)}`,15,900000);
        const user=db.get('SELECT * FROM users WHERE email=?',email);
        const valid=await verifyPassword(password,user?.password_hash||`${'0'.repeat(22)}:${'0'.repeat(128)}`);
        if(!user||!valid)fail(401,'Email or password is incorrect.');issueSession(res,user.id);return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/auth/logout'){
        const user=requireSession(req);if(!equal(req.headers['x-csrf-token'],user.csrf))fail(403,'Refresh the page and try again.');db.run('DELETE FROM sessions WHERE token_hash=?',user.token_hash);res.setHeader('Set-Cookie','mixx_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');return json(res,200,{ok:true});
      }
      if(method==='GET'&&path==='/api/session'){
        const u=requireSession(req);return json(res,200,{user:{id:u.id,name:u.name,email:u.email,role:u.platform_role},csrf:u.csrf,venues:db.all('SELECT v.id,v.name,m.role FROM venues v JOIN members m ON m.venue_id=v.id WHERE m.user_id=? ORDER BY v.created_at',u.id)});
      }
      if(method==='POST'&&path==='/api/venues'){
        const user=requireSession(req);if(db.get('SELECT COUNT(*) c FROM members WHERE user_id=? AND role=\'owner\'',user.id).c>=25)fail(409,'Contact support to add more venues.');const v=transaction(()=>createVenue(user.id,b));return json(res,201,{venueId:v.id});
      }
      if(method==='GET'&&path==='/api/venue'){
        const {venue,role}=access(req);return json(res,200,{venue,role,tvs:tvRows(venue.id),metrics:summarize(venue.id),schedules:schedulesFor(venue.id),promotions:db.all('SELECT * FROM promotions WHERE venue_id=? ORDER BY created_at DESC',venue.id),contracts:db.all('SELECT * FROM contracts WHERE venue_id=? ORDER BY created_at DESC',venue.id)});
      }
      if(method==='PATCH'&&path==='/api/venue'){
        const {venue,user}=access(req,true);const name=b.name===undefined?venue.name:text(b.name,'Venue name',80),theme=b.theme===undefined?venue.theme:choice(b.theme,THEMES.map(t=>t.id),'theme');
        const accent=b.accent??venue.accent;if(!/^#[a-fA-F0-9]{6}$/.test(accent))fail(400,'Choose a valid accent color.');
        const mix=b.mix?mixDefinition(b.mix):venue.mix;db.run('UPDATE venues SET name=?,theme=?,accent=?,mix=? WHERE id=?',name,theme,accent,JSON.stringify(mix),venue.id);audit(user.id,venue.id,'venue.updated');return json(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/api/members'){
        const {user,venue,role}=access(req,true);if(role!=='owner')fail(403,'Only the venue owner can change access.');
        const member=db.get('SELECT id FROM users WHERE email=?',text(b.email,'Email',254).toLowerCase());if(!member)fail(404,'Ask this person to create their account before adding them.');
        if(member.id===user.id)fail(400,'You cannot change your own owner role.');
        db.run('INSERT INTO members VALUES(?,?,?) ON CONFLICT(venue_id,user_id) DO UPDATE SET role=excluded.role',venue.id,member.id,choice(b.role,['manager','viewer'],'role'));audit(user.id,venue.id,'member.updated',{id:member.id});return json(res,200,{ok:true});
      }
}
