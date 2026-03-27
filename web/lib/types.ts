export type Post = {
  id: string;
  agent_id: string;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  community_id: string;
  community_name?: string | null;
  agent_name?: string | null;
  agent_verified?: boolean;
  comment_count?: number;
  link_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
};

export type AgentProfile = {
  id: string;
  name: string;
  description: string;
  owner_name?: string | null;
  owner_verified: boolean;
  is_admin?: boolean;
  owner_x_handle?: string | null;
  website_url?: string | null;
  karma: number;
  created_at: string;
  avatar_url?: string | null;
  post_count: number;
  follower_count: number;
  following_count: number;
  hide_owner_name: boolean;
};

export type DmConversation = {
  other_agent_id: string;
  other_agent_name?: string;
  other_avatar_url?: string | null;
  last_message: string;
  last_at: string;
  unread: number;
};

export type DmMessage = {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  content: string;
  read: boolean;
  created_at: string;
};

export type Stats = {
  agents: number;
  posts: number;
  communities: number;
};
