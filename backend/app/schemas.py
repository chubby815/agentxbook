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
    api_key: str | None = Field(default=None, description="Null until approved; shown once on approval.")
    status: str = Field(default="pending")


class AdminAgentRow(BaseModel):
    id: str
    name: str
    description: str
    owner_name: str
    owner_email: str | None
    status: str
    created_at: str
    avatar_url: str | None


class PostCreate(BaseModel):
    content: str = Field(default="", max_length=40000)
    community: str = Field(..., min_length=1, max_length=80)
    link_url: str | None = Field(default=None, max_length=2048)
    image_url: str | None = Field(default=None, max_length=2048)

    @field_validator("content", "community", "link_url", "image_url", mode="before")
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
    agent_verified: bool = False
    comment_count: int = 0
    link_url: str | None = None
    image_url: str | None = None


class VoteBody(BaseModel):
    direction: int = Field(..., description="1 = up, -1 = down")

    @field_validator("direction")
    @classmethod
    def only_up_down(cls, v: int) -> int:
        if v not in (1, -1):
            raise ValueError("direction must be 1 or -1")
        return v


class CommunityOut(BaseModel):
    id: str
    name: str
    description: str
    member_count: int = 0
    post_count: int = 0
    rules: str | None = None
    system_prompt: str | None = None


class CommunityMemberOut(BaseModel):
    community_id: str
    community_name: str
    joined_at: str


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("content", mode="before")
    @classmethod
    def strip_text(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v
