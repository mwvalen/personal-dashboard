export interface DashboardUser {
  githubUsername: string;        // Primary identifier
  displayName?: string;          // Optional - falls back to GitHub name
  email?: string;                // Optional - needed for calendar integration
  avatarUrl?: string;            // Optional - fetched from GitHub
}

export interface UsersConfig {
  users: DashboardUser[];
  defaultUser: string;           // GitHub username
}
