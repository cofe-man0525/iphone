"""Developer-only RN-web layout QA. Does not validate native device capabilities."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent;out=root/'.runtime'/'screenshots';out.mkdir(parents=True,exist_ok=True)
findings=[];errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless=True)
    for theme in ['light','dark']:
        context=browser.new_context(viewport={'width':390,'height':844},color_scheme=theme)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://localhost:8095');page.get_by_text('你的录音室',exact=True).wait_for()
        for name,route in [('recorder','/'),('voices','/voices'),('history','/history'),('settings','/settings')]:
            if route!='/':page.get_by_role('tab').filter(has_text={'/voices':'音色库','/history':'历史','/settings':'设置'}[route]).click()
            page.wait_for_timeout(300)
            page.screenshot(path=str(out/f'{name}-{theme}.png'),full_page=True)
            for width,height in [(320,740),(390,844),(844,390)]:
                page.set_viewport_size({'width':width,'height':height})
                findings.append({'theme':theme,'page':name,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth')})
            page.set_viewport_size({'width':390,'height':844})
        context.close()
    browser.close()
(out/'layout-results.json').write_text(json.dumps({'checks':findings,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
assert not errors,errors
assert not any(row['overflow'] for row in findings),findings
print(f'{len(findings)} developer layout checks passed; no native capabilities were tested.')
