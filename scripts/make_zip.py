"""Create newtonite-ops-final.zip (top-level newtonite-ops/ folder) without build output, caches, venvs, env files or logs.
Usage: python scripts/make_zip.py <output.zip>"""
import os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"node_modules", ".venv", "venv", "__pycache__", "dist", ".pytest_cache", ".git", ".vite", ".mypy_cache", ".cache"}
SKIP_EXT = (".pyc", ".log", ".zip", ".tsbuildinfo")
out = os.path.abspath(sys.argv[1])
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for f in sorted(files):
            if f == ".env" or f.startswith(".env.") and f != ".env.example" or f.endswith(SKIP_EXT):
                continue
            p = os.path.join(d, f)
            z.write(p, os.path.join("newtonite-ops", os.path.relpath(p, ROOT)))
print(out)
