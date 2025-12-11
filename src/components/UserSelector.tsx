"use client";

import { useState, useRef, useEffect } from "react";
import type { DashboardUser } from "@/types/user";

interface UserSelectorProps {
  users: DashboardUser[];
  selectedUser: DashboardUser;
  onSelect: (user: DashboardUser) => void;
}

export function UserSelector({
  users,
  selectedUser,
  onSelect,
}: UserSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter users by search query
  const filteredUsers = users.filter(
    (user) =>
      (user.displayName || user.githubUsername).toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.githubUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
      >
        <img
          src={
            selectedUser.avatarUrl ||
            `https://github.com/${selectedUser.githubUsername}.png`
          }
          alt={selectedUser.displayName || selectedUser.githubUsername}
          className="w-10 h-10 rounded-full ring-2 ring-slate-700"
        />
        <div className="text-left">
          <h1 className="text-lg font-semibold text-white">
            {selectedUser.displayName || selectedUser.githubUsername}
          </h1>
          <p className="text-sm text-slate-500">
            @{selectedUser.githubUsername}
          </p>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Search Input */}
          <div className="p-3 border-b border-slate-800">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* User List */}
          <div className="max-h-64 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                No users found
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.githubUsername}
                  onClick={() => {
                    onSelect(user);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors ${
                    user.githubUsername === selectedUser.githubUsername ? "bg-slate-800/50" : ""
                  }`}
                >
                  <img
                    src={
                      user.avatarUrl ||
                      `https://github.com/${user.githubUsername}.png`
                    }
                    alt={user.displayName || user.githubUsername}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 text-left">
                    <p className="text-white text-sm font-medium">
                      {user.displayName || user.githubUsername}
                    </p>
                    <p className="text-slate-500 text-xs">
                      @{user.githubUsername}
                    </p>
                  </div>
                  {user.githubUsername === selectedUser.githubUsername && (
                    <svg
                      className="w-5 h-5 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
