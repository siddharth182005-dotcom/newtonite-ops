from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import errors
from .api import auth, dashboard, work_items
from .config import settings

app = FastAPI(title="Newtonite Ops API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key"])
errors.install(app)
for r in (auth.router, work_items.router, dashboard.router):
    app.include_router(r, prefix="/api/v1")


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"ok": True}
