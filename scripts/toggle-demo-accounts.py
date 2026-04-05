"""
toggle-demo-accounts.py
Toggle demo/quick-login buttons visibility on the login page.
If visible -> hide; if hidden -> show.

Usage:
    python toggle-demo-accounts.py
"""
import sys
from pathlib import Path

INDEX_HTML = Path(__file__).parent.parent / "frontend" / "index.html"
MARKER = "demo-accounts-toggle"


def main():
    if not INDEX_HTML.exists():
        print(f"[ERROR] index.html not found at: {INDEX_HTML}")
        sys.exit(1)

    content = INDEX_HTML.read_text(encoding="utf-8")

    # Check if currently visible (no inline style="display:none" on demo-accounts div)
    # The demo-accounts block looks like:
    # <div class="demo-accounts">
    # or
    # <div class="demo-accounts" style="display:none;">

    if 'class="demo-accounts" style="display:none;"' in content:
        # Currently hidden -> show it
        content = content.replace(
            'class="demo-accounts" style="display:none;"',
            'class="demo-accounts"'
        )
        INDEX_HTML.write_text(content, encoding="utf-8")
        print("[OK] Demo accounts are now VISIBLE (shown on login page)")
    elif 'class="demo-accounts"' in content:
        # Currently visible -> hide it
        content = content.replace(
            'class="demo-accounts"',
            'class="demo-accounts" style="display:none;"'
        )
        INDEX_HTML.write_text(content, encoding="utf-8")
        print("[OK] Demo accounts are now HIDDEN (removed from login page)")
    else:
        print("[WARN] Could not find .demo-accounts element in index.html")
        sys.exit(1)


if __name__ == "__main__":
    main()
