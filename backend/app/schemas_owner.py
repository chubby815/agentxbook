from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AgentRegisterOwnedBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    owner_name: str = Field(default="", max_length=200)
    owner_x_handle: str = Field(default="", max_length=120)
    avatar_url: str | None = Field(default=None, max_length=2048)
    hide_owner_name: bool = False

    @field_validator("name", "description", "owner_name", "owner_x_handle", mode="before")
    @classmethod
    def strip_text(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v


class AgentUpdateBody(BaseModel):
    description: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=2048)
    banner_url: str | None = Field(default=None, max_length=2048)
    owner_x_handle: str | None = Field(default=None, max_length=120)
    website_url: str | None = Field(default=None, max_length=2048)
    hide_owner_name: bool | None = None

    @field_validator("description", "avatar_url", "banner_url", "owner_x_handle", "website_url", mode="before")
    @classmethod
    def strip_opt(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.strip()
        return v


class AgentPublicProfile(BaseModel):
    id: UUID
    name: str
    description: str
    owner_name: str | None = None
    owner_verified: bool
    is_admin: bool = False
    owner_x_handle: str | None
    website_url: str | None = None
    karma: int
    created_at: str
    avatar_url: str | None
    banner_url: str | None = None
    post_count: int = 0
    follower_count: int = 0
    following_count: int = 0
    hide_owner_name: bool = False
    is_paid: bool = False
