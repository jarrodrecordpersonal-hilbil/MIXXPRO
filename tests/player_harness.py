"""Real HTMLVideoElement and player controller; test storage and HTTP bridge.
Uses in-memory storage in place of IndexedDB because the authoring browser cannot
navigate to an origin. This does NOT certify native offline/PWA persistence.
"""
import base64,json,os,re,time,uuid
from pathlib import Path
import httpx
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
client=httpx.Client(base_url=os.getenv('TEST_ORIGIN','http://127.0.0.1:3000'),timeout=30)
assert client.get('/api/config').json().get('demo') is True, 'Refusing to run player fixtures against a non-demo server.'
r=client.post('/api/auth/signup',json={'name':'Player QA','email':'player-'+uuid.uuid4().hex[:8]+'@example.test','password':'sample-player-test-password','venueName':'The Clubhouse','type':'golf','timezone':'America/Chicago'});r.raise_for_status()
s=client.get('/api/session').json();vid=s['venues'][0]['id'];headers={'X-Venue-Id':vid,'X-CSRF-Token':s['csrf']}
pair=client.post('/api/player/pair',json={}).json();r=client.post('/api/tvs/claim',headers=headers,json={'name':'Clubhouse TV','code':pair['code']});r.raise_for_status();tv=r.json()['tvId']
# Create explicit demo content via a separate QA admin script (operator setup).
import sqlite3
con=sqlite3.connect(os.getenv('TEST_DB','/mnt/data/mixxpro-qa.sqlite'));con.execute("UPDATE users SET platform_role='admin' WHERE id=?",(s['user']['id'],));con.commit();con.close()
r=client.post('/api/admin/demo-content',headers=headers,json={});r.raise_for_status()
checks=[];errors=[];connected=True;seat_blocked=False
def log(message):
    checks.append(message);print('PASS',message,flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':900});page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',e,flush=True)))
    def bridge(source,arg):
        if not connected:raise RuntimeError('Simulated connection loss in test harness')
        assert arg['url'].startswith('/') and not arg['url'].startswith('//')
        if seat_blocked and arg['url']=='/api/player/state':
            return {'status':403,'headers':{'content-type':'application/json'},'body':base64.b64encode(b'{"error":"This TV needs an available subscription seat."}').decode()}
        r=client.request(arg.get('method','GET'),arg['url'],headers=arg.get('headers',{}),content=arg.get('body'))
        return {'status':r.status_code,'headers':dict(r.headers),'body':base64.b64encode(r.content).decode()}
    page.expose_binding('__apiBridge',bridge)
    html=re.sub(r'<script.*?</script>','',(ROOT/'apps/player/public/index.html').read_text(),flags=re.S)
    html=re.sub(r'<link[^>]+>','',html)
    page.set_content(html);page.add_style_tag(content=(ROOT/'apps/web/public/style.css').read_text())
    bootstrap="""
    window.fetch=async(input,options={})=>{const r=await __apiBridge({url:String(input),method:options.method||'GET',headers:options.headers||{},body:options.body});return new Response(Uint8Array.from(atob(r.body),c=>c.charCodeAt(0)),{status:r.status,headers:r.headers});};
    if(!crypto.randomUUID)crypto.randomUUID=()=>[4,2,2,2,6].map(n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('')).join('-');
    """
    page.add_script_tag(content=bootstrap)
    storage="""
    const stores={kv:new Map(),events:new Map(),media:new Map()};
    const get=async(s,k)=>stores[s].get(k),put=async(s,v)=>stores[s].set(v.key,v),all=async(s)=>Array.from(stores[s].values()),remove=async(s,k)=>stores[s].delete(k),clear=async(s)=>stores[s].clear();
    """+f"stores.kv.set('credential',{{key:'credential',value:{json.dumps(pair['deviceToken'])}}});\n"
    domain=(ROOT/'packages/domain/src/runtime.mjs').read_text().replace('export ','')
    cache=(ROOT/'apps/player/public/offline.mjs').read_text().split('export async function cachedMedia')[1];cache='async function cachedMedia'+cache.replace('export ','')
    player=re.sub(r'^import .*?;\n','',(ROOT/'apps/player/public/player.mjs').read_text(),flags=re.M)
    hooks="\nwindow.__qaPlayer=()=>({current:current?.title,cached:stores.media.size,events:stores.events.size,online,position:video.currentTime,paused:video.paused,lastCommand,hasCredential:!!credential,seatBlocked});window.__expire=()=>{manifest.expiresAt=0;};"
    print('Mounting real controller',flush=True);page.add_script_tag(content=domain+'\n'+storage+cache+'\n'+player+hooks,type='module');print('Mounted controller',flush=True)
    page.wait_for_function('window.__qaPlayer&&__qaPlayer().cached>0',timeout=20000)
    log('Actual media bytes fetched from local API and stored through cache controller')
    page.wait_for_function('__qaPlayer().position>0.2&&!__qaPlayer().paused',timeout=25000)
    log('Native browser video element plays the downloaded sample MP4')
    page.wait_for_timeout(7000)
    device={'Authorization':'Bearer '+pair['deviceToken']}
    # Remote control travels through persisted API queue, not direct page manipulation.
    r=client.post('/api/commands',headers=headers,json={'ids':[tv],'kind':'pause'});r.raise_for_status()
    page.wait_for_function('__qaPlayer().paused',timeout=12000)
    page.wait_for_timeout(1000)
    assert not client.get('/api/player/state',headers=device).json()['commands']
    log('Cloud pause received and acknowledged by real player controller')
    r=client.post('/api/commands',headers=headers,json={'ids':[tv],'kind':'play'});r.raise_for_status()
    page.wait_for_function('!__qaPlayer().paused',timeout=12000)
    log('Cloud play resumes actual sample video')
    seat_blocked=True
    page.wait_for_function('__qaPlayer().seatBlocked&&__qaPlayer().paused',timeout=12000)
    assert page.evaluate('__qaPlayer().hasCredential')
    log('Subscription-seat block pauses playback without deleting device credentials')
    seat_blocked=False
    page.wait_for_function('!__qaPlayer().seatBlocked&&!__qaPlayer().paused',timeout=12000)
    log('Restored subscription seat resumes the same paired TV without re-pairing')
    connected=False;page.wait_for_timeout(14000)
    assert page.evaluate('__qaPlayer().online') is False
    assert page.evaluate('__qaPlayer().paused') is False
    assert page.evaluate('__qaPlayer().events')>0
    log('Downloaded Blob video continues during simulated HTTP loss')
    log('Offline telemetry is queued in test storage rather than discarded')
    connected=True;page.wait_for_timeout(8000)
    assert page.evaluate('__qaPlayer().online') is True
    log('Player reconnects and resumes API synchronization')
    metrics=client.get('/api/venue',headers=headers).json()['metrics'];assert metrics['seconds']>0,metrics
    log('Actual measured video progress reaches venue analytics')
    page.evaluate("document.getElementById('player-status').textContent='SAMPLE FILM · QA preview'")
    page.screenshot(path=str(OUT/'player-desktop.png'))
    page.evaluate('__expire()');page.wait_for_function("document.getElementById('overlay-title').textContent==='Reconnect to refresh your MIXX.'",timeout=4000)
    assert page.evaluate('__qaPlayer().paused')
    log('Expired offline manifest stops playback instead of claiming a valid license')
    assert not errors,errors
    log('No uncaught JavaScript errors in player controller')
    browser.close()
(OUT/'player-report.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errors,'method':'Actual HTMLVideoElement and player code, actual HTTP API bridged to DOM, in-memory substitute for IndexedDB. Connection loss simulated by bridge. No native storage durability, CDN or physical TV certification.'},indent=2))
for c in checks: print('PASS',c)
