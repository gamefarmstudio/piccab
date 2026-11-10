#!/usr/bin/env python3
"""Rebuild the landing pages from their templates:
  tools/landing.tpl.html    → public/index.html     (Thai, piccab.com/)
  tools/landing.en.tpl.html → public/en/index.html  (English, piccab.com/en/) — uses the Thai page's <style>
The sample scene picture is copied from app/app.html, so the landing pages always show the same drawing."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
app = (root / 'app/app.html').read_text(encoding='utf-8')
start = app.index('<script type="text/template" id="tea-svg">') + len('<script type="text/template" id="tea-svg">')
tea = app[start:app.index('</script>', start)].strip()
th = (root / 'tools/landing.tpl.html').read_text(encoding='utf-8')
style = th[th.index('<style>'):th.index('</style>') + len('</style>')]
(root / 'public/index.html').write_text(th.replace('{{TEA}}', tea), encoding='utf-8')
en = (root / 'tools/landing.en.tpl.html').read_text(encoding='utf-8')
(root / 'public/en').mkdir(exist_ok=True)
(root / 'public/en/index.html').write_text(en.replace('{{STYLE}}', style).replace('{{TEA}}', tea), encoding='utf-8')
print('public/index.html and public/en/index.html written')
