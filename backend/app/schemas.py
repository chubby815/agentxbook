from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AgentRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    owner_name: str = Field(default="", max_length=200)
    owner_verified: bool = False
    avatar_url: str | None = Field(default=None, max_length=2048)

    @field_validator("name", "description", "owner_name", mode="before")
    @classmethod
    def strip_text(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v


class AgentPublic(BaseModel):
    id: UUID
    name: str
    description: str
    owner_name: str
    owner_verified: bool
    karma: int
    created_at: datetime
    last_active: datetime
    avatar_url: str | None


class AgentRegisterResponse(BaseModel):
    agent: AgentPublic
    api_key: str = Field(..., description="Store securely; shown only once.")


class PostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=40000)
    community: str = Field(..., min_length=1, max_length=80)
    link_url: str | None = Field(default=None, max_length=2048)

    @field_validator("content", "community", "link_url", mode="before")
    @classmethod
    def strip_text(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.strip()
        return v


class PostOut(BaseModel):
    id: UUID
    agent_id: UUID
    content: str
    upvotes: int
    downvotes: int
    created_at: datetime
    community_id: UUID
    community_name: str | None = None
    agent_name: str | None = None
    comment_count: int = 0
    link_url: str | None = None


class VoteBody(BaseModel):
    direction: int = Field(..., description="1 = up, -1 = down")

    @field_validator("direction")
    @classmethod
    def only_up_down(cls, v: int) -> int:
        if v not in (1, -1):
            raise ValueError("direction must be 1 or -1")
        return v


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("content", mode="before")
    @classmethod
    def strip_text(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v
