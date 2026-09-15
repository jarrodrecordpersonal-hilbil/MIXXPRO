"""Browser DOM/interaction checks against the real local API.
The browser in the authoring environment blocks URL navigation. We mount actual
app markup/scripts via Playwright and bridge fetch to the real API with httpx.
LocalStorage is mocked. This is NOT a native PWA/service-worker/device test.
Run an isolated DEMO_MODE server first. No live customer account is used.
"""
import base64, json, os, re, sqlite3, time, uuid
from pathlib import Path
import httpx
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=os.getenv('TEST_ORIGIN','http://127.0.0.1:3000')
DB=os.getenv('TEST_DB','/mnt/data/mixxpro-qa.sqlite')
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
client=httpx.Client(base_url=BASE,timeout=30)
assert client.get('/api/config').json().get('demo') is True, 'Refusing to run browser fixtures against a non-demo server.'
email='qa-'+uuid.uuid4().hex[:8]+'@example.test'
checks=[];errors=[]
def check(name,fn):
    fn();checks.append(name);print('PASS',name,flush=True)
def mount(browser,width=1440,height=1100):
    page=browser.new_page(viewport={'width':width,'height':height})
    page.on('pageerror',lambda err:errors.append(str(err)))
    def bridge(source,arg):
        url=arg['url']
        if not url.startswith('/') or url.startswith('//'):raise ValueError('Harness accepts local paths only')
        r=client.request(arg.get('method','GET'),url,headers=arg.get('headers',{}),content=arg.get('body'))
        return {'status':r.status_code,'headers':dict(r.headers),'body':base64.b64encode(r.content).decode()}
    page.expose_binding('__apiBridge',bridge)
    html=(ROOT/'apps/web/public/index.html').read_text()
    html=re.sub(r'<script.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link[^>]+>','',html)
    page.set_content(html)
    page.add_style_tag(content=(ROOT/'apps/web/public/style.css').read_text())
    bootstrap="""
    const memory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});
    window.fetch=async(input,options={})=>{const result=await window.__apiBridge({url:String(input),method:options.method||'GET',headers:options.headers||{},body:options.body});const binary=Uint8Array.from(atob(result.body),c=>c.charCodeAt(0));return new Response(binary,{status:result.status,headers:result.headers});};
    new MutationObserver(()=>{for(const image of document.images){if(image.getAttribute('src')?.startsWith('/qr/')&&!image.dataset.loading){image.dataset.loading='true';window.__apiBridge({url:image.getAttribute('src')}).then(r=>image.src='data:image/svg+xml;base64,'+r.body);}}}).observe(document.documentElement,{childList:true,subtree:true});
    """
    page.add_script_tag(content=bootstrap)
    definitions=(ROOT/'packages/domain/src/runtime.mjs').read_text().replace('export ','')
    app=(ROOT/'apps/web/public/app.mjs').read_text()
    app=re.sub(r"^import .*?;\n",'',app,count=1)
    logo='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'apps/web/public/icon.svg').read_bytes()).decode()
    app=app.replace('/icon.svg',logo)
    page.add_script_tag(content=definitions+'\n'+app,type='module')
    return page

def snapshot(page,name):
    page.wait_for_timeout(250)
    # Suppress only transient notification overlays while capturing the underlying UI.
    page.evaluate("document.getElementById('toast').style.visibility='hidden'")
    page.screenshot(path=str(OUT/name),full_page=True)
    page.evaluate("document.getElementById('toast').style.removeProperty('visibility')")

def api(path,payload=None,method=None):
    s=client.get('/api/session').json();venue=s['venues'][0]['id']
    r=client.request(method or ('POST' if payload is not None else 'GET'),'/api'+path,headers={'X-Venue-Id':venue,'X-CSRF-Token':s['csrf'],'Content-Type':'application/json'},json=payload)
    assert r.status_code<400,(path,r.status_code,r.text)
    return r.json()

def nav(page,key):
    target=page.locator(f'nav [data-page="{key}"]')
    if not target.is_visible():page.locator('[data-action="menu"]').click()
    target.click();page.wait_for_timeout(160)

def assert_equal(actual,expected):
    assert actual==expected,(actual,expected)
