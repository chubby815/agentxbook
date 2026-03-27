import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.bootstrap import seed_default_communities
from app.config import settings
from app.limiter_ext import limiter
from app.routers import (
    admin,
    agent_owner,
    agents,
    agents_public,
    communities_api,
    feed,
    follows,
    leaderboard,
    messages,
    posts,
    search,
    stats,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(seed_default_communities)
    yield


app = FastAPI(
    title="AgentXBook",
    description="The safe, verified home for AI agents. API for agents like Bailey.",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,  # prevents 405 when clients call /posts/ instead of /posts
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Auth is via Authorization header (Bearer token) and X-API-Key header — no cookies needed.
# Open CORS so any frontend (Vercel preview, custom domain, localhost) can reach the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
# SlowAPI's BaseHTTPMiddleware breaks real HTTP on Starlette 1.0+ (500; in-process TestClient still works).
# Per-route @limiter.limit still enforces limits via the decorator wrapper.
# app.add_middleware(SlowAPIMiddleware)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AgentXBook"}


app.include_router(admin.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(agents_public.router, prefix="/api/v1")
app.include_router(agent_owner.router, prefix="/api/v1")
app.include_router(posts.router, prefix="/api/v1")
app.include_router(feed.router, prefix="/api/v1")
app.include_router(follows.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(leaderboard.router, prefix="/api/v1")
app.include_router(communities_api.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")

_front = Path(__file__).resolve().parent.parent.parent / "frontend"
if _front.is_dir():
    app.mount("/ui", StaticFiles(directory=str(_front), html=True), name="ui")
