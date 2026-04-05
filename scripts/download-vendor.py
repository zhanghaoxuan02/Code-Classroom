"""Download all CDN dependencies to local vendor/ directory."""
import urllib.request, ssl, os

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'vendor')

files = [
    # CodeMirror CSS
    (os.path.join(BASE, 'codemirror', 'codemirror.min.css'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css'),
    (os.path.join(BASE, 'codemirror', 'dracula.min.css'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css'),
    (os.path.join(BASE, 'codemirror', 'show-hint.min.css'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css'),
    # CodeMirror JS
    (os.path.join(BASE, 'codemirror', 'codemirror.min.js'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js'),
    (os.path.join(BASE, 'codemirror', 'python.min.js'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js'),
    (os.path.join(BASE, 'codemirror', 'javascript.min.js'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js'),
    (os.path.join(BASE, 'codemirror', 'clike.min.js'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js'),
    (os.path.join(BASE, 'codemirror', 'matchbrackets.min.js'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/matchbrackets.min.js'),
    (os.path.join(BASE, 'codemirror', 'closebrackets.min.js'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js'),
    (os.path.join(BASE, 'codemirror', 'active-line.min.js'),
     'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/selection/active-line.min.js'),
    # Marked.js
    (os.path.join(BASE, 'marked', 'marked.min.js'),
     'https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
]

ok = 0
fail = 0
for local, remote in files:
    os.makedirs(os.path.dirname(local), exist_ok=True)
    fname = os.path.basename(local)
    try:
        print(f'  Downloading {fname}...', end=' ', flush=True)
        req = urllib.request.Request(remote, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=30, context=ctx)
        data = resp.read()
        with open(local, 'wb') as f:
            f.write(data)
        print(f'OK ({len(data):,} bytes)')
        ok += 1
    except Exception as e:
        print(f'FAILED: {e}')
        fail += 1

print(f'\nDone! {ok} downloaded, {fail} failed.')
