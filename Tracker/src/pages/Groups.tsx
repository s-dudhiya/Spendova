import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
    ArrowLeft, Plus, Users, Trash2, ArrowUpRight, ArrowDownRight,
    Receipt, ChevronRight, Crown, Check, Share2, Wallet, Pencil, Settings2, UserPlus, X
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EditExpenseDialog, EditableExpense } from '@/components/EditExpenseDialog';

// ─── Types ───────────────────────────────────────────────────
interface Profile {
    user_id: string;
    full_name: string;
    username: string;
}

interface GroupMember {
    user_id: string;
    joined_at: string;
    profiles: Profile;
}

interface Group {
    id: string;
    name: string;
    emoji: string;
    description?: string;
    created_by: string;
    created_at: string;
    group_members: GroupMember[];
}

interface ExpenseSplit {
    id: string;
    user_id: string;
    amount_owed: number;
    has_paid: boolean;
    profiles?: Profile;
}

interface GroupExpense {
    id: string;
    user_id: string;
    paid_by: string;
    amount: number;
    category: string;
    note?: string;
    status: string;
    split_type: string;
    created_at: string;
    group_id: string;
    expense_splits: ExpenseSplit[];
    payer_profile?: Profile;
}

interface BalanceEntry {
    fromUserId: string;
    toUserId: string;
    fromName: string;
    toName: string;
    amount: number;
}

// ─── Emoji options ────────────────────────────────────────────
const EMOJI_OPTIONS = ['🏠', '✈️', '🎉', '🍕', '⚽', '🏖️', '🎮', '💼', '🌍', '🏕️', '🍻', '🎵', '🚗', '📚', '💪', '🎯', '🌮', '🏋️', '🎸', '🏔️'];

// ─── Helpers ─────────────────────────────────────────────────
const GRADIENT_COLORS = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-cyan-600',
    'from-emerald-500 to-teal-600',
    'from-rose-500 to-pink-600',
    'from-amber-500 to-orange-600',
    'from-indigo-500 to-blue-600',
];

