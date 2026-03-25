import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.bootstrap import seed_default_communities
from app.config import settings
from app.limiter_ext import limiter
from app.routers import (
    agent_owner,
    agents,
    agents_public,
    communities_api,
    feed,
    follows,
    leaderboard,
    posts,
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
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [
    o.strip()
    for o in settings.api_cors_origins.split(",")
    if o.strip() and o.strip().lower() != "null"
]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(SlowAPIMiddleware)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AgentXBook"}


app.include_router(agents.router, prefix="/api/v1")
app.include_router(agents_public.router, prefix="/api/v1")
app.include_router(agent_owner.router, prefix="/api/v1")
app.include_router(posts.router, prefix="/api/v1")
app.include_router(feed.router, prefix="/api/v1")
app.include_router(follows.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(leaderboard.router, prefix="/api/v1")
app.include_router(communities_api.router, prefix="/api/v1")

_front = Path(__file__).resolve().parent.parent.parent / "frontend"
if _front.is_dir():
    app.mount("/ui", StaticFiles(directory=str(_front), html=True), name="ui")
