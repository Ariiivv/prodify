import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame,
  Trophy,
  UserPlus,
  Check,
  X,
  Search,
  Users,
  RefreshCw,
  UserCheck,
  UserMinus,
  Activity,
  MessageSquare,
  Send,
  Edit2,
  Save,
  Globe,
  Sparkles,
} from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { toast } from 'sonner';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  username?: string;
  avatar_url?: string;
  is_self: boolean;
  friendship_id?: number;
  friendship_status?: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'self' | string;
  live_status?: 'focusing' | 'online' | 'offline';
  current_streak: number;
  longest_streak: number;
  momentum_score: number;
  momentum_label: string;
  deep_work_ratio?: number;
  active_tracks_summary: string;
  mastery_count: number;
  sprint_count: number;
  quick_work_count: number;
  total_workspaces: number;
}

interface UserSearchResult {
  id: string;
  username?: string;
  full_name?: string;
  display_name: string;
  avatar_url?: string;
  friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | string;
  friendship_id?: number;
}

interface FriendRequestItem {
  friendship_id: number;
  user_id: string;
  username?: string;
  full_name?: string;
  display_name: string;
  avatar_url?: string;
  created_at?: string;
}

interface ChatMessage {
  id: number;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_self: boolean;
}

interface ActiveChatFriend {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  live_status?: 'focusing' | 'online' | 'offline';
}

/**
 * Reusable UserAvatar component with graceful error fallback and live status dot.
 */
