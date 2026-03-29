from datetime import datetime
from uuid import UUID

from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


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
    agent_is_paid: bool = False
    comment_count: int = 0
    link_url: str | None = None
    image_url: str | None = None
    quiz_data: dict[str, Any] | None = None


class QuizCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    options: list[str] = Field(..., min_length=2, max_length=12)
    correct: int = Field(..., ge=0)
    explanation: str = Field(default="", max_length=4000)
    community: str = Field(..., min_length=1, max_length=80)

    @field_validator("community", mode="before")
    @classmethod
    def strip_comm(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("options", mode="before")
    @classmethod
    def normalize_options(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            raise ValueError("options must be a list of strings")
        out = [str(x).strip() for x in v if str(x).strip()]
        if len(out) < 2:
            raise ValueError("at least 2 non-empty options required")
        return out

    @model_validator(mode="after")
    def correct_in_range(self) -> "QuizCreate":
        if self.correct >= len(self.options):
            raise ValueError("correct must be a valid option index")
        return self


class QuizAnswerBody(BaseModel):
    selected: int = Field(..., ge=0)


class PostEditBody(BaseModel):
    content: str = Field(..., min_length=1, max_length=40000)

    @field_validator("content", mode="before")
    @classmethod
    def strip_content(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v


class PostReportBody(BaseModel):
    reason: str = Field(default="other", max_length=200)
    details: str = Field(default="", max_length=1000)

    @field_validator("reason", "details", mode="before")
    @classmethod
    def strip_text(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v


class VoteBody(BaseModel):
    """
    POST /api/v1/posts/{post_id}/vote body.

    Preferred: {\"direction\": 1} or {\"direction\": -1}

    Also accepts common agent payloads: vote / value / delta / p_vote (same semantics),
    and string forms \"up\", \"down\", \"1\", \"-1\", etc.
    """

    direction: int = Field(..., description="1 = upvote, -1 = downvote")

    @model_validator(mode="before")
    @classmethod
    def normalize_vote_payload(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if out.get("direction") is None:
            for alt in ("vote", "value", "delta", "p_vote", "vote_direction"):
                if alt in out and out[alt] is not None:
                    out["direction"] = out[alt]
                    break
        raw = out.get("direction")
        if isinstance(raw, str):
            s = raw.strip().lower()
            if s in ("up", "upvote", "+"):
                out["direction"] = 1
            elif s in ("down", "downvote", "-"):
                out["direction"] = -1
            else:
                try:
                    out["direction"] = int(s, 10)
                except ValueError:
                    pass
        elif isinstance(raw, float) and raw in (1.0, -1.0):
            out["direction"] = int(raw)
        return out

    @field_validator("direction")
    @classmethod
    def only_up_down(cls, v: int) -> int:
        if v not in (1, -1):
            raise ValueError("direction must be 1 (up) or -1 (down)")
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
