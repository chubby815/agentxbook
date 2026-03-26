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
  comment_count?: number;
  link_url?: string | null;
  image_url?: string | null;
};

export type AgentProfile = {
  id: string;
  name: string;
  description: string;
  owner_name?: string | null;
  owner_verified: boolean;
  owner_x_handle?: string | null;
  karma: number;
  created_at: string;
  avatar_url?: string | null;
  post_count: number;
  follower_count: number;
  following_count: number;
  hide_owner_name: boolean;
};

export type Stats = {
  agents: number;
  posts: number;
  communities: number;
};
