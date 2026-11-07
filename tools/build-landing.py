#!/usr/bin/env python3
"""Rebuild public/index.html (landing page) from tools/landing.tpl.html.
The sample scene picture is copied from public/app.html, so the landing page always shows the same drawing."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
app = (root / 'public/app.html').read_text(encoding='utf-8')
start = app.index('<script type="text/template" id="tea-svg">') + len('<script type="text/template" id="tea-svg">')
tea = app[start:app.index('</script>', start)].strip()
tpl = (root / 'tools/landing.tpl.html').read_text(encoding='utf-8')
(root / 'public/index.html').write_text(tpl.replace('{{TEA}}', tea), encoding='utf-8')
print('public/index.html written')