function getGroupGradient(groupId: string) {
    let hash = 0;
    for (let i = 0; i < groupId.length; i++) hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
    return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

/** Compute simplified net balances: who owes whom and how much */
function computeBalances(expenses: GroupExpense[], currentUserId: string): BalanceEntry[] {
    // net[A][B] > 0 means A owes B that amount
    const net: Record<string, Record<string, number>> = {};

    const ensure = (a: string, b: string) => {
        if (!net[a]) net[a] = {};
        if (!net[b]) net[b] = {};
        if (net[a][b] === undefined) net[a][b] = 0;
        if (net[b][a] === undefined) net[b][a] = 0;
    };

    expenses.forEach(e => {
        if (!e.expense_splits?.length) return;
        e.expense_splits.forEach(split => {
            if (split.has_paid) return;
            ensure(split.user_id, e.paid_by);
            net[split.user_id][e.paid_by] += split.amount_owed;
        });
    });

    // Simplify: cancel reciprocal debts
    const entries: BalanceEntry[] = [];
    const processed = new Set<string>();

    Object.keys(net).forEach(from => {
        Object.keys(net[from]).forEach(to => {
            const key = [from, to].sort().join('|');
            if (processed.has(key)) return;
            processed.add(key);

            const aOwesB = net[from]?.[to] || 0;
            const bOwesA = net[to]?.[from] || 0;
            const diff = aOwesB - bOwesA;

            if (Math.abs(diff) < 0.01) return;

            if (diff > 0) {
                entries.push({ fromUserId: from, toUserId: to, fromName: '', toName: '', amount: diff });
            } else {
                entries.push({ fromUserId: to, toUserId: from, fromName: '', toName: '', amount: -diff });
            }
        });
    });

    return entries;
}

// ─── Main Component ───────────────────────────────────────────
export default function Groups() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [groupExpenses, setGroupExpenses] = useState<GroupExpense[]>([]);
    const [expensesLoading, setExpensesLoading] = useState(false);

    // Create group state
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupEmoji, setNewGroupEmoji] = useState('🏠');
    const [newGroupDesc, setNewGroupDesc] = useState('');
    const [friends, setFriends] = useState<Profile[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [creatingGroup, setCreatingGroup] = useState(false);

    // Add expense state
    const [showAddExpense, setShowAddExpense] = useState(false);

    // Edit group state
    const [showEditGroup, setShowEditGroup] = useState(false);
    const [editGroupName, setEditGroupName] = useState('');
    const [editGroupEmoji, setEditGroupEmoji] = useState('🏠');
    const [editGroupDesc, setEditGroupDesc] = useState('');
    const [savingGroup, setSavingGroup] = useState(false);

    // Add member state
    const [showAddMember, setShowAddMember] = useState(false);
    const [addMemberIds, setAddMemberIds] = useState<string[]>([]);
    const [addingMember, setAddingMember] = useState(false);

    // Email invite state
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviting, setInviting] = useState(false);
    const [groupInvites, setGroupInvites] = useState<{ id: string; email: string; status: string; created_at: string }[]>([]);

    const fetchGroups = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('groups')
                .select(`
          id, name, emoji, description, created_by, created_at,
          group_members(user_id, joined_at, profiles!group_members_user_id_fkey(user_id, full_name, username))
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setGroups((data || []) as unknown as Group[]);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [user, toast]);

    const fetchGroupExpenses = useCallback(async (groupId: string) => {
        setExpensesLoading(true);
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select(`
          id, user_id, paid_by, amount, category, note, status, split_type, created_at, group_id,
          payer_profile:profiles!expenses_paid_by_fkey(user_id, full_name, username),
          expense_splits(id, user_id, amount_owed, has_paid, profiles!expense_splits_user_id_fkey(user_id, full_name, username))
        `)
                .eq('group_id', groupId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setGroupExpenses((data || []) as unknown as GroupExpense[]);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setExpensesLoading(false);
        }
    }, [toast]);

    const fetchFriends = useCallback(async () => {
        if (!user) return;
        try {
            const [req, rec] = await Promise.all([
                supabase.from('connections').select('profiles!connections_receiver_id_fkey(user_id, full_name, username)').eq('requester_id', user.id).eq('status', 'accepted'),
                supabase.from('connections').select('profiles!connections_requester_id_fkey(user_id, full_name, username)').eq('receiver_id', user.id).eq('status', 'accepted'),
            ]);
            const list: Profile[] = [];
            req.data?.forEach((d: any) => d.profiles && list.push(d.profiles));
            rec.data?.forEach((d: any) => d.profiles && list.push(d.profiles));
            setFriends(list);
        } catch (e) { console.error(e); }
    }, [user]);

    useEffect(() => { if (user) { fetchGroups(); fetchFriends(); } }, [user, fetchGroups, fetchFriends]);
    useEffect(() => { if (selectedGroup) { fetchGroupExpenses(selectedGroup.id); fetchGroupInvites(selectedGroup.id); } }, [selectedGroup, fetchGroupExpenses]);

    const fetchGroupInvites = async (groupId: string) => {
        const { data } = await (supabase as any)
            .from('group_invites')
            .select('id, email, status, created_at')
            .eq('group_id', groupId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        setGroupInvites((data || []) as { id: string; email: string; status: string; created_at: string }[]);
    };

    const handleSendEmailInvite = async () => {
        if (!selectedGroup || !inviteEmail.trim() || !user) return;
        setInviting(true);
        try {
            // Get inviter's profile name
            const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', user.id).single();
            const inviterName = profile?.full_name || 'A friend';

            const { error } = await supabase.functions.invoke('send-invite', {
                body: {
                    email: inviteEmail.trim().toLowerCase(),
                    group_id: selectedGroup.id,
                    group_name: selectedGroup.name,
                    inviter_name: inviterName,
                }
            });
            if (error) throw error;
            toast({ title: 'Invite sent! 📬', description: `${inviteEmail} will receive an email.` });
            setInviteEmail('');
            fetchGroupInvites(selectedGroup.id);
        } catch (e: any) {
            toast({ title: 'Failed to send', description: e.message, variant: 'destructive' });
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveMember = async (groupId: string, userId: string) => {
        if (!confirm('Are you sure you want to remove this member?')) return;
        try {
            const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', userId);
            if (error) throw error;
            toast({ title: 'Member removed!' });

            if (userId === user?.id) {
                setSelectedGroup(null);
                fetchGroups();
            } else {
                // Re-fetch the specific group to update the members list UI
                const { data } = await supabase
                    .from('groups')
                    .select(`
                        id, name, emoji, description, created_by, created_at,
                        group_members(user_id, joined_at, profiles!group_members_user_id_fkey(user_id, full_name, username))
                    `)
                    .eq('id', groupId)
                    .single();
                if (data) setSelectedGroup(data as unknown as Group);
                fetchGroups(); // Also update the main list
            }
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
    };

    const handleResendInvite = async (email: string) => {
        if (!selectedGroup || !user) return;
        try {
            const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', user.id).single();
            await supabase.functions.invoke('send-invite', {
                body: {
                    email,
                    group_id: selectedGroup.id,
                    group_name: selectedGroup.name,
                    inviter_name: profile?.full_name || 'A friend',
                }
            });
            toast({ title: 'Reminder sent! 🔔', description: `${email} was reminded.` });
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
    };

    if (!authLoading && !user) return <Navigate to="/auth" replace />;

    const handleCreateGroup = async () => {
        if (!user || !newGroupName.trim()) return;
        setCreatingGroup(true);
        try {
            // 1. Insert group
            const { data: grpData, error: grpErr } = await supabase
                .from('groups')
                .insert({ name: newGroupName.trim(), emoji: newGroupEmoji, description: newGroupDesc.trim() || null, created_by: user.id })
                .select('id').single();
            if (grpErr || !grpData) throw grpErr;

            // 2. Add creator as member
            const memberInserts = [{ group_id: grpData.id, user_id: user.id }, ...selectedMembers.map(uid => ({ group_id: grpData.id, user_id: uid }))];
            const { error: memErr } = await supabase.from('group_members').insert(memberInserts);
            if (memErr) throw memErr;

            toast({ title: 'Group Created!', description: `"${newGroupName}" is ready.` });
            setShowCreateGroup(false);
            setNewGroupName(''); setNewGroupEmoji('🏠'); setNewGroupDesc(''); setSelectedMembers([]);
            fetchGroups();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!confirm('Delete this group and all its expenses?')) return;
        try {
            const { error } = await supabase.from('groups').delete().eq('id', groupId);
            if (error) throw error;
            toast({ title: 'Group Deleted' });
            setSelectedGroup(null);
            fetchGroups();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
    };

    const handleEditGroup = async () => {
        if (!selectedGroup || !editGroupName.trim()) return;
        setSavingGroup(true);
        try {
            const { error } = await supabase
                .from('groups')
                .update({ name: editGroupName.trim(), emoji: editGroupEmoji, description: editGroupDesc.trim() || null })
                .eq('id', selectedGroup.id);
            if (error) throw error;
            toast({ title: 'Group updated!' });
            setShowEditGroup(false);
            fetchGroups();
            // Update selectedGroup inline too
            setSelectedGroup(prev => prev ? { ...prev, name: editGroupName.trim(), emoji: editGroupEmoji, description: editGroupDesc.trim() } : prev);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setSavingGroup(false);
        }
    };

    const handleAddMembers = async () => {
        if (!selectedGroup || addMemberIds.length === 0) return;
        setAddingMember(true);
        try {
            const inserts = addMemberIds.map(uid => ({ group_id: selectedGroup.id, user_id: uid }));
            const { error } = await supabase.from('group_members').insert(inserts);
            if (error) throw error;
            toast({ title: `${addMemberIds.length} member(s) added!` });
            setShowAddMember(false);
            setAddMemberIds([]);
            fetchGroups();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setAddingMember(false);
        }
    };

    const handleDeleteGroupExpense = async (expenseId: string) => {
        try {
            const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
            if (error) throw error;
            toast({ title: 'Expense deleted' });
            if (selectedGroup) fetchGroupExpenses(selectedGroup.id);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
    };

    const handleSettleUp = async (fromUserId: string, toUserId: string) => {
        if (!selectedGroup) return;
        try {
            // Mark all pending splits where fromUser owes toUser in this group
            const splitsToSettle = groupExpenses
                .filter(e => e.paid_by === toUserId)
                .flatMap(e => e.expense_splits.filter(s => s.user_id === fromUserId && !s.has_paid))
                .map(s => s.id);

            if (splitsToSettle.length === 0) {
                toast({ title: 'Nothing to settle' }); return;
            }

            const { error } = await supabase.from('expense_splits').update({ has_paid: true }).in('id', splitsToSettle);
            if (error) throw error;
            toast({ title: 'Settled!', description: 'Balance cleared successfully.' });
            fetchGroupExpenses(selectedGroup.id);
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
    };

    // Render group detail
    if (selectedGroup) {
        // Derive non-member friends (for add member dialog)
        const existingMemberIds = new Set(selectedGroup.group_members.map(m => m.user_id));
        const nonMembers = friends.filter(f => !existingMemberIds.has(f.user_id));

        return (
            <GroupDetailView
                group={selectedGroup}
                expenses={groupExpenses}
                expensesLoading={expensesLoading}
                currentUserId={user!.id}
                nonMemberFriends={nonMembers}
                pendingInvites={groupInvites}
                onBack={() => setSelectedGroup(null)}
                onDelete={() => handleDeleteGroup(selectedGroup.id)}
                onSettleUp={handleSettleUp}
                onAddExpense={() => setShowAddExpense(true)}
                onRefresh={() => { fetchGroupExpenses(selectedGroup.id); fetchGroupInvites(selectedGroup.id); }}
                onDeleteExpense={handleDeleteGroupExpense}
                showAddExpense={showAddExpense}
                onCloseAddExpense={() => setShowAddExpense(false)}
                // Edit group
                showEditGroup={showEditGroup}
                onOpenEditGroup={() => { setEditGroupName(selectedGroup.name); setEditGroupEmoji(selectedGroup.emoji || '🏠'); setEditGroupDesc(selectedGroup.description || ''); setShowEditGroup(true); }}
                onCloseEditGroup={() => setShowEditGroup(false)}
                editGroupName={editGroupName} setEditGroupName={setEditGroupName}
                editGroupEmoji={editGroupEmoji} setEditGroupEmoji={setEditGroupEmoji}
                editGroupDesc={editGroupDesc} setEditGroupDesc={setEditGroupDesc}
                savingGroup={savingGroup} onSaveGroup={handleEditGroup}
                // Add members
                showAddMember={showAddMember}
                onOpenAddMember={() => { setAddMemberIds([]); setInviteEmail(''); setShowAddMember(true); }}
                onCloseAddMember={() => setShowAddMember(false)}
                addMemberIds={addMemberIds} setAddMemberIds={setAddMemberIds}
                addingMember={addingMember} onAddMembers={handleAddMembers}
                // Email invite
                inviteEmail={inviteEmail} setInviteEmail={setInviteEmail}
                inviting={inviting} onSendEmailInvite={handleSendEmailInvite}
                onResendInvite={handleResendInvite}
                onRemoveMember={handleRemoveMember}
            />
        );
    }

    // Groups list
    return (
        <div className="min-h-screen bg-background text-foreground pb-28 relative overflow-x-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

            <header className="px-6 pt-8 pb-6 flex items-center justify-between sticky top-0 bg-secondary/90 backdrop-blur-xl z-50 border-b border-border/40">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 hover:bg-muted -ml-2" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">Shared Expenses</p>
                        <h2 className="text-xl font-extrabold tracking-tight leading-none">Groups</h2>
                    </div>
                </div>
                <Button onClick={() => setShowCreateGroup(true)} className="rounded-full px-5 h-10 font-bold shadow-lg shadow-primary/20">
                    <Plus className="h-4 w-4 mr-1.5" /> New Group
                </Button>
            </header>

            <main className="px-4 sm:px-6 max-w-lg mx-auto md:max-w-3xl relative z-10 pt-6 space-y-4">
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-28 rounded-3xl bg-secondary/40 animate-pulse" />
                        ))}
                    </div>
                ) : groups.length === 0 ? (
                    <GroupEmptyState onCreate={() => setShowCreateGroup(true)} />
                ) : (
                    groups.map(group => (
                        <GroupCard
                            key={group.id}
                            group={group}
                            currentUserId={user!.id}
                            onClick={() => setSelectedGroup(group)}
                        />
                    ))
                )}
            </main>

            {/* Create Group Dialog */}
            <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold">Create a Group</DialogTitle>
                        <DialogDescription>Give your group a name, pick an emoji, and add members.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 pt-2">
                        {/* Emoji Picker */}
                        <div className="space-y-2">
                            <Label className="font-bold text-sm">Group Icon</Label>
                            <div className="flex flex-wrap gap-2">
                                {EMOJI_OPTIONS.map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={() => setNewGroupEmoji(emoji)}
                                        className={`w-10 h-10 text-xl rounded-2xl transition-all ${newGroupEmoji === emoji ? 'bg-primary/20 ring-2 ring-primary scale-110' : 'bg-secondary/60 hover:bg-secondary'}`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="group-name" className="font-bold text-sm">Group Name *</Label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">{newGroupEmoji}</span>
                                <Input
                                    id="group-name"
                                    className="pl-12 h-12 font-bold rounded-2xl bg-secondary/40 border-border/40"
                                    placeholder="e.g. Goa Trip 2026"
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="group-desc" className="font-bold text-sm">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Textarea
                                id="group-desc"
                                className="rounded-2xl bg-secondary/40 border-border/40 resize-none"
                                placeholder="What's this group for?"
                                rows={2}
                                value={newGroupDesc}
                                onChange={e => setNewGroupDesc(e.target.value)}
                            />
                        </div>

                        {/* Member Selection */}
                        <div className="space-y-2">
                            <Label className="font-bold text-sm">Add Members</Label>
                            {friends.length === 0 ? (
                                <p className="text-sm text-muted-foreground bg-secondary/30 rounded-2xl p-4 text-center">
                                    No friends yet. Add friends first to include them in groups.
                                </p>
                            ) : (
                                <ScrollArea className="h-44 rounded-2xl border border-border/50 bg-secondary/30 p-3">
                                    <div className="space-y-2">
                                        {friends.map(f => {
                                            const isSelected = selectedMembers.includes(f.user_id);
                                            return (
                                                <div
                                                    key={f.user_id}
                                                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-primary/10' : 'hover:bg-secondary/60'}`}
                                                    onClick={() => setSelectedMembers(prev => isSelected ? prev.filter(id => id !== f.user_id) : [...prev, f.user_id])}
                                                >
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                                                        {isSelected ? <Check className="h-4 w-4" /> : f.full_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-sm truncate">{f.full_name}</p>
                                                        <p className="text-xs text-muted-foreground">@{f.username}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            )}
                            {selectedMembers.length > 0 && (
                                <p className="text-xs text-muted-foreground text-right font-medium">{selectedMembers.length} member{selectedMembers.length > 1 ? 's' : ''} selected</p>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button variant="outline" className="flex-1 rounded-full h-12" onClick={() => setShowCreateGroup(false)}>Cancel</Button>
                            <Button
                                className="flex-1 rounded-full h-12 font-bold shadow-lg shadow-primary/20"
                                disabled={!newGroupName.trim() || creatingGroup}
                                onClick={handleCreateGroup}
                            >
                                {creatingGroup ? 'Creating...' : `Create ${newGroupEmoji}`}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Group Card ───────────────────────────────────────────────
function GroupCard({ group, currentUserId, onClick }: { group: Group; currentUserId: string; onClick: () => void }) {
    const gradient = getGroupGradient(group.id);
    const memberCount = group.group_members?.length || 0;
    const isCreator = group.created_by === currentUserId;

    return (
        <div
            onClick={onClick}
            className="relative overflow-hidden rounded-3xl border border-border/40 bg-secondary/20 hover:bg-secondary/40 transition-all duration-300 cursor-pointer group active:scale-[0.98] p-5"
        >
            <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shrink-0 shadow-lg`}>
                    {group.emoji || '🏠'}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-lg leading-tight truncate">{group.name}</h3>
                        {isCreator && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    </div>
                    {group.description && <p className="text-sm text-muted-foreground truncate mt-0.5">{group.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            {memberCount} member{memberCount !== 1 ? 's' : ''}
                        </div>
                        {/* Member avatar stack */}
                        <div className="flex -space-x-1.5">
                            {group.group_members?.slice(0, 4).map(m => (
                                <div
                                    key={m.user_id}
                                    className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/70 to-primary/40 flex items-center justify-center text-[9px] font-bold text-primary-foreground border-2 border-background"
                                    title={m.profiles?.full_name}
                                >
                                    {m.profiles?.full_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                            ))}
                            {group.group_members?.length > 4 && (
                                <div className="w-6 h-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                                    +{group.group_members.length - 4}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
            </div>
        </div>
    );
}

// ─── Group Empty State ───────────────────────────────────────
function GroupEmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="text-center py-20 px-6">
            <div className="relative inline-block mb-6">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto text-5xl shadow-xl">
                    👥
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
                    <Plus className="h-4 w-4 text-primary-foreground" />
                </div>
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-3">No groups yet</h3>
            <p className="text-muted-foreground font-medium mb-8 max-w-xs mx-auto leading-relaxed">
                Create a group for trips, apartments, or any shared expenses with friends.
            </p>
            <Button onClick={onCreate} className="rounded-full px-8 h-12 font-bold shadow-xl shadow-primary/20 text-base">
                <Plus className="h-4 w-4 mr-2" /> Create Your First Group
            </Button>
        </div>
    );
}

// ─── Group Detail View ───────────────────────────────────────
function GroupDetailView({
    group, expenses, expensesLoading, currentUserId,
    nonMemberFriends,
    pendingInvites,
    onBack, onDelete, onSettleUp, onAddExpense, onRefresh, onDeleteExpense,
    showAddExpense, onCloseAddExpense,
    showEditGroup, onOpenEditGroup, onCloseEditGroup,
    editGroupName, setEditGroupName, editGroupEmoji, setEditGroupEmoji,
    editGroupDesc, setEditGroupDesc, savingGroup, onSaveGroup,
    showAddMember, onOpenAddMember, onCloseAddMember,
    addMemberIds, setAddMemberIds, addingMember, onAddMembers,
    inviteEmail, setInviteEmail, inviting, onSendEmailInvite, onResendInvite, onRemoveMember,
}: {
    group: Group;
    expenses: GroupExpense[];
    expensesLoading: boolean;
    currentUserId: string;
    nonMemberFriends: Profile[];
    onBack: () => void;
    onDelete: () => void;
    onSettleUp: (fromId: string, toId: string) => void;
    onAddExpense: () => void;
    onRefresh: () => void;
    onDeleteExpense: (id: string) => void;
    showAddExpense: boolean;
    onCloseAddExpense: () => void;
    showEditGroup: boolean;
    onOpenEditGroup: () => void;
    onCloseEditGroup: () => void;
    editGroupName: string; setEditGroupName: (v: string) => void;
    editGroupEmoji: string; setEditGroupEmoji: (v: string) => void;
    editGroupDesc: string; setEditGroupDesc: (v: string) => void;
    savingGroup: boolean; onSaveGroup: () => void;
    showAddMember: boolean;
    onOpenAddMember: () => void;
    onCloseAddMember: () => void;
    addMemberIds: string[]; setAddMemberIds: (ids: string[]) => void;
    addingMember: boolean; onAddMembers: () => void;
    pendingInvites: { id: string; email: string; status: string; created_at: string }[];
    inviteEmail: string; setInviteEmail: (v: string) => void;
    inviting: boolean; onSendEmailInvite: () => void;
    onResendInvite: (email: string) => void;
    onRemoveMember: (groupId: string, userId: string) => void;
}) {
    const gradient = getGroupGradient(group.id);
    const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(null);

    const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);

    // Compute balances
    const rawBalances = computeBalances(expenses, currentUserId);
    // Attach names from group members
    const memberMap: Record<string, string> = {};
    group.group_members?.forEach(m => { memberMap[m.user_id] = m.profiles?.full_name || 'Unknown'; });

    const balances: BalanceEntry[] = rawBalances
        .map(b => ({ ...b, fromName: memberMap[b.fromUserId] || 'Unknown', toName: memberMap[b.toUserId] || 'Unknown' }))
        .filter(b => b.amount > 0.01);

    const myOwedBalances = balances.filter(b => b.fromUserId === currentUserId);
    const owedToMeBalances = balances.filter(b => b.toUserId === currentUserId);

    return (
        <div className="min-h-screen bg-background text-foreground pb-28 relative overflow-x-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

            {/* Header */}
            <header className="px-6 pt-8 pb-5 sticky top-0 bg-secondary/90 backdrop-blur-xl z-50 border-b border-border/40">
                <div className="flex items-center justify-between max-w-lg mx-auto">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 hover:bg-muted -ml-2 shrink-0" onClick={onBack}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-lg shrink-0 shadow-md`}>
                            {group.emoji || '🏠'}
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl font-extrabold tracking-tight leading-none truncate">{group.name}</h2>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                                {group.group_members?.length || 0} members
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onOpenAddMember} title="Add Members">
                            <UserPlus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onOpenEditGroup} title="Edit Group">
                            <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10" onClick={onDelete} title="Delete Group">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="px-4 sm:px-6 max-w-lg mx-auto md:max-w-3xl relative z-10 pt-6 space-y-6">

                {/* Hero Stats */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-secondary/30 rounded-3xl p-5 border border-border/40">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Total Spent</p>
                        <p className="text-3xl font-black tracking-tighter">₹{totalSpend.toFixed(2)}</p>
                    </div>
                    <div className="bg-secondary/30 rounded-3xl p-5 border border-border/40">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Expenses</p>
                        <p className="text-3xl font-black tracking-tighter">{expenses.length}</p>
                    </div>
                </div>

                {/* Member Avatars + Pending Ghost Avatars */}
                <div className="bg-secondary/20 rounded-3xl p-5 border border-border/40">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Members</p>
                    <div className="flex flex-wrap gap-3">
                        {/* Real members */}
                        {group.group_members?.map(m => (
                            <div key={m.user_id} className="flex flex-col items-center gap-1.5 group/avatar">
                                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getGroupGradient(m.user_id)} flex items-center justify-center text-white font-bold text-base shadow-md relative`}>
                                    {m.profiles?.full_name?.charAt(0)?.toUpperCase() || '?'}
                                    {m.user_id === group.created_by && (
                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border-2 border-background">
                                            <Crown className="h-2.5 w-2.5 text-white" />
                                        </div>
                                    )}

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveMember(group.id, m.user_id);
                                        }}
                                        className="absolute -top-1 -left-1 w-5 h-5 bg-background shadow-lg rounded-full flex items-center justify-center text-destructive border border-border/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity hover:bg-destructive hover:text-white"
                                        title={`Remove ${m.profiles?.full_name || 'member'}`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                                <span className="text-[10px] font-bold text-muted-foreground max-w-[56px] truncate text-center">
                                    {m.user_id === currentUserId ? 'You' : m.profiles?.full_name?.split(' ')[0] || '?'}
                                </span>
                            </div>
                        ))}
                        {/* Ghost avatars for pending email invites */}
                        {pendingInvites.map(inv => (
                            <div key={inv.id} className="flex flex-col items-center gap-1.5">
                                <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-border/60 bg-secondary/40 flex items-center justify-center text-muted-foreground/60 font-bold text-base relative">
                                    {inv.email.charAt(0).toUpperCase()}
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-warning/80 rounded-full flex items-center justify-center">
                                        <span className="text-[8px] text-white font-bold">?</span>
                                    </div>
                                </div>
                                <span className="text-[9px] font-bold text-muted-foreground/60 max-w-[56px] truncate text-center">Pending</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Balances */}
                {(myOwedBalances.length > 0 || owedToMeBalances.length > 0) && (
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Balances</p>

                        {myOwedBalances.map((b, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-warning/5 border border-warning/20 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-warning/20 flex items-center justify-center shrink-0">
                                        <ArrowUpRight className="h-4 w-4 text-warning" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-foreground">You owe <span className="text-warning">{b.toName}</span></p>
                                        <p className="text-xs text-muted-foreground font-medium">Pending settlement</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-lg font-black text-warning">₹{b.amount.toFixed(2)}</span>
                                    <Button
                                        size="sm"
                                        className="rounded-full h-8 px-4 text-xs font-bold bg-warning hover:bg-warning/90 text-warning-foreground shadow-md"
                                        onClick={() => onSettleUp(b.fromUserId, b.toUserId)}
                                    >
                                        Settle
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {owedToMeBalances.map((b, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-success/5 border border-success/20 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-success/20 flex items-center justify-center shrink-0">
                                        <ArrowDownRight className="h-4 w-4 text-success" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-foreground"><span className="text-success">{b.fromName}</span> owes you</p>
                                        <p className="text-xs text-muted-foreground font-medium">They need to pay you</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-lg font-black text-success">₹{b.amount.toFixed(2)}</span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-full h-8 px-4 text-xs font-bold border-success text-success hover:bg-success/10"
                                        onClick={() => onSettleUp(b.fromUserId, b.toUserId)}
                                    >
                                        Mark Paid
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Expense CTA */}
                <Button
                    onClick={onAddExpense}
                    className="w-full rounded-2xl h-14 font-bold text-base shadow-xl shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
                >
                    <Plus className="h-5 w-5 mr-2" /> Add Group Expense
                </Button>

                {/* Expense Feed */}
                <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 px-1">Expense History</p>
                    {expensesLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary/40 animate-pulse" />)}
                        </div>
                    ) : expenses.length === 0 ? (
                        <div className="text-center py-12 bg-secondary/20 rounded-3xl border border-dashed border-border/40">
                            <Receipt className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground font-medium">No expenses yet</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Add the first group expense above</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {expenses.map(expense => (
                                <GroupExpenseCard
                                    key={expense.id}
                                    expense={expense}
                                    currentUserId={currentUserId}
                                    onRefresh={onRefresh}
                                    onEdit={setEditingExpense}
                                    onDelete={onDeleteExpense}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Add Group Expense Dialog */}
            {showAddExpense && (
                <GroupExpenseForm
                    group={group}
                    currentUserId={currentUserId}
                    onClose={onCloseAddExpense}
                    onSuccess={() => { onCloseAddExpense(); onRefresh(); }}
                />
            )}

            {/* Edit Expense Dialog */}
            {editingExpense && (
                <EditExpenseDialog
                    expense={editingExpense}
                    currentUserId={currentUserId}
                    onClose={() => setEditingExpense(null)}
                    onSuccess={() => { setEditingExpense(null); onRefresh(); }}
                />
            )}

            {/* Edit Group Dialog */}
            <Dialog open={showEditGroup} onOpenChange={onCloseEditGroup}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-extrabold">Edit Group</DialogTitle>
                        <DialogDescription>Rename or update the group details.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div className="flex flex-wrap gap-2">
                            {EMOJI_OPTIONS.map(em => (
                                <button key={em} onClick={() => setEditGroupEmoji(em)}
                                    className={`w-9 h-9 text-lg rounded-xl transition-all ${editGroupEmoji === em ? 'bg-primary/20 ring-2 ring-primary scale-110' : 'bg-secondary/60 hover:bg-secondary'}`}>
                                    {em}
                                </button>
                            ))}
                        </div>
                        <Input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} placeholder="Group name" className="rounded-xl font-bold" />
                        <Input value={editGroupDesc} onChange={e => setEditGroupDesc(e.target.value)} placeholder="Description (optional)" className="rounded-xl" />
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 rounded-xl" onClick={onCloseEditGroup}>Cancel</Button>
                            <Button className="flex-1 rounded-xl font-bold" disabled={!editGroupName.trim() || savingGroup} onClick={onSaveGroup}>
                                {savingGroup ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Members Dialog */}
            <Dialog open={showAddMember} onOpenChange={onCloseAddMember}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-extrabold">Add Members</DialogTitle>
                        <DialogDescription>Add friends to this group.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        {nonMemberFriends.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-2">All your friends are already in this group.</p>
                        ) : (
                            <ScrollArea className="h-40 rounded-xl border border-border/50 bg-secondary/30 p-2">
                                <div className="space-y-1.5">
                                    {nonMemberFriends.map(f => {
                                        const sel = addMemberIds.includes(f.user_id);
                                        return (
                                            <div key={f.user_id}
                                                onClick={() => setAddMemberIds(sel ? addMemberIds.filter(id => id !== f.user_id) : [...addMemberIds, f.user_id])}
                                                className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${sel ? 'bg-primary/10' : 'hover:bg-secondary/60'}`}>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${sel ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                                                    {sel ? <Check className="h-3.5 w-3.5" /> : f.full_name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm">{f.full_name}</p>
                                                    <p className="text-xs text-muted-foreground">@{f.username}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        )}

                        {/* Invite by Email section */}
                        <div className="border-t border-border/40 pt-3 space-y-2">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Invite by Email</p>
                            <div className="flex gap-2">
                                <Input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    placeholder="friend@email.com"
                                    className="rounded-xl flex-1"
                                    onKeyDown={e => e.key === 'Enter' && onSendEmailInvite()}
                                />
                                <Button
                                    onClick={onSendEmailInvite}
                                    disabled={!inviteEmail.trim() || inviting}
                                    className="rounded-xl shrink-0 font-bold"
                                    size="sm"
                                >
                                    {inviting ? '...' : 'Send 📬'}
                                </Button>
                            </div>
                            {/* Pending invites with Remind button */}
                            {pendingInvites.length > 0 && (
                                <div className="space-y-1.5 mt-2">
                                    <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Pending ({pendingInvites.length})</p>
                                    {pendingInvites.map(inv => (
                                        <div key={inv.id} className="flex items-center justify-between p-2 rounded-xl bg-secondary/30">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full border-2 border-dashed border-border/60 bg-secondary/40 flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                                                    {inv.email.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-xs font-medium text-muted-foreground truncate max-w-[140px]">{inv.email}</span>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg"
                                                onClick={() => onResendInvite(inv.email)}
                                            >
                                                🔔 Remind
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 rounded-xl" onClick={onCloseAddMember}>Cancel</Button>
                            <Button className="flex-1 rounded-xl font-bold" disabled={addMemberIds.length === 0 || addingMember} onClick={onAddMembers}>
                                {addingMember ? 'Adding...' : `Add ${addMemberIds.length > 0 ? addMemberIds.length : ''}`}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Group Expense Card ──────────────────────────────────────
function GroupExpenseCard({ expense, currentUserId, onRefresh, onEdit, onDelete }: {
    expense: GroupExpense;
    currentUserId: string;
    onRefresh: () => void;
    onEdit?: (e: EditableExpense) => void;
    onDelete?: (id: string) => void;
}) {
    const { toast } = useToast();
    const isPayer = expense.paid_by === currentUserId;
    const mySplit = !isPayer ? expense.expense_splits?.find(s => s.user_id === currentUserId) : null;
    const totalOwed = expense.expense_splits?.reduce((s, sp) => s + sp.amount_owed, 0) || 0;
    const myShare = isPayer ? expense.amount - totalOwed : (mySplit?.amount_owed || 0);

    const allPaid = expense.expense_splits?.every(s => s.has_paid);
    const isPending = isPayer ? !allPaid : (mySplit ? !mySplit.has_paid : false);

    const handleMarkSplitPaid = async (splitId: string) => {
        try {
            const { error } = await supabase.from('expense_splits').update({ has_paid: true }).eq('id', splitId);
            if (error) throw error;
            toast({ title: 'Marked as paid!' });
            onRefresh();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
    };

    return (
        <div className="p-4 bg-secondary/20 hover:bg-secondary/40 transition-all rounded-2xl border border-border/40">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPayer ? 'bg-primary/10' : 'bg-warning/10'}`}>
                        <Receipt className={`h-4 w-4 ${isPayer ? 'text-primary' : 'text-warning'}`} />
                    </div>
                    <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{expense.category}</p>
                        <p className="text-xs text-muted-foreground font-medium">
                            {isPayer ? 'You paid' : `Paid by ${expense.payer_profile?.full_name || 'someone'}`}
                            {' · '}{new Date(expense.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                    <div className="text-right mr-1">
                        <p className="font-black text-base">₹{expense.amount.toFixed(2)}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isPending ? 'Pending' : 'Settled'}`}>
                            {isPending ? 'Pending' : 'Settled'}
                        </span>
                    </div>
                    {onEdit && isPending && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0" onClick={() => onEdit(expense as unknown as EditableExpense)}>
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {onDelete && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0" onClick={() => onDelete(expense.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {expense.note && (
                <p className="text-xs text-muted-foreground/80 mt-2 pl-[52px] font-medium">{expense.note}</p>
            )}

            {/* Split Breakdown */}
            {expense.expense_splits?.length > 0 && (
                <div className="mt-3 pl-[52px] space-y-1.5 border-t border-border/40 pt-3">
                    {expense.expense_splits.map(split => (
                        <div key={split.id} className="flex items-center justify-between text-xs font-medium">
                            <span className="text-foreground/80">
                                {split.user_id === currentUserId ? 'You' : split.profiles?.full_name}
                            </span>
                            <div className="flex items-center gap-2">
                                <span>₹{split.amount_owed.toFixed(2)}</span>
                                {split.has_paid ? (
                                    <span className="bg-success/10 text-success text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full">Paid</span>
                                ) : isPayer ? (
                                    <button
                                        onClick={() => handleMarkSplitPaid(split.id)}
                                        className="bg-primary/10 text-primary text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
                                    >
                                        Mark Paid
                                    </button>
                                ) : (
                                    <span className="bg-warning/10 text-warning text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full">Owes</span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center justify-between text-xs font-medium border-t border-border/30 pt-1.5 mt-1">
                        <span className="text-foreground/60">Your share</span>
                        <span className="font-bold text-foreground">₹{myShare.toFixed(2)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Group Expense Form ──────────────────────────────────────
function GroupExpenseForm({ group, currentUserId, onClose, onSuccess }: {
    group: Group;
    currentUserId: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const [expenseName, setExpenseName] = useState('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [splitType, setSplitType] = useState<'equal' | 'exact' | 'percentage'>('equal');
    const [paidBy, setPaidBy] = useState(currentUserId);
    const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
        group.group_members?.map(m => m.user_id) || []
    );
    const [splitValues, setSplitValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    const members = group.group_members || [];
    const parsedAmount = parseFloat(amount) || 0;

    const equalShare = selectedParticipants.length > 0 && parsedAmount > 0
        ? (parsedAmount / selectedParticipants.length).toFixed(2)
        : '0.00';

    const toggleParticipant = (uid: string) => {
        setSelectedParticipants(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!expenseName.trim() || parsedAmount <= 0) {
            toast({ title: 'Please fill all required fields', variant: 'destructive' }); return;
        }
        if (selectedParticipants.length < 2) {
            toast({ title: 'Select at least 2 participants', variant: 'destructive' }); return;
        }

        const splits: { user_id: string; amount_owed: number }[] = [];

        if (splitType === 'equal') {
            const perPerson = parsedAmount / selectedParticipants.length;
            selectedParticipants.forEach(uid => {
                if (uid !== paidBy) splits.push({ user_id: uid, amount_owed: Number(perPerson.toFixed(2)) });
            });
        } else if (splitType === 'exact') {
            let total = 0;
            for (const uid of selectedParticipants) {
                const val = parseFloat(splitValues[uid] || '0');
                if (isNaN(val) || val < 0) { toast({ title: 'Invalid split amount', variant: 'destructive' }); return; }
                total += val;
                if (uid !== paidBy && val > 0) splits.push({ user_id: uid, amount_owed: val });
            }
            if (Math.abs(total - parsedAmount) > 0.05) {
                toast({ title: 'Amounts must total ₹' + parsedAmount.toFixed(2), variant: 'destructive' }); return;
            }
        } else if (splitType === 'percentage') {
            let totalPct = 0;
            for (const uid of selectedParticipants) {
                const pct = parseFloat(splitValues[uid] || '0');
                if (isNaN(pct) || pct < 0) { toast({ title: 'Invalid percentage', variant: 'destructive' }); return; }
                totalPct += pct;
                if (uid !== paidBy && pct > 0) splits.push({ user_id: uid, amount_owed: Number((parsedAmount * pct / 100).toFixed(2)) });
            }
            if (Math.abs(totalPct - 100) > 0.1) {
                toast({ title: 'Percentages must total 100%', variant: 'destructive' }); return;
            }
        }

        setLoading(true);
        try {
            const { data: expData, error: expErr } = await supabase.from('expenses').insert({
                user_id: currentUserId,
                paid_by: paidBy,
                category: expenseName.trim(),
                amount: parsedAmount,
                note: note.trim() || null,
                status: 'pending',
                split_type: splitType,
                group_id: group.id,
                created_at: new Date(date).toISOString(),
            }).select('id').single();

            if (expErr || !expData) throw expErr;

            if (splits.length > 0) {
                const { error: splitErr } = await supabase.from('expense_splits').insert(
                    splits.map(s => ({ expense_id: expData.id, user_id: s.user_id, amount_owed: s.amount_owed, has_paid: false }))
                );
                if (splitErr) throw splitErr;
            }

            toast({ title: '✓ Expense Added', description: `₹${parsedAmount.toFixed(2)} split across ${selectedParticipants.length} people` });
            // Notify all split participants via email
            supabase.functions.invoke('send-expense-notification', { body: { expense_id: expData.id } }).catch(() => { });
            onSuccess();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-extrabold text-lg">
                        {group.emoji} Add Group Expense
                    </DialogTitle>
                    <DialogDescription>Split a new expense among group members.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="g-name" className="font-semibold text-sm">Expense Name *</Label>
                            <Input id="g-name" value={expenseName} onChange={e => setExpenseName(e.target.value)} placeholder="e.g. Hotel, Dinner" required className="rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="g-date" className="font-semibold text-sm">Date</Label>
                            <Input id="g-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="g-amount" className="font-semibold text-sm">Total Amount (₹) *</Label>
                        <Input id="g-amount" type="number" step="0.01" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required className="text-lg font-bold rounded-xl" />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="g-note" className="font-semibold text-sm">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input id="g-note" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. 2 nights stay" className="rounded-xl" />
                    </div>

                    {/* Participants */}
                    <div className="space-y-2">
                        <Label className="font-semibold text-sm">Participants</Label>
                        <div className="flex flex-wrap gap-2 p-3 bg-secondary/30 rounded-xl border border-border/40">
                            {members.map(m => {
                                const isSelected = selectedParticipants.includes(m.user_id);
                                return (
                                    <button
                                        key={m.user_id}
                                        type="button"
                                        onClick={() => toggleParticipant(m.user_id)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isSelected ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                                    >
                                        {isSelected && <Check className="h-3 w-3" />}
                                        {m.user_id === currentUserId ? 'You' : m.profiles?.full_name?.split(' ')[0] || 'Member'}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Who Paid & Split Strategy */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Who Paid?</Label>
                            <Select value={paidBy} onValueChange={setPaidBy}>
                                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {members.filter(m => selectedParticipants.includes(m.user_id)).map(m => (
                                        <SelectItem key={m.user_id} value={m.user_id}>
                                            {m.user_id === currentUserId ? 'You' : m.profiles?.full_name?.split(' ')[0]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Split By</Label>
                            <Select value={splitType} onValueChange={(v: any) => setSplitType(v)}>
                                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="equal">Equally</SelectItem>
                                    <SelectItem value="exact">Exact Amounts</SelectItem>
                                    <SelectItem value="percentage">Percentages</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Exact / Percentage inputs */}
                    {splitType !== 'equal' && selectedParticipants.length > 0 && (
                        <div className="space-y-2 p-3 bg-secondary/30 rounded-xl border border-border/40">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                {splitType === 'exact' ? 'Amount each person owes' : 'Percentage each person takes'}
                            </p>
                            {members.filter(m => selectedParticipants.includes(m.user_id)).map(m => (
                                <div key={m.user_id} className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium truncate">
                                        {m.user_id === currentUserId ? 'You' : m.profiles?.full_name?.split(' ')[0]}
                                        {m.user_id === paidBy && <span className="text-[10px] ml-1 text-primary font-bold">(Paid)</span>}
                                    </span>
                                    <div className="flex items-center gap-1 w-24 shrink-0">
                                        <Input
                                            className="h-7 text-right rounded-lg text-sm font-bold"
                                            type="number" step="0.01" min="0"
                                            placeholder="0"
                                            value={splitValues[m.user_id] || ''}
                                            onChange={e => setSplitValues(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                                        />
                                        <span className="text-xs text-muted-foreground shrink-0">{splitType === 'percentage' ? '%' : '₹'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Equal split preview */}
                    {splitType === 'equal' && selectedParticipants.length > 0 && parsedAmount > 0 && (
                        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl text-sm">
                            <span className="text-muted-foreground font-medium">Each person pays</span>
                            <span className="font-black text-primary text-base">₹{equalShare}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={loading || !expenseName.trim() || !amount} className="flex-1 rounded-full font-bold shadow-lg shadow-primary/20">
                            {loading ? 'Adding...' : 'Add Expense'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