function UserAvatar({
  name,
  avatarUrl,
  status,
  size = 'md',
  className = '',
}: {
  name: string;
  avatarUrl?: string | null;
  status?: 'focusing' | 'online' | 'offline';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-14 h-14 text-lg',
  }[size];

  const dotSizes = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-3.5 h-3.5',
  }[size];

  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={`relative shrink-0 ${sizeClasses} ${className}`}>
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={name}
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover border border-[#27272a]"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-[#27272a] border border-zinc-700/60 text-zinc-200 font-semibold flex items-center justify-center select-none shadow-inner">
          {initial}
        </div>
      )}

      {status && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[#18181b] ${dotSizes} ${
            status === 'focusing'
              ? 'bg-emerald-400 animate-pulse ring-2 ring-emerald-400/40'
              : status === 'online'
              ? 'bg-emerald-500'
              : 'bg-zinc-600'
          }`}
          title={status === 'focusing' ? 'Focusing Now' : status === 'online' ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}

export default function FriendsPage() {
  // Navigation Tabs: 'circle' (My Circle & Chat) | 'global' (Global Leaderboard)
  const [activeTab, setActiveTab] = useState<'circle' | 'global'>('circle');

  // Friends & Circle state
  const [circleLeaderboard, setCircleLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalFriends, setTotalFriends] = useState(0);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [isLoadingCircle, setIsLoadingCircle] = useState(true);

  // Global Leaderboard state
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalGlobalUsers, setTotalGlobalUsers] = useState(0);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');

  // Profile quick-editor state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Friend search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Chat Drawer state
  const [activeChatFriend, setActiveChatFriend] = useState<ActiveChatFriend | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch Friends circle data
  const fetchCircleLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/friends/leaderboard`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCircleLeaderboard(data.leaderboard || []);
      setTotalFriends(data.total_friends || 0);
    } catch (err) {
      console.error('Failed to load friends leaderboard:', err);
    } finally {
      setIsLoadingCircle(false);
    }
  }, []);

  // Fetch pending requests
  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/friends/requests`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIncomingRequests(data.incoming || []);
      setOutgoingRequests(data.outgoing || []);
    } catch (err) {
      console.error('Failed to load friend requests:', err);
    }
  }, []);

  // Fetch Global leaderboard
  const fetchGlobalLeaderboard = useCallback(async () => {
    setIsLoadingGlobal(true);
    try {
      const res = await fetch(`${API_BASE}/api/leaderboard/global`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGlobalLeaderboard(data.leaderboard || []);
      setTotalGlobalUsers(data.total_global_users || (data.leaderboard || []).length);
    } catch (err) {
      console.error('Failed to load global leaderboard:', err);
    } finally {
      setIsLoadingGlobal(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoadingCircle(true);
    await Promise.all([fetchCircleLeaderboard(), fetchRequests(), fetchGlobalLeaderboard()]);
    setIsLoadingCircle(false);
  }, [fetchCircleLeaderboard, fetchRequests, fetchGlobalLeaderboard]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Current user's self entry
  const selfEntry = circleLeaderboard.find((e) => e.is_self) || globalLeaderboard.find((e) => e.is_self);

  // Filtered direct friends (excluding self)
  const directFriends = useMemo(() => {
    return circleLeaderboard.filter((e) => !e.is_self);
  }, [circleLeaderboard]);

  // Filtered global leaderboard entries based on search input
  const filteredGlobalLeaderboard = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    if (!q) return globalLeaderboard;
    return globalLeaderboard.filter(
      (e) =>
        e.display_name.toLowerCase().includes(q) ||
        (e.username && e.username.toLowerCase().includes(q))
    );
  }, [globalLeaderboard, globalFilter]);

  // Synchronize profile editor inputs when selfEntry is loaded
  useEffect(() => {
    if (selfEntry && !isEditingProfile) {
      setEditDisplayName(selfEntry.display_name || '');
      setEditUsername(selfEntry.username || '');
    }
  }, [selfEntry, isEditingProfile]);

  // Poll chat messages every 3s when Chat Drawer is open
  useEffect(() => {
    if (!activeChatFriend) return;
    let isSubscribed = true;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/friends/${activeChatFriend.id}/messages`, {
          headers: getAuthHeaders(),
        });
        if (res.ok && isSubscribed) {
          const data = await res.json();
          setChatMessages(data.messages || []);
        }
      } catch (err) {
        console.error('Failed to poll friend messages:', err);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [activeChatFriend]);

  // Auto-scroll chat to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Save profile updates (display name & unique handle)
  const handleSaveProfile = async () => {
    const cleanDisplay = editDisplayName.trim();
    const cleanUser = editUsername.trim().replace(/^@/, '');

    if (!cleanDisplay) {
      toast.error('Display name cannot be empty.');
      return;
    }
    if (cleanUser.length < 3 || cleanUser.length > 30) {
      toast.error('Username handle must be between 3 and 30 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(cleanUser)) {
      toast.error('Username handle can only contain letters, numbers, underscores, and dots.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/api/friends/profile`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          display_name: cleanDisplay,
          username: cleanUser,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to update profile');
      }

      const data = await res.json();
      toast.success(data.message || 'Profile updated successfully!');
      setIsEditingProfile(false);
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Search users handler
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await fetch(`${API_BASE}/api/friends/search?q=${encodeURIComponent(q)}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch (err) {
      console.error('Failed to search users:', err);
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Send friend request (works from Search and from Global Leaderboard)
  const handleSendRequest = async (targetUserId: string, targetName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/friends/request`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send request');
      }
      const data = await res.json();
      toast.success(data.message || `Friend request sent to ${targetName}`);

      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === targetUserId
            ? { ...u, friendship_status: data.status, friendship_id: data.friendship_id }
            : u
        )
      );

      setGlobalLeaderboard((prev) =>
        prev.map((u) =>
          u.user_id === targetUserId
            ? { ...u, friendship_status: data.status, friendship_id: data.friendship_id }
            : u
        )
      );

      fetchRequests();
      if (data.status === 'accepted') {
        fetchCircleLeaderboard();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send friend request');
    }
  };

  // Respond to incoming request
  const handleRespond = async (friendshipId: number, action: 'accept' | 'decline') => {
    try {
      const res = await fetch(`${API_BASE}/api/friends/${friendshipId}/respond`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(action === 'accept' ? 'Friend request accepted!' : 'Request declined');
      refreshAll();
    } catch (err) {
      console.error(`Failed to ${action} friend request:`, err);
      toast.error(`Failed to ${action} request`);
    }
  };

  // Remove friend connection
  const handleRemoveFriend = async (friendshipId: number, friendName: string) => {
    if (!window.confirm(`Remove "${friendName}" from your focus circle?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Removed connection with ${friendName}`);
      refreshAll();
    } catch (err) {
      console.error('Failed to remove friend:', err);
      toast.error('Failed to remove connection');
    }
  };

  // Send message in Chat Drawer
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = chatInput.trim();
    if (!text || !activeChatFriend || isSendingMessage) return;

    setIsSendingMessage(true);
    try {
      const res = await fetch(`${API_BASE}/api/friends/${activeChatFriend.id}/messages`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send message');
      }
      const data = await res.json();
      setChatInput('');
      if (data.message) {
        setChatMessages((prev) => [...prev, data.message]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#18181b] text-[#f4f4f5] pl-0 md:pl-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* ── Top Header Bar ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#27272a] pb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#f4f4f5]">Friends & Leaderboard</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#202024] border border-[#27272a] text-[#a1a1aa] font-mono">
                {totalFriends} {totalFriends === 1 ? 'Friend' : 'Friends'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#a1a1aa]">
              Compare daily streaks, track live focus status, and chat with your circle.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {/* User Profile Pill */}
            {selfEntry && (
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#202024] border border-[#27272a] text-xs shadow-sm">
                <UserAvatar
                  name={selfEntry.display_name}
                  avatarUrl={selfEntry.avatar_url}
                  status={selfEntry.live_status}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#f4f4f5] truncate max-w-[120px]">
                      {selfEntry.display_name}
                    </span>
                    <span className="text-[10px] font-bold text-sky-400 bg-sky-500/15 border border-sky-500/25 px-1 rounded">
                      YOU
                    </span>
                  </div>
                  {selfEntry.username && (
                    <p className="text-[10px] text-[#a1a1aa] font-mono truncate">@{selfEntry.username}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditDisplayName(selfEntry.display_name || '');
                    setEditUsername(selfEntry.username || '');
                    setIsEditingProfile((prev) => !prev);
                  }}
                  className="p-1 rounded-md text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-colors ml-1"
                  title="Edit your display name & @handle"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={refreshAll}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#a1a1aa] hover:text-[#f4f4f5] bg-[#202024] border border-[#27272a] hover:bg-[#27272a] rounded-xl transition-colors shadow-sm"
              title="Refresh circle and global leaderboard"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoadingCircle || isLoadingGlobal ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* ── Segmented Navigation Tabs ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-[#202024] border border-[#27272a] rounded-xl text-xs">
            <button
              onClick={() => setActiveTab('circle')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'circle'
                  ? 'bg-[#27272a] text-[#f4f4f5] shadow-sm'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-zinc-800/40'
              }`}
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span>My Circle & Chat</span>
              {incomingRequests.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Pending requests" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('global')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'global'
                  ? 'bg-[#27272a] text-[#f4f4f5] shadow-sm'
                  : 'text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-zinc-800/40'
              }`}
            >
              <Globe className="w-4 h-4 text-amber-400" />
              <span>Global Leaderboard</span>
              {totalGlobalUsers > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-[#a1a1aa] font-mono">
                  {totalGlobalUsers}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'global' && (
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Filter by name or @handle..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#202024] border border-[#27272a] text-[#f4f4f5] placeholder-[#a1a1aa]/60 text-xs rounded-xl focus:outline-none focus:border-zinc-500 transition-all"
              />
            </div>
          )}
        </div>

        {/* ── Inline Profile Edit Bar ── */}
        <AnimatePresence>
          {isEditingProfile && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-[#27272a] bg-[#202024] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-sky-300">Customize Your Profile & Handle</p>
                  <p className="text-[#a1a1aa]">
                    Display name is used in focus reports. Your @handle is unique for peer search and rankings.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="Display Name"
                    className="px-3 py-1.5 bg-[#18181b] border border-[#27272a] text-xs text-[#f4f4f5] rounded-lg focus:outline-none focus:border-zinc-500 w-36"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-xs font-mono">
                      @
                    </span>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
                      placeholder="handle"
                      className="pl-6 pr-3 py-1.5 bg-[#18181b] border border-[#27272a] text-xs text-[#f4f4f5] rounded-lg focus:outline-none focus:border-zinc-500 w-36 font-mono"
                    />
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-[#f4f4f5] border border-zinc-700 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSavingProfile ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="p-1.5 text-[#a1a1aa] hover:text-[#f4f4f5] rounded-lg hover:bg-[#27272a] transition-colors"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 1: MY CIRCLE & CHAT                                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'circle' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT: DIRECT FOCUS CIRCLE (8 cols) ── */}
            <div className="lg:col-span-8 space-y-4">
              {/* Pinned Personal Status Card */}
              {selfEntry && (
                <div className="p-4 rounded-xl border border-[#27272a] bg-[#202024]/60 backdrop-blur-md flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      name={selfEntry.display_name}
                      avatarUrl={selfEntry.avatar_url}
                      status={selfEntry.live_status}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#f4f4f5] text-sm truncate">
                          {selfEntry.display_name}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                          YOU
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[#a1a1aa]">
                        {selfEntry.username && (
                          <span className="font-mono text-[#a1a1aa]/80">@{selfEntry.username}</span>
                        )}
                        {selfEntry.live_status === 'focusing' && (
                          <span className="text-[11px] text-emerald-400 font-medium">· ⚡ Focusing now</span>
                        )}
                        {selfEntry.live_status === 'online' && (
                          <span className="text-[11px] text-emerald-400/80 font-medium">· 🟢 Online</span>
                        )}
                        {selfEntry.live_status === 'offline' && (
                          <span className="text-[11px] text-[#a1a1aa]/60">· ⚪ Offline</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      <div className="inline-flex items-center gap-1 font-mono font-bold text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full">
                        <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-400" />
                        {selfEntry.current_streak}d
                      </div>
                      <div className="text-[10px] text-[#a1a1aa] font-mono mt-1">
                        Best: {selfEntry.longest_streak}d
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <div className="text-xs font-bold font-mono text-[#f4f4f5]">
                        {Math.round(selfEntry.momentum_score)}%
                      </div>
                      <div className="text-[10px] text-[#a1a1aa] font-mono uppercase">
                        {selfEntry.momentum_label}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Connected Friends Card */}
              <div className="rounded-xl border border-[#27272a] bg-[#202024]/80 backdrop-blur-md overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#27272a] flex items-center justify-between bg-[#202024]/40">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      MY FOCUS CIRCLE
                    </h2>
                  </div>
                  <span className="text-[11px] text-[#a1a1aa] font-medium">
                    {directFriends.length} {directFriends.length === 1 ? 'Peer Connected' : 'Peers Connected'}
                  </span>
                </div>

                {isLoadingCircle ? (
                  <div className="p-12 text-center text-[#a1a1aa] space-y-3">
                    <div className="w-6 h-6 border-2 border-zinc-500 border-t-white rounded-full animate-spin mx-auto" />
                    <p className="text-xs">Loading your focus circle...</p>
                  </div>
                ) : directFriends.length === 0 ? (
                  <div className="p-12 text-center text-[#a1a1aa] space-y-3">
                    <Users className="w-10 h-10 mx-auto text-zinc-600" />
                    <p className="text-sm font-semibold text-zinc-300">Your focus circle is currently empty</p>
                    <p className="text-xs text-[#a1a1aa] max-w-md mx-auto leading-relaxed">
                      Connect with peers to observe each other's live focus states, compare daily streaks, and stay accountable. Use the Add Friends search panel on the right or explore the Global Leaderboard.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#27272a] bg-[#202024]/60 text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider">
                          <th className="py-3 px-4">PEER</th>
                          <th className="py-3 px-4 text-center">STREAK</th>
                          <th className="py-3 px-4 text-center">MOMENTUM</th>
                          <th className="py-3 px-4">ACTIVE TRACKS</th>
                          <th className="py-3 px-4 text-right">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272a]/50 text-xs">
                        {directFriends.map((friend) => (
                          <tr key={friend.user_id} className="hover:bg-[#27272a]/40 transition-colors">
                            {/* 1. Peer info */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <UserAvatar
                                  name={friend.display_name}
                                  avatarUrl={friend.avatar_url}
                                  status={friend.live_status}
                                  size="md"
                                />
                                <div className="min-w-0">
                                  <span className="font-semibold text-[#f4f4f5] truncate text-sm block">
                                    {friend.display_name}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-xs text-[#a1a1aa]">
                                    {friend.username && (
                                      <span className="font-mono text-[#a1a1aa]/80">@{friend.username}</span>
                                    )}
                                    {friend.live_status === 'focusing' && (
                                      <span className="text-[11px] text-emerald-400 font-medium">
                                        · Focusing now
                                      </span>
                                    )}
                                    {friend.live_status === 'online' && (
                                      <span className="text-[11px] text-emerald-400/80 font-medium">
                                        · Online
                                      </span>
                                    )}
                                    {friend.live_status === 'offline' && (
                                      <span className="text-[11px] text-[#a1a1aa]/60">· Offline</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 2. Streak */}
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full">
                                  <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-400" />
                                  {friend.current_streak}d
                                </span>
                                <span className="text-[10px] text-[#a1a1aa] font-mono mt-1">
                                  Best: {friend.longest_streak}d
                                </span>
                              </div>
                            </td>

                            {/* 3. Momentum */}
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono font-bold text-[#f4f4f5] text-xs">
                                    {Math.round(friend.momentum_score)}%
                                  </span>
                                  <span className="text-[9px] uppercase tracking-wider font-semibold text-[#a1a1aa] bg-[#18181b] border border-[#27272a] px-1.5 py-0.5 rounded">
                                    {friend.momentum_label}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#a1a1aa] font-mono mt-1">
                                  7d Flow:{' '}
                                  {friend.deep_work_ratio !== null && friend.deep_work_ratio !== undefined
                                    ? `${Math.round(friend.deep_work_ratio)}%`
                                    : '—'}
                                </span>
                              </div>
                            </td>

                            {/* 4. Active Tracks */}
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300 bg-[#18181b] border border-[#27272a] px-2.5 py-1 rounded-lg">
                                <Activity className="w-3 h-3 text-[#a1a1aa] shrink-0" />
                                <span className="truncate max-w-[140px]">{friend.active_tracks_summary}</span>
                              </span>
                            </td>

                            {/* 5. Actions: Chat & Remove */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() =>
                                    setActiveChatFriend({
                                      id: friend.user_id,
                                      name: friend.display_name,
                                      username: friend.username,
                                      avatar: friend.avatar_url,
                                      live_status: friend.live_status,
                                    })
                                  }
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg transition-colors"
                                  title="Open Chat"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Chat</span>
                                </button>
                                {friend.friendship_id && (
                                  <button
                                    onClick={() => handleRemoveFriend(friend.friendship_id!, friend.display_name)}
                                    className="text-zinc-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-[#27272a] opacity-60 hover:opacity-100"
                                    title="Remove from circle"
                                  >
                                    <UserMinus className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT: ADD FRIENDS & REQUESTS (4 cols) ── */}
            <div className="lg:col-span-4 space-y-6">
              {/* Add Friends Search Card */}
              <div className="rounded-xl border border-[#27272a] bg-[#202024]/80 backdrop-blur-md p-5 space-y-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <UserPlus className="w-4 h-4 text-sky-400" />
                    <h2 className="text-sm font-bold text-[#f4f4f5] uppercase tracking-wider">Add Friends</h2>
                  </div>
                  <p className="text-xs text-[#a1a1aa]">
                    Find peers by their unique @handle, name, or registered email.
                  </p>
                </div>

                {/* Integrated Search Form */}
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search @handle, name, email..."
                      className="w-full pl-8 pr-3 py-2 bg-[#18181b] border border-[#27272a] text-[#f4f4f5] placeholder-[#a1a1aa]/60 text-xs rounded-xl focus:outline-none focus:border-zinc-500 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-3.5 py-2 bg-[#27272a] hover:bg-zinc-700 text-[#f4f4f5] border border-zinc-700 disabled:opacity-50 text-xs font-semibold rounded-xl transition-colors shrink-0"
                  >
                    {isSearching ? '...' : 'Search'}
                  </button>
                </form>

                {/* Search Results */}
                {hasSearched && (
                  <div className="space-y-2 pt-1 border-t border-[#27272a]">
                    <div className="flex items-center justify-between text-[11px] text-[#a1a1aa] font-semibold">
                      <span>Results ({searchResults.length})</span>
                      <button
                        onClick={() => {
                          setHasSearched(false);
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="text-[#a1a1aa] hover:text-[#f4f4f5]"
                      >
                        Clear
                      </button>
                    </div>

                    {searchResults.length === 0 ? (
                      <div className="p-4 text-center text-[#a1a1aa] text-xs rounded-xl border border-[#27272a] bg-[#18181b]">
                        No matching users found for "{searchQuery}".
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {searchResults.map((user) => {
                          const status = user.friendship_status;
                          return (
                            <div
                              key={user.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-zinc-700 transition-all"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <UserAvatar
                                  name={user.display_name}
                                  avatarUrl={user.avatar_url}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#f4f4f5] truncate">
                                    {user.display_name}
                                  </p>
                                  {user.username && (
                                    <p className="text-[10px] text-[#a1a1aa] font-mono truncate">
                                      @{user.username}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 ml-2">
                                {status === 'accepted' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                                    <UserCheck className="w-3 h-3" />
                                    Friend
                                  </span>
                                ) : status === 'pending_sent' ? (
                                  <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                                    Sent
                                  </span>
                                ) : status === 'pending_received' ? (
                                  <button
                                    onClick={() =>
                                      user.friendship_id && handleRespond(user.friendship_id, 'accept')
                                    }
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    Accept
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleSendRequest(user.id, user.display_name)}
                                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[#f4f4f5] border border-zinc-700 text-[10px] font-semibold rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                    Add
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Friend Requests Card (Incoming & Outgoing) */}
              {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
                <div className="rounded-xl border border-[#27272a] bg-[#202024]/80 backdrop-blur-md p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-amber-400" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                        Friend Requests
                      </h2>
                    </div>
                    {incomingRequests.length > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold">
                        {incomingRequests.length} incoming
                      </span>
                    )}
                  </div>

                  {/* Incoming Requests List */}
                  {incomingRequests.length > 0 && (
                    <div className="space-y-2">
                      {incomingRequests.map((req) => (
                        <div
                          key={req.friendship_id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#18181b] border border-[#27272a]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <UserAvatar
                              name={req.display_name}
                              avatarUrl={req.avatar_url}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#f4f4f5] truncate">{req.display_name}</p>
                              {req.username && (
                                <p className="text-[10px] text-[#a1a1aa] font-mono truncate">
                                  @{req.username}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              onClick={() => handleRespond(req.friendship_id, 'accept')}
                              className="w-7 h-7 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-center transition-colors"
                              title="Accept request"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRespond(req.friendship_id, 'decline')}
                              className="w-7 h-7 rounded-lg bg-[#27272a] hover:bg-zinc-700 border border-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] flex items-center justify-center transition-colors"
                              title="Decline request"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Outgoing Pending Invitations */}
                  {outgoingRequests.length > 0 && (
                    <div className="pt-2 border-t border-[#27272a] space-y-2">
                      <span className="text-[11px] text-[#a1a1aa] font-medium">
                        Pending invitations sent by you:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {outgoingRequests.map((req) => (
                          <span
                            key={req.friendship_id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#18181b] border border-[#27272a] text-[11px] text-zinc-300"
                          >
                            <span className="truncate max-w-[100px]">{req.display_name}</span>
                            <button
                              onClick={() => handleRemoveFriend(req.friendship_id, req.display_name)}
                              className="text-[#a1a1aa] hover:text-red-400"
                              title="Cancel invitation"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB 2: GLOBAL LEADERBOARD                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'global' && (
          <div className="space-y-6">
            {/* Top 3 Podium Highlights (Shown when at least 3 users & no active filter) */}
            {!globalFilter && filteredGlobalLeaderboard.length >= 3 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* #2 Rank Card */}
                {filteredGlobalLeaderboard[1] && (
                  <div className="rounded-xl border border-zinc-700/60 bg-[#202024]/70 p-4 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-2 right-3 text-2xl font-bold font-mono text-zinc-400/20 select-none">
                      #2
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <UserAvatar
                        name={filteredGlobalLeaderboard[1].display_name}
                        avatarUrl={filteredGlobalLeaderboard[1].avatar_url}
                        status={filteredGlobalLeaderboard[1].live_status}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[#f4f4f5] truncate">
                            {filteredGlobalLeaderboard[1].display_name}
                          </span>
                          {filteredGlobalLeaderboard[1].is_self && (
                            <span className="text-[10px] font-bold px-1 rounded bg-sky-500/20 text-sky-400">
                              YOU
                            </span>
                          )}
                        </div>
                        {filteredGlobalLeaderboard[1].username && (
                          <p className="text-xs text-[#a1a1aa] font-mono truncate">
                            @{filteredGlobalLeaderboard[1].username}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#27272a]">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-400">
                        <Flame className="w-3.5 h-3.5 fill-amber-500" />
                        {filteredGlobalLeaderboard[1].current_streak}d streak
                      </span>
                      <span className="text-[#a1a1aa] font-mono">
                        {Math.round(filteredGlobalLeaderboard[1].momentum_score)}% momentum
                      </span>
                    </div>
                  </div>
                )}

                {/* #1 Rank Card (Gold) */}
                {filteredGlobalLeaderboard[0] && (
                  <div className="rounded-xl border border-amber-500/40 bg-[#202024] p-4 relative overflow-hidden flex flex-col justify-between shadow-lg ring-1 ring-amber-500/20">
                    <div className="absolute top-2 right-3 text-2xl font-bold font-mono text-amber-400/20 select-none">
                      #1
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <UserAvatar
                        name={filteredGlobalLeaderboard[0].display_name}
                        avatarUrl={filteredGlobalLeaderboard[0].avatar_url}
                        status={filteredGlobalLeaderboard[0].live_status}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-base text-[#f4f4f5] truncate">
                            {filteredGlobalLeaderboard[0].display_name}
                          </span>
                          {filteredGlobalLeaderboard[0].is_self && (
                            <span className="text-[10px] font-bold px-1 rounded bg-sky-500/20 text-sky-400">
                              YOU
                            </span>
                          )}
                        </div>
                        {filteredGlobalLeaderboard[0].username && (
                          <p className="text-xs text-[#a1a1aa] font-mono truncate">
                            @{filteredGlobalLeaderboard[0].username}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-amber-500/20">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-400">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        {filteredGlobalLeaderboard[0].current_streak}d streak
                      </span>
                      <span className="text-amber-300 font-mono font-bold">
                        {Math.round(filteredGlobalLeaderboard[0].momentum_score)}% momentum
                      </span>
                    </div>
                  </div>
                )}

                {/* #3 Rank Card (Bronze) */}
                {filteredGlobalLeaderboard[2] && (
                  <div className="rounded-xl border border-amber-700/40 bg-[#202024]/70 p-4 relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-2 right-3 text-2xl font-bold font-mono text-amber-700/20 select-none">
                      #3
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <UserAvatar
                        name={filteredGlobalLeaderboard[2].display_name}
                        avatarUrl={filteredGlobalLeaderboard[2].avatar_url}
                        status={filteredGlobalLeaderboard[2].live_status}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[#f4f4f5] truncate">
                            {filteredGlobalLeaderboard[2].display_name}
                          </span>
                          {filteredGlobalLeaderboard[2].is_self && (
                            <span className="text-[10px] font-bold px-1 rounded bg-sky-500/20 text-sky-400">
                              YOU
                            </span>
                          )}
                        </div>
                        {filteredGlobalLeaderboard[2].username && (
                          <p className="text-xs text-[#a1a1aa] font-mono truncate">
                            @{filteredGlobalLeaderboard[2].username}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#27272a]">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-400">
                        <Flame className="w-3.5 h-3.5 fill-amber-500" />
                        {filteredGlobalLeaderboard[2].current_streak}d streak
                      </span>
                      <span className="text-[#a1a1aa] font-mono">
                        {Math.round(filteredGlobalLeaderboard[2].momentum_score)}% momentum
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Global Leaderboard Table Card */}
            <div className="rounded-xl border border-[#27272a] bg-[#202024]/80 backdrop-blur-md overflow-hidden shadow-sm">
              <div className="p-4 border-b border-[#27272a] flex items-center justify-between bg-[#202024]/40">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    WORLDWIDE FOCUS RANKINGS
                  </h2>
                </div>
                <span className="text-[11px] text-[#a1a1aa] font-medium">
                  Ranked by Active Streak & Deep-Work Momentum
                </span>
              </div>

              {isLoadingGlobal ? (
                <div className="p-12 text-center text-[#a1a1aa] space-y-3">
                  <div className="w-6 h-6 border-2 border-zinc-500 border-t-white rounded-full animate-spin mx-auto" />
                  <p className="text-xs">Fetching worldwide leaderboard...</p>
                </div>
              ) : filteredGlobalLeaderboard.length === 0 ? (
                <div className="p-12 text-center text-[#a1a1aa] space-y-2">
                  <Globe className="w-8 h-8 mx-auto text-zinc-600" />
                  <p className="text-sm font-medium text-zinc-300">No members match your search</p>
                  <p className="text-xs text-[#a1a1aa]">Try a different search query or clear the filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#27272a] bg-[#202024]/60 text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">RANK</th>
                        <th className="py-3 px-4">MEMBER</th>
                        <th className="py-3 px-4 text-center">STREAK</th>
                        <th className="py-3 px-4 text-center">MOMENTUM</th>
                        <th className="py-3 px-4">ACTIVE TRACKS</th>
                        <th className="py-3 px-4 text-right">SOCIAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272a]/50 text-xs">
                      {filteredGlobalLeaderboard.map((entry) => {
                        const isTop1 = entry.rank === 1;
                        const isTop2 = entry.rank === 2;
                        const isTop3 = entry.rank === 3;
                        const status = entry.friendship_status;

                        return (
                          <tr
                            key={entry.user_id}
                            className={`group transition-colors ${
                              entry.is_self
                                ? 'bg-sky-500/[0.05] hover:bg-sky-500/[0.08]'
                                : 'hover:bg-[#27272a]/40'
                            }`}
                          >
                            {/* 1. Rank */}
                            <td className="py-3 px-4 text-center font-mono font-bold">
                              {isTop1 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs">
                                  1
                                </span>
                              ) : isTop2 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-300/20 border border-zinc-300/40 text-zinc-200 text-xs">
                                  2
                                </span>
                              ) : isTop3 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 border border-amber-700/40 text-amber-500 text-xs">
                                  3
                                </span>
                              ) : (
                                <span className="text-[#a1a1aa] font-mono text-xs font-semibold">
                                  #{entry.rank}
                                </span>
                              )}
                            </td>

                            {/* 2. Member */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <UserAvatar
                                  name={entry.display_name}
                                  avatarUrl={entry.avatar_url}
                                  status={entry.live_status}
                                  size="md"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-[#f4f4f5] truncate text-sm">
                                      {entry.display_name}
                                    </span>
                                    {entry.is_self && (
                                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                        YOU
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-[#a1a1aa]">
                                    {entry.username && (
                                      <span className="font-mono text-[#a1a1aa]/80">@{entry.username}</span>
                                    )}
                                    {entry.live_status === 'focusing' && (
                                      <span className="text-[11px] text-emerald-400 font-medium">
                                        · Focusing now
                                      </span>
                                    )}
                                    {entry.live_status === 'online' && (
                                      <span className="text-[11px] text-emerald-400/80 font-medium">
                                        · Online
                                      </span>
                                    )}
                                    {entry.live_status === 'offline' && (
                                      <span className="text-[11px] text-[#a1a1aa]/60">· Offline</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 3. Streak */}
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full">
                                  <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-400" />
                                  {entry.current_streak}d
                                </span>
                                <span className="text-[10px] text-[#a1a1aa] font-mono mt-1">
                                  Best: {entry.longest_streak}d
                                </span>
                              </div>
                            </td>

                            {/* 4. Momentum */}
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono font-bold text-[#f4f4f5] text-xs">
                                    {Math.round(entry.momentum_score)}%
                                  </span>
                                  <span className="text-[9px] uppercase tracking-wider font-semibold text-[#a1a1aa] bg-[#18181b] border border-[#27272a] px-1.5 py-0.5 rounded">
                                    {entry.momentum_label}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#a1a1aa] font-mono mt-1">
                                  7d Flow:{' '}
                                  {entry.deep_work_ratio !== null && entry.deep_work_ratio !== undefined
                                    ? `${Math.round(entry.deep_work_ratio)}%`
                                    : '—'}
                                </span>
                              </div>
                            </td>

                            {/* 5. Active Tracks */}
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300 bg-[#18181b] border border-[#27272a] px-2.5 py-1 rounded-lg">
                                <Activity className="w-3 h-3 text-[#a1a1aa] shrink-0" />
                                <span className="truncate max-w-[140px]">{entry.active_tracks_summary}</span>
                              </span>
                            </td>

                            {/* 6. Social Connection Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {entry.is_self ? (
                                  <span className="text-[11px] text-sky-400 font-mono font-medium">
                                    (You)
                                  </span>
                                ) : status === 'accepted' ? (
                                  <button
                                    onClick={() =>
                                      setActiveChatFriend({
                                        id: entry.user_id,
                                        name: entry.display_name,
                                        username: entry.username,
                                        avatar: entry.avatar_url,
                                        live_status: entry.live_status,
                                      })
                                    }
                                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg transition-colors"
                                    title="Open Chat"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>Chat</span>
                                  </button>
                                ) : status === 'pending_sent' ? (
                                  <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                                    Request Sent
                                  </span>
                                ) : status === 'pending_received' ? (
                                  <button
                                    onClick={() =>
                                      entry.friendship_id && handleRespond(entry.friendship_id, 'accept')
                                    }
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    Accept
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleSendRequest(entry.user_id, entry.display_name)}
                                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[#f4f4f5] border border-zinc-700 text-[10px] font-semibold rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                    Add Friend
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Slide-Over Chat Drawer ── */}
      <AnimatePresence>
        {activeChatFriend && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveChatFriend(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md h-full bg-[#18181b] border-l border-[#27272a] flex flex-col shadow-2xl z-10"
            >
              {/* Header */}
              <div className="p-4 border-b border-[#27272a] flex items-center justify-between bg-[#202024]">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    name={activeChatFriend.name}
                    avatarUrl={activeChatFriend.avatar}
                    status={activeChatFriend.live_status}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[#f4f4f5] text-sm truncate">{activeChatFriend.name}</h3>
                      {activeChatFriend.live_status === 'focusing' && (
                        <span className="text-[10px] text-emerald-400 font-medium">· Focusing</span>
                      )}
                      {activeChatFriend.live_status === 'online' && (
                        <span className="text-[10px] text-emerald-400/80 font-medium">· Online</span>
                      )}
                    </div>
                    {activeChatFriend.username && (
                      <p className="text-[11px] text-[#a1a1aa] font-mono truncate">
                        @{activeChatFriend.username}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setActiveChatFriend(null)}
                  className="p-1.5 rounded-lg text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-colors shrink-0"
                  title="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[#a1a1aa] space-y-2">
                    <MessageSquare className="w-8 h-8 text-zinc-600" />
                    <p className="text-xs">No messages yet with {activeChatFriend.name}.</p>
                    <p className="text-[11px] text-zinc-500">
                      Cheer them on or sync up on your focus goals!
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.is_self ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed break-words ${
                          msg.is_self
                            ? 'bg-[#27272a] text-[#f4f4f5] border border-zinc-700/50 rounded-br-none'
                            : 'bg-[#202024] text-[#f4f4f5] border border-[#27272a] rounded-bl-none'
                        }`}
                      >
                        {msg.content}
                      </div>
                      {msg.created_at && (
                        <span className="text-[9px] text-[#a1a1aa] mt-1 px-1 font-mono">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-[#27272a] bg-[#202024] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Message ${activeChatFriend.name}...`}
                  maxLength={1000}
                  className="flex-1 px-3.5 py-2.5 bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-[#f4f4f5] placeholder-[#a1a1aa]/60 focus:outline-none focus:border-zinc-500 transition-all"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isSendingMessage}
                  className="p-2.5 bg-[#27272a] hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 text-[#f4f4f5] rounded-xl transition-colors shrink-0"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
