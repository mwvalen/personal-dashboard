import { NextResponse } from "next/server";
import { getAllUsers, getDefaultUser } from "@/lib/users/config";

export async function GET() {
  try {
    const users = getAllUsers();
    const defaultUser = getDefaultUser();

    // Fetch GitHub info (name, avatar) for users
    const usersWithGitHubInfo = await Promise.all(
      users.map(async (user) => {
        try {
          const response = await fetch(
            `https://api.github.com/users/${user.githubUsername}`,
            { next: { revalidate: 3600 } } // Cache for 1 hour
          );
          if (response.ok) {
            const ghUser = await response.json();
            return {
              ...user,
              displayName: user.displayName || ghUser.name || user.githubUsername,
              avatarUrl: user.avatarUrl || ghUser.avatar_url,
            };
          }
        } catch {
          // Fall back to defaults
        }
        return {
          ...user,
          displayName: user.displayName || user.githubUsername,
          avatarUrl: user.avatarUrl || `https://github.com/${user.githubUsername}.png`,
        };
      })
    );

    return NextResponse.json({
      users: usersWithGitHubInfo,
      defaultUser: defaultUser.githubUsername,
    });
  } catch (error) {
    console.error("Failed to load users configuration:", error);
    return NextResponse.json(
      { error: "Failed to load users configuration" },
      { status: 500 }
    );
  }
}
