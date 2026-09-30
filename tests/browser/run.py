"""Chromium component checks with real UI source and an injected local-demo adapter.
Not a production bundle, MCP Apps host, TIDAL, or browser-navigation test.
Requires Python playwright; CHROMIUM_EXECUTABLE may select an installed browser.
"""
import json, os, subprocess, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'audit'; results=[]
def check(name, value):
    assert value,name
    results.append({'name':name,'status':'passed'})
def tool(payload):
    req=urllib.request.Request('http://127.0.0.1:3017/demo/tools',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=10) as res:return json.load(res)
def run():
    proc=subprocess.Popen(['node','scripts/demo.mjs'],cwd=ROOT,env={**os.environ,'DEMO_PORT':'3017'},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen('http://127.0.0.1:3017',timeout=1):break
            except OSError:time.sleep(.05)
        else:raise RuntimeError('Demo service did not start')
        with sync_playwright() as p:
            opts={'headless':True}
            if os.environ.get('CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
            browser=p.chromium.launch(**opts);page=browser.new_page(viewport={'width':1280,'height':1000});page.set_default_timeout(5000)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.expose_function('testToolBridge',tool)
            css=(ROOT/'web/tokens.css').read_text()+(ROOT/'web/style.css').read_text()
            page.set_content('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="app"></div></body></html>')
            mount="""
const view=createView(document.getElementById('app'),{call:(name,args)=>window.testToolBridge({name,arguments:args}),open:async()=>{throw new Error('Fictional demo item: no live link.');},expand:async()=>true},{demo:true,view:'full'});window.__testView=view;await view.start();
"""
            page.add_script_tag(type='module',content=(ROOT/'web/ui.mjs').read_text()+mount);page.wait_for_selector('.row')
            check('initial results render',page.locator('.row').count()>0)
            check('canvas design token applied',page.locator('body').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(252, 252, 252)')
            check('fictional-data banner visible',page.locator('#demo').is_visible());(OUT/'screenshots').mkdir(exist_ok=True)
            page.screenshot(path=str(OUT/'screenshots/desktop.png'),full_page=True)
            page.locator('#query').fill('zzzz-not-found');page.locator('#search button').click();page.wait_for_selector('#empty:visible')
            check('empty search state renders',page.locator('.row').count()==0)
            page.locator('#query').fill('night');page.locator('#search button').click();page.wait_for_selector('.row');page.locator('.row input[type=checkbox]').first.check()
            check('selection actions appear',page.locator('#selection').is_visible());page.locator('#save-selected').click();page.wait_for_selector('dialog[open]')
            check('write requires visible preview',page.locator('#dialog-title').inner_text()=='Review this change')
            page.locator('#dialog-actions').get_by_text('Cancel',exact=True).click();page.wait_for_selector('dialog[open]',state='hidden');check('preview can be cancelled',True)
            page.locator('#new-playlist').click();page.locator('#dialog-actions').get_by_text('Preview change',exact=True).click()
            check('form validation stays visible inside modal',page.locator('[data-dialog-error]').inner_text()=='Enter a playlist name.')
            page.get_by_label('Playlist name',exact=True).fill('Browser test playlist');page.get_by_label('Description',exact=True).fill('Synthetic test only')
            page.locator('#dialog-actions').get_by_text('Preview change',exact=True).click();page.wait_for_function("document.querySelector('#dialog-title').textContent==='Review this change'")
            page.screenshot(path=str(OUT/'screenshots/write-preview.png'),full_page=True)
            check('preview exposes visibility and endpoint','UNLISTED' in page.locator('#dialog-body').inner_text() and '/playlists' in page.locator('#dialog-body').inner_text())
            page.get_by_role('button',name='Confirm and apply',exact=True).click();page.wait_for_function("document.querySelector('#dialog-body').textContent.includes('Change applied successfully')")
            check('explicit confirmation applies synthetic write',True);page.locator('#dialog-actions').get_by_role('button',name='Close',exact=True).click()
            page.get_by_role('button',name='My playlists',exact=True).click();page.wait_for_function("document.querySelector('#results').textContent.includes('Browser test playlist')")
            check('created playlist appears in owned list',True)
            page.get_by_role('button',name='Discover',exact=True).click();page.wait_for_selector('.row');page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path=str(OUT/'screenshots/mobile.png'),full_page=True)
            check('mobile has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
            page.keyboard.press('Tab');check('keyboard focus is active',page.evaluate('document.activeElement!==document.body'))
            page.evaluate("__testView.context({displayMode:'inline'});__testView.receive({ok:true,data:{items:[{type:'tracks',id:'unsafe',title:'<img src=x onerror=alert(1)>',artists:[],url:'javascript:alert(1)'}],nextCursor:'next',source:{tool:'tidal_search',arguments:{query:'night',kind:'tracks'}}}})")
            check('untrusted title is text not HTML','<img src=x' in page.locator('.row').inner_text() and page.locator('.row img').count()==0)
            check('unsafe links not rendered',page.locator('.row .open-button').count()==0)
            check('inline hides multi-step navigation',not page.locator('.nav').is_visible())
            page.locator('#next').click();page.wait_for_function("!document.querySelector('#results').textContent.includes('<img src=x')")
            check('host-delivered first page can paginate',True);check('no JavaScript page errors',not errors)
            version=browser.version;browser.close()
        report={'status':'passed','count':len(results),'browser':'Chromium '+version,'scope':'Component rendering and interactions via injected adapter to the real local demo HTTP service; not MCP Apps bridge, production bundle, hosted ChatGPT/Codex, or live TIDAL.','tests':results}
        (OUT/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
    finally:
        proc.terminate()
        try:proc.wait(timeout=5)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
if __name__=='__main__':run()
