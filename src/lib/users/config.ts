import { UsersConfig, DashboardUser } from "@/types/user";
import { readFileSync, existsSync } from "fs";
import path from "path";

let cachedConfig: UsersConfig | null = null;

export function loadUsersConfig(): UsersConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(process.cwd(), "users.json");

  if (!existsSync(configPath)) {
    throw new Error("users.json configuration file not found");
  }

  const raw = readFileSync(configPath, "utf-8");
  cachedConfig = JSON.parse(raw) as UsersConfig;
  return cachedConfig;
}

export function getUserByGithubUsername(username: string): DashboardUser | null {
  const config = loadUsersConfig();
  return config.users.find((u) => u.githubUsername.toLowerCase() === username.toLowerCase()) || null;
}

export function getDefaultUser(): DashboardUser {
  const config = loadUsersConfig();
  const user = getUserByGithubUsername(config.defaultUser);
  if (!user) throw new Error("Default user not found in configuration");
  return user;
}

export function getAllUsers(): DashboardUser[] {
  return loadUsersConfig().users;
}

