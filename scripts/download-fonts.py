"""Download Google Fonts (Inter + JetBrains Mono) as local CSS + woff2 files."""
import urllib.request, ssl, os, re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'vendor', 'fonts')

font_url = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap'

os.makedirs(BASE, exist_ok=True)

print('Fetching Google Fonts CSS...')
try:
    req = urllib.request.Request(font_url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    resp = urllib.request.urlopen(req, timeout=30, context=ctx)
    css_text = resp.read().decode('utf-8')
    print(f'  Got CSS ({len(css_text):,} bytes)')
except Exception as e:
    print(f'  FAILED: {e}')
    exit(1)

# Extract woff2 URLs - format: url(https://fonts.gstatic.com/s/...)
woff2_urls = list(set(re.findall(r'url\((https://fonts\.gstatic\.com/s/[^)]+)\)', css_text)))
print(f'  Found {len(woff2_urls)} unique font files')

# Download each woff2
local_map = {}  # url -> local filename
for url in woff2_urls:
    fname = os.path.basename(url)
    local_path = os.path.join(BASE, fname)
    try:
        print(f'  Downloading {fname}...', end=' ', flush=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=30, context=ctx)
        data = resp.read()
        with open(local_path, 'wb') as f:
            f.write(data)
        print(f'OK ({len(data):,} bytes)')
        local_map[url] = fname
    except Exception as e:
        print(f'FAILED: {e}')

# Rewrite CSS: replace gstatic URLs with local filenames
local_css = css_text
for url, fname in local_map.items():
    local_css = local_css.replace(url, fname)

css_path = os.path.join(BASE, 'fonts.css')
with open(css_path, 'w', encoding='utf-8') as f:
    f.write(local_css)
print(f'\n  Saved fonts.css ({len(local_css):,} bytes)')
print(f'Done! {len(local_map)} font files downloaded.')