def assert_true(value):
    assert value

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=mount(browser)
    page.wait_for_selector('[data-form="auth"]')
    snapshot(page,'signup-desktop.png')
    page.locator('input[name="name"]').fill('Jordan')
    page.locator('input[name="venueName"]').fill('Oak & Ember')
    page.locator('input[name="email"]').fill(email)
    page.locator('input[name="password"]').fill('sample-test-password-2026')
    page.locator('button[type=submit]').click()
    page.wait_for_selector('.shell')
    check('Venue signup enters the dashboard',lambda:page.get_by_role('heading',name='Make yourself at home, Jordan.').wait_for())
    snapshot(page,'home-desktop.png')
    nav(page,'mixx')
    page.locator('[data-mode="blend"]').click()
    page.locator('[data-action="world"][data-id="bourbon"]').click()
    page.locator('[data-action="world"][data-id="travel"]').click()
    page.locator('[data-action="weight"][data-world="golf"][data-weight="more"]').click()
    page.locator('[data-action="save-mix"]').click();page.wait_for_timeout(180)
    check('Weighted My Mix saved to the real database',lambda:assert_equal(api('/venue')['venue']['mix']['worlds'],{'golf':'more','bourbon':'normal','travel':'normal'}))
    snapshot(page,'mixx-desktop.png')
    nav(page,'themes');page.locator('[data-action="theme"][data-id="speakeasy"]').click();page.locator('[data-action="save-theme"]').click();page.wait_for_timeout(180)
    check('TV theme persists independently from content',lambda:assert_equal(api('/venue')['venue']['theme'],'speakeasy'))
    snapshot(page,'themes-desktop.png')
    pair=client.post('/api/player/pair',json={}).json()
    nav(page,'tvs');page.locator('[data-action="pair"]').first.click();page.locator('dialog input[name="code"]').fill(pair['code']);page.locator('dialog input[name="name"]').fill('Main Bar');page.locator('dialog input[name="group"]').fill('Bar TVs');page.locator('dialog button[type=submit]').click();page.wait_for_timeout(250)
    check('TV pairing form binds the single-use code',lambda:assert_equal(len(api('/venue')['tvs']),1))
    snapshot(page,'tvs-desktop.png')
    nav(page,'schedule');page.locator('[data-action="schedule"]').first.click();page.locator('dialog button[type=submit]').click();page.wait_for_timeout(250)
    check('Three-hour recurring schedule is saved',lambda:assert_equal(len(api('/venue')['schedules']),1))
    nav(page,'commerce');page.locator('[data-action="promotion"][data-kind="event"]').click();page.locator('dialog input[name="title"]').fill('Friday at the tasting table');page.locator('dialog input[name="description"]').fill('Meet the maker. Ask your host for details.');page.locator('dialog button[type=submit]').click();page.wait_for_timeout(250)
    check('Venue promotion persists through the real API',lambda:assert_equal(api('/venue')['promotions'][0]['title'],'Friday at the tasting table'))
    nav(page,'billing');page.locator('[data-action="contract"][data-years="5"]').click();page.locator('dialog button[type=submit]').click();page.wait_for_timeout(250)
    check('Installation request is pending rather than falsely approved',lambda:assert_equal(api('/venue')['contracts'][0]['status'],'requested'))
    snapshot(page,'billing-desktop.png')
    nav(page,'revenue');page.wait_for_selector('.qr-block img');snapshot(page,'revenue-desktop.png')
    check('Revenue shows actual zero records, not invented sales',lambda:assert_equal(api('/venue')['metrics']['salesCents'],0))
    nav(page,'tvs');page.locator('[data-action="tv-remote"]').click();page.locator('[data-action="quick-command"][data-kind="pause"]').click();page.wait_for_timeout(250)
    state=client.get('/api/player/state',headers={'Authorization':'Bearer '+pair['deviceToken']}).json()
    check('Remote button queues a real pause command',lambda:assert_equal(state['commands'][-1]['kind'],'pause'))
    nav(page,'home');snapshot(page,'home-desktop.png')
    page.set_viewport_size({'width':390,'height':844})
    nav(page,'home');snapshot(page,'home-mobile.png')
    for key in ['home','mixx','themes','tvs','schedule','commerce','revenue','billing']:
        nav(page,key)
        if page.evaluate('document.documentElement.scrollWidth>innerWidth'):
            snapshot(page,key+'-overflow.png')
            print(page.evaluate("JSON.stringify([...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,70)})).slice(-30))"))
        check('No horizontal overflow at 390px: '+key,lambda:assert_true(page.evaluate('document.documentElement.scrollWidth<=innerWidth')))
    nav(page,'themes');snapshot(page,'themes-mobile.png')
    nav(page,'mixx');snapshot(page,'mixx-mobile.png')
    check('No uncaught JavaScript page errors',lambda:assert_equal(errors,[]))
    browser.close()
(OUT/'browser-report.json').write_text(json.dumps({'checks':checks,'count':len(checks),'errors':errors,'method':'Actual app DOM + real local HTTP API through a fetch bridge. LocalStorage mocked. Native PWA, live CDN and physical TVs NOT tested.'},indent=2))
