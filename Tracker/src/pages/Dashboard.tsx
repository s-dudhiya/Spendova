import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LogOut, Plus, Check, Utensils, Truck, Receipt, Wallet, User, Trash2, Users, ArrowDownRight, ArrowUpRight, Sun, Moon, ChevronRight, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AddExpenseForm } from '@/components/AddExpenseForm';
import { AddTiffinForm } from '@/components/AddTiffinForm';
import { EmptyState } from '@/components/EmptyState';
import { ExpenseFilters, FilterOptions } from '@/components/ExpenseFilters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BottomNav } from '@/components/layout/BottomNav';
import { EditExpenseDialog, EditableExpense } from '@/components/EditExpenseDialog';

interface Profile {
  full_name: string;
  username: string;
}

interface ExpenseSplit {
  id: string;
  user_id: string;
  amount_owed: number;
  has_paid: boolean;
  profiles?: Profile;
}

interface Expense {
  id: string;
  user_id: string;
  paid_by: string; // NEW FIELD
  amount: number;
  category: string;
  note?: string;
  status: 'pending' | 'cleared';
  split_type?: string;
  created_at: string;
  updated_at: string;
  expense_splits?: ExpenseSplit[];
  profiles?: Profile;
  payer_profile?: Profile;
}

interface GroupItem {
  id: string;
  name: string;
  emoji: string;
  created_by: string;
  group_members: { user_id: string }[];
}

const categoryConfig = {
  tiffin: { icon: Utensils, amount: 90, label: 'Tiffin' },
  delivery: { icon: Truck, amount: 15, label: 'Delivery' },
  miscellaneous: { icon: Receipt, amount: null, label: 'Miscellaneous' },
};

export default function Dashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddTiffinForm, setShowAddTiffinForm] = useState(false);
  const [mainTab, setMainTab] = useState('overview');
  const [tiffinTab, setTiffinTab] = useState('tiffin');
  const [splitwiseSubTab, setSplitwiseSubTab] = useState<'friends' | 'groups'>('friends');
  const [filters, setFilters] = useState<FilterOptions>({ timeRange: 'all', status: 'all' });
  const { toast } = useToast();

  // Groups state (for Splitwise > Groups sub-tab)
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(null);

  const handleTabChange = (tab: string) => setMainTab(tab);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      fetchExpenses();
    }
  }, [user]);

  const fetchGroups = async () => {
    if (!user) return;
    setGroupsLoading(true);
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, emoji, created_by, group_members(user_id)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGroups((data || []) as unknown as GroupItem[]);
    } catch (e) { console.error(e); } finally { setGroupsLoading(false); }
  };

  // Fetch groups when switching to splitwise tab's groups sub-tab
  useEffect(() => {
    if (mainTab === 'splitwise' && splitwiseSubTab === 'groups' && user) fetchGroups();
  }, [mainTab, splitwiseSubTab, user]);

  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(`
          *,
          profiles!expenses_user_id_fkey(full_name, username),
          payer_profile:profiles!expenses_paid_by_fkey(full_name, username),
          expense_splits(id, user_id, amount_owed, has_paid, profiles!expense_splits_user_id_fkey(full_name, username))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses((data || []) as unknown as Expense[]);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch expenses', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const markAsCleared = async (id: string) => {
    try {
      const { error } = await supabase.from('expenses').update({ status: 'cleared' }).eq('id', id);
      if (error) throw error;
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: 'cleared' as const } : e));
      toast({ title: 'Success', description: 'Expense marked as cleared' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update expense', variant: 'destructive' });
    }
  };

  const markSplitAsPaid = async (splitId: string, expenseId: string) => {
    try {
      const { error } = await supabase.from('expense_splits').update({ has_paid: true }).eq('id', splitId);
      if (error) throw error;

      // Check if all splits for this expense are now paid
      const parentExpense = expenses.find(e => e.id === expenseId);
      if (parentExpense && parentExpense.expense_splits) {
        const remainingUnpaid = parentExpense.expense_splits.filter(s => s.id !== splitId && !s.has_paid);
        if (remainingUnpaid.length === 0) {
          // Auto-clear the parent expense!
          await supabase.from('expenses').update({ status: 'cleared' }).eq('id', expenseId);
          toast({ title: 'Expense Cleared!', description: 'All splits have been settled.' });
        } else {
          toast({ title: 'Settled', description: 'Marked split as paid!' });
        }
      } else {
        toast({ title: 'Settled', description: 'Marked split as paid!' });
      }

      fetchExpenses(); // Re-fetch to update all nested states safely
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update split', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      setExpenses(prev => prev.filter(expense => expense.id !== id));
      toast({ title: 'Success', description: 'Expense deleted successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete expense', variant: 'destructive' });
    }
  };

  const applyFilters = (expenseList: Expense[]) => {
    let filtered = [...expenseList];

    if (filters.timeRange !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      switch (filters.timeRange) {
        case 'this-month':
          filterDate.setMonth(now.getMonth(), 1); filterDate.setHours(0, 0, 0, 0); break;
        case 'last-month':
          filterDate.setMonth(now.getMonth() - 1, 1); filterDate.setHours(0, 0, 0, 0);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
          endOfLastMonth.setHours(23, 59, 59, 999);
          filtered = filtered.filter(e => {
            const d = new Date(e.created_at); return d >= filterDate && d <= endOfLastMonth;
          });
          break;
        case 'this-week': {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
          filterDate.setTime(startOfWeek.getTime());
          break;
        }
      }
      if (filters.timeRange !== 'last-month') {
        filtered = filtered.filter(e => new Date(e.created_at) >= filterDate);
      }
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(e => {
        // Custom logic: if it's a split I owe, check my split status.
        if (user && e.paid_by !== user.id) {
          const mySplit = e.expense_splits?.find(s => s.user_id === user.id);
          if (mySplit) return filters.status === 'cleared' ? mySplit.has_paid : !mySplit.has_paid;
        }
        return e.status === filters.status;
      });
    }

    return filtered;
  };

  const filterExpensesByCategory = (category: string) => applyFilters(expenses.filter(e => e.category === category));

  const getSummary = () => {
    if (!user) return { totalPending: 0, totalLent: 0, chartData: [], totalPersonalSpent: 0, tiffinPending: 0, deliveryPending: 0, tiffinCleared: 0, splitOwe: 0, splitOwed: 0 };
    const filteredExpenses = applyFilters(expenses);

    let totalPending = 0;
    let totalLent = 0;
    let totalPersonalSpent = 0;
    let tiffinPending = 0;
    let deliveryPending = 0;
    let tiffinCleared = 0;
    let splitOwe = 0;
    let splitOwed = 0;

    const categoryTotals: Record<string, number> = {};
    Object.keys(categoryConfig).forEach(k => categoryTotals[k] = 0);

    filteredExpenses.forEach(e => {
      const isActuallySplit = e.expense_splits && e.expense_splits.length > 0;
      const isPayer = e.paid_by === user.id;
      const mySplit = !isPayer ? e.expense_splits?.find(s => s.user_id === user.id) : null;
      const isTiffinOrDelivery = e.category === 'tiffin' || e.category === 'delivery';

      // 1. Personal Ledger Tracking (Not Tiffin/Delivery)
      if (!isTiffinOrDelivery) {
        if (isPayer) {
          if (!isActuallySplit) {
            totalPersonalSpent += e.amount;
          } else {
            const sumOwedByOthers = e.expense_splits!.reduce((acc, s) => acc + s.amount_owed, 0);
            totalPersonalSpent += (e.amount - sumOwedByOthers);
          }
        } else if (mySplit) {
          totalPersonalSpent += mySplit.amount_owed;
        }
      }

      // 2. Tiffin/Delivery Tracking
      if (isTiffinOrDelivery) {
        if (e.status === 'pending') {
          if (e.category === 'tiffin') tiffinPending += e.amount;
          if (e.category === 'delivery') deliveryPending += e.amount;
        } else if (e.status === 'cleared') {
          // Both Tiffin and Delivery count towards total cleared
          tiffinCleared += e.amount;
        }
      }

      // 3. Splitwise Tracking (For debts/credits)
      // Only for expenses we are involved in and are strictly "Pending" or involve unpaid splits
      if (isPayer) {
        if (isActuallySplit) {
          e.expense_splits!.forEach(s => {
            if (!s.has_paid) {
              totalLent += s.amount_owed;
              if (!isTiffinOrDelivery) splitOwed += s.amount_owed;
            }
          });
        } else {
          if (e.status === 'pending') totalPending += e.amount;
        }

        if (categoryTotals[e.category] !== undefined) {
          categoryTotals[e.category] += e.amount;
        }
      } else {
        if (mySplit && !mySplit.has_paid) {
          totalPending += mySplit.amount_owed;
          if (!isTiffinOrDelivery) splitOwe += mySplit.amount_owed;
        }
      }
    });

    const chartData = Object.keys(categoryConfig).map(key => ({
      name: categoryConfig[key as keyof typeof categoryConfig].label,
      total: categoryTotals[key]
    }));

    return { totalPending, totalLent, chartData, totalPersonalSpent, tiffinPending, deliveryPending, tiffinCleared, splitOwe, splitOwed };
  };

  const { totalPending, totalLent, chartData, totalPersonalSpent, tiffinPending, deliveryPending, tiffinCleared, splitOwe, splitOwed } = getSummary();

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        </div>
      </div>
    );
  }

  function getDisplayName() {
    return profile?.full_name || user?.email?.split('@')[0] || 'User';
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 md:pb-8 relative overflow-x-hidden">
      {/* Background ambient shape */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {/* App Header */}
      <header className="px-6 pt-6 pb-4 flex justify-between items-center fixed top-0 left-0 right-0 bg-secondary/90 md:bg-secondary/80 backdrop-blur-xl z-50 border-b border-border/40 max-w-lg md:max-w-none mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20 text-lg">
            💰
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-foreground">ExpenseMate</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-muted w-10 h-10 transition-transform active:scale-90"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark'
              ? <Sun className="h-5 w-5 text-warning transition-all duration-300 rotate-0 scale-100" />
              : <Moon className="h-5 w-5 transition-all duration-300 rotate-0 scale-100" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted w-10 h-10" onClick={() => navigate('/friends')} title="Friends">
            <Users className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted w-10 h-10" onClick={() => navigate('/profile')} title="Profile">
            <User className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="px-6 space-y-8 max-w-lg mx-auto md:max-w-3xl relative z-10 pt-24">

        {/* Core Balance Hero */}
        <div className="flex flex-col items-center justify-center text-center py-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
            Net Balance
          </p>
          <h1 className="text-6xl font-black tracking-tighter text-foreground flex items-center justify-center">
            <span className="text-3xl font-bold text-muted-foreground mr-1.5 -translate-y-2">₹</span>
            {Math.abs(totalLent - totalPending).toFixed(2)}
          </h1>
          <div className="mt-6 flex gap-3 text-sm font-bold">
            <div className="flex items-center gap-1.5 bg-success/10 text-success px-4 py-1.5 rounded-full">
              <ArrowUpRight className="h-4 w-4" /> ₹{totalLent.toFixed(2)}
            </div>
            <div className="flex items-center gap-1.5 bg-warning/10 text-warning px-4 py-1.5 rounded-full">
              <ArrowDownRight className="h-4 w-4" /> ₹{totalPending.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Quick Action Pills */}
        <div className="flex justify-center gap-3">
          <Button onClick={() => setShowAddForm(true)} className="rounded-full px-6 h-12 shadow-xl shadow-primary/20 hover:shadow-primary/30 font-bold hover:-translate-y-0.5 transition-all">
            <Plus className="mr-2 h-4 w-4" /> Add Expense
          </Button>
          <Button onClick={() => setShowAddTiffinForm(true)} variant="secondary" className="rounded-full px-6 h-12 font-bold bg-secondary/60 hover:bg-secondary hover:-translate-y-0.5 transition-all">
            <Utensils className="mr-2 h-4 w-4" /> Tiffin
          </Button>
        </div>

        <div className="pt-4">
          <Tabs value={mainTab} onValueChange={handleTabChange} className="w-full">
            <div className="hidden md:flex overflow-x-auto pb-6 hide-scrollbar -mx-6 px-6">
              <TabsList className="bg-transparent space-x-2 p-0 h-auto">
                {['overview', 'personal', 'splitwise', 'tiffin'].map(tab => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-full px-5 py-2.5 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-xl bg-secondary/50 font-bold border-0 capitalize transition-all"
                  >
                    {tab === 'tiffin' ? 'Food Log' : tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-0">
              <div className="mb-8">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-6 px-2">Spending by Category</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} dy={10} />
                      <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)', fontWeight: 'bold' }} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Groups CTA card */}
              <div
                onClick={() => navigate('/groups')}
                className="flex items-center justify-between p-5 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-3xl cursor-pointer hover:from-primary/15 hover:to-primary/10 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-2xl">
                    👥
                  </div>
                  <div>
                    <p className="font-extrabold text-base">Group Expenses</p>
                    <p className="text-sm text-muted-foreground font-medium">Trips, apartments &amp; more</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
            </TabsContent>

            <TabsContent value="personal" className="mt-0 space-y-8">
              <div className="text-center py-6 bg-secondary/30 rounded-3xl border border-border/40">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Total Lifetime Spent</p>
                <div className="text-4xl font-black tracking-tighter text-foreground">₹{totalPersonalSpent.toFixed(2)}</div>
              </div>

              <ExpenseFilters filters={filters} onFiltersChange={setFilters} />

              <div className="space-y-4">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 px-2">Personal Activity Feed</h3>
                {expenses.filter(e => e.category !== 'tiffin' && e.category !== 'delivery').length === 0 ? (
                  <div className="text-center py-10 px-4 text-muted-foreground font-medium bg-secondary/20 rounded-3xl">No personal expenses logged yet</div>
                ) : (
                  <div className="space-y-1">
                    {expenses.filter(e => e.category !== 'tiffin' && e.category !== 'delivery').map(expense => (
                      <PersonalLedgerCard key={expense.id} expense={expense} currentUserId={user.id} onDelete={handleDelete} onEdit={setEditingExpense} onMarkCleared={markAsCleared} />
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="splitwise" className="mt-0">
              {/* Friends | Groups sub-tabs */}
              <div className="flex mb-6 bg-secondary/40 p-1 rounded-full w-fit mx-auto h-auto">
                <button
                  onClick={() => setSplitwiseSubTab('friends')}
                  className={`rounded-full px-6 py-2 text-sm font-bold transition-all ${splitwiseSubTab === 'friends'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Friends
                </button>
                <button
                  onClick={() => setSplitwiseSubTab('groups')}
                  className={`rounded-full px-6 py-2 text-sm font-bold transition-all ${splitwiseSubTab === 'groups'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Groups
                </button>
              </div>

              {splitwiseSubTab === 'friends' ? (
                <>
                  <ExpenseFilters filters={filters} onFiltersChange={setFilters} />
                  <div className="mt-6">
                    <ExpenseCategoryView
                      expenses={expenses.filter(e =>
                        e.category !== 'tiffin' && e.category !== 'delivery' &&
                        (e.split_type !== 'none' || (e.expense_splits && e.expense_splits.length > 0) || e.paid_by !== user.id)
                      )}
                      category="splitwise"
                      currentUserId={user.id}
                      onMarkCleared={markAsCleared}
                      onMarkSplitPaid={markSplitAsPaid}
                      onDelete={handleDelete}
                      onEdit={setEditingExpense}
                      filters={filters}
                    />
                  </div>
                </>
              ) : (
                <GroupsInline groups={groups} loading={groupsLoading} onNavigate={() => navigate('/groups')} />
              )}
            </TabsContent>

            <TabsContent value="tiffin" className="mt-0">
              <div className="grid grid-cols-3 gap-2 mb-8">
                <div className="bg-warning/10 border border-warning/20 p-3 sm:p-5 rounded-2xl sm:rounded-3xl text-center flex flex-col justify-center">
                  <p className="text-[9px] sm:text-[10px] font-bold text-warning uppercase tracking-widest mb-1">Tiffin Pending</p>
                  <p className="text-lg sm:text-2xl font-black text-warning">₹{tiffinPending.toFixed(2)}</p>
                </div>
                <div className="bg-warning/10 border border-warning/20 p-3 sm:p-5 rounded-2xl sm:rounded-3xl text-center flex flex-col justify-center">
                  <p className="text-[9px] sm:text-[10px] font-bold text-warning uppercase tracking-widest mb-1">Delivery Pending</p>
                  <p className="text-lg sm:text-2xl font-black text-warning">₹{deliveryPending.toFixed(2)}</p>
                </div>
                <div className="bg-success/10 border border-success/20 p-3 sm:p-5 rounded-2xl sm:rounded-3xl text-center flex flex-col justify-center">
                  <p className="text-[9px] sm:text-[10px] font-bold text-success uppercase tracking-widest mb-1">Cleared</p>
                  <p className="text-lg sm:text-2xl font-black text-success">₹{tiffinCleared.toFixed(2)}</p>
                </div>
              </div>

              <ExpenseFilters filters={filters} onFiltersChange={setFilters} />

              <Tabs value={tiffinTab} onValueChange={setTiffinTab} className="mt-8">
                <TabsList className="flex mb-6 bg-secondary/40 p-1 rounded-full w-fit mx-auto h-auto">
                  <TabsTrigger value="tiffin" className="rounded-full px-6 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold text-sm">Tiffin</TabsTrigger>
                  <TabsTrigger value="delivery" className="rounded-full px-6 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold text-sm">Delivery</TabsTrigger>
                </TabsList>

                {['tiffin', 'delivery'].map(category => (
                  <TabsContent key={category} value={category} className="mt-0">
                    <ExpenseCategoryView expenses={filterExpensesByCategory(category)} category={category} currentUserId={user.id} onMarkCleared={markAsCleared} onMarkSplitPaid={markSplitAsPaid} onDelete={handleDelete} onEdit={setEditingExpense} filters={filters} />
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {showAddForm && <AddExpenseForm onClose={() => setShowAddForm(false)} onSuccess={() => { setShowAddForm(false); fetchExpenses(); }} />}
      {showAddTiffinForm && <AddTiffinForm onClose={() => setShowAddTiffinForm(false)} onSuccess={() => { setShowAddTiffinForm(false); fetchExpenses(); }} />}
      {editingExpense && (
        <EditExpenseDialog
          expense={editingExpense}
          currentUserId={user.id}
          onClose={() => setEditingExpense(null)}
          onSuccess={() => { setEditingExpense(null); fetchExpenses(); }}
        />
      )}

      <BottomNav currentTab={mainTab} onTabChange={setMainTab} />
    </div>
  );
}

function PersonalLedgerCard({ expense, currentUserId, onDelete, onEdit, onMarkCleared }: {
  expense: Expense; currentUserId: string;
  onDelete?: (id: string) => void;
  onEdit?: (e: EditableExpense) => void;
  onMarkCleared?: (id: string) => void;
}) {
  const isPayer = expense.paid_by === currentUserId;
  let myShare = 0;
  if (isPayer) {
    if (expense.expense_splits && expense.expense_splits.length > 0) {
      const otherShares = expense.expense_splits.reduce((acc, s) => acc + s.amount_owed, 0);
      myShare = expense.amount - otherShares;
    } else {
      myShare = expense.amount;
    }
  } else {
    const mySplit = expense.expense_splits?.find(s => s.user_id === currentUserId);
    if (mySplit) myShare = mySplit.amount_owed;
  }

  if (myShare <= 0) return null;

  const isPending = expense.status !== 'cleared';

  return (
    <div className="flex items-center justify-between p-4 group hover:bg-muted/30 transition-colors rounded-2xl">
      <div className="flex items-center gap-4 min-w-0" onClick={() => isPending && onEdit?.(expense as unknown as EditableExpense)} style={{ cursor: isPending && onEdit ? 'pointer' : 'default' }}>
        <div className="h-12 w-12 rounded-[1rem] bg-secondary flex items-center justify-center shrink-0">
          <Receipt className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 pr-2">
          <h4 className="font-bold text-base text-foreground capitalize truncate">{expense.category}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{new Date(expense.created_at).toLocaleDateString()}</span>
            {expense.note && <span className="text-xs font-medium text-muted-foreground truncate hidden sm:inline-block">• {expense.note}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className={`text-lg font-bold tracking-tighter mr-1 ${isPending ? 'text-foreground' : 'text-success/70'}`}>₹{myShare.toFixed(2)}</span>
        {/* Mark Cleared — always visible when pending */}
        {isPending && onMarkCleared && (
          <Button
            variant="ghost"
            size="icon"
            title="Mark as Cleared"
            className="text-success hover:bg-success/10 h-8 w-8 transition-colors"
            onClick={() => onMarkCleared(expense.id)}
          >
            <Check className="h-4 w-4" />
          </Button>
        )}
        {isPending && onEdit && (
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 transition-colors md:opacity-0 group-hover:opacity-100" onClick={() => onEdit(expense as unknown as EditableExpense)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8 transition-colors md:opacity-0 group-hover:opacity-100" onClick={() => onDelete(expense.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ExpenseCategoryView({
  expenses, category, currentUserId, onMarkCleared, onMarkSplitPaid, onDelete, onEdit, filters
}: {
  expenses: Expense[]; category: string; currentUserId: string;
  onMarkCleared: (id: string) => void;
  onMarkSplitPaid: (splitId: string, expenseId: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (e: EditableExpense) => void;
  filters: FilterOptions;
}) {
  const pendingExpenses = expenses.filter(e => {
    // If you didn't pay for it (you are a debtor or just the logger who owes)
    if (e.paid_by !== currentUserId) {
      const mySplit = e.expense_splits?.find(s => s.user_id === currentUserId);
      return mySplit ? !mySplit.has_paid : false;
    }
    // If you DID pay for it, it's pending if the main status is pending (waiting for anyone to pay)
    return e.status === 'pending';
  });

  const clearedExpenses = expenses.filter(e => {
    // If you didn't pay for it (you are a debtor)
    if (e.paid_by !== currentUserId) {
      const mySplit = e.expense_splits?.find(s => s.user_id === currentUserId);
      return mySplit ? mySplit.has_paid : false;
    }
    // If you DID pay for it, it's only truly cleared history when everyone has paid
    return e.status === 'cleared';
  });

  if (expenses.length === 0) return <EmptyState category={category} message={`No expenses found here`} />;

  return (
    <div className="space-y-8 mt-4">
      <div>
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 px-2 flex items-center justify-between">
          <span>Pending Actions</span>
          <span className="bg-warning/10 text-warning px-2 py-0.5 rounded-full">{pendingExpenses.length}</span>
        </h3>
        {pendingExpenses.length === 0 ? (
          <div className="text-center py-6 px-4 text-muted-foreground font-medium border border-dashed rounded-3xl">All caught up</div>
        ) : (
          <div className="space-y-1">
            {pendingExpenses.map(expense => (
              <ExpenseCard key={expense.id} expense={expense} currentUserId={currentUserId} onMarkCleared={onMarkCleared} onMarkSplitPaid={onMarkSplitPaid} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 px-2 flex items-center justify-between">
          <span>History</span>
          <span className="bg-success/10 text-success px-2 py-0.5 rounded-full">{clearedExpenses.length}</span>
        </h3>
        {clearedExpenses.length === 0 ? (
          <div className="text-center py-6 px-4 text-muted-foreground font-medium border border-dashed rounded-3xl">No cleared history</div>
        ) : (
          <div className="space-y-1">
            {clearedExpenses.map(expense => (
              category === 'splitwise'
                ? <SplitHistoryCard key={expense.id} expense={expense} currentUserId={currentUserId} onDelete={onDelete} />
                : <ExpenseCard key={expense.id} expense={expense} currentUserId={currentUserId} onMarkSplitPaid={onMarkSplitPaid} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseCard({
  expense, currentUserId, onMarkCleared, onMarkSplitPaid, onDelete, onEdit
}: {
  expense: Expense; currentUserId: string;
  onMarkCleared?: (id: string) => void;
  onMarkSplitPaid?: (splitId: string, expenseId: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (e: EditableExpense) => void;
}) {
  const config = categoryConfig[expense.category as keyof typeof categoryConfig];
  const Icon = config?.icon || Receipt;

  const isCreator = expense.user_id === currentUserId; // Can delete it
  const isPayer = expense.paid_by === currentUserId;  // Is owed money
  const isSplitExpense = Array.isArray(expense.expense_splits) && expense.expense_splits.length > 0;

  // If I didn't pay for it, find my specific split details (what I owe)
  const mySplit = !isPayer ? expense.expense_splits?.find(s => s.user_id === currentUserId) : null;

  const displayAmount = isPayer ? expense.amount : (mySplit?.amount_owed || expense.amount);
  const isPending = isPayer ? expense.status === 'pending' : (mySplit ? !mySplit.has_paid : false);

  // Note text if someone else paid
  let paidByNote = '';
  if (!isPayer) {
    paidByNote = `Owed to ${expense.payer_profile?.full_name || 'a friend'}`;
  } else if (isPayer && isSplitExpense) {
    // If you are the payer, list who owes you in the breakdown, but we can also add a top level note
    const owedByNames = expense.expense_splits?.filter(s => !s.has_paid).map(s => s.profiles?.full_name).join(', ');
    if (owedByNames) paidByNote = `Waiting on ${owedByNames}`;
  }

  return (
    <div className="p-4 sm:p-5 bg-secondary/20 hover:bg-secondary/40 transition-colors rounded-3xl border border-border/40 relative overflow-hidden group mb-3">
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${isPayer && isSplitExpense ? 'bg-primary' : !isPayer ? 'bg-warning' : 'bg-transparent'}`}></div>

      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3.5 min-w-0 pr-3">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-[1rem] bg-secondary flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-base truncate block w-full" title={expense.category}>
              {config?.label || expense.category}
            </span>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block">{new Date(expense.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-xl sm:text-2xl font-black tracking-tighter text-foreground">₹{displayAmount}</div>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isPending ? 'text-warning' : 'text-success'}`}>{isPending ? 'Pending' : 'Cleared'}</span>
          </div>
          {onEdit && isPending && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => onEdit(expense as unknown as EditableExpense)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => onDelete(expense.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5 pl-14 sm:pl-16">
        {!isPayer ? (
          <p className="text-xs font-bold text-warning flex items-center gap-1.5">
            <ArrowDownRight className="h-3.5 w-3.5" /> {paidByNote}
          </p>
        ) : isSplitExpense && isPending ? (
          <p className="text-xs font-bold text-primary flex items-center gap-1.5">
            <ArrowUpRight className="h-3.5 w-3.5" /> {paidByNote}
          </p>
        ) : null}
        {expense.note && <p className="text-sm font-medium text-foreground/80 mt-1 line-clamp-2">{expense.note}</p>}
      </div>

      {isPayer && isSplitExpense && (
        <div className="mt-4 pt-4 border-t border-border/50 pl-14 sm:pl-16 space-y-2.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Split Details</p>
          {expense.expense_splits?.map(split => (
            <div key={split.id} className="flex items-center justify-between text-sm font-medium">
              <span className="text-foreground/80">{split.profiles?.full_name}</span>
              <span className="flex items-center gap-2">
                ₹{split.amount_owed}
                {split.has_paid
                  ? <span className="bg-success/10 text-success text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Paid</span>
                  : <span className="text-warning text-[10px] font-bold uppercase tracking-wider bg-warning/10 px-2 py-0.5 rounded-full">Owes</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="mt-5 pl-14 sm:pl-16 flex flex-col sm:flex-row gap-2">
        {isPayer && !isSplitExpense && isPending && onMarkCleared && (
          <Button onClick={() => onMarkCleared(expense.id)} size="sm" className="w-full sm:w-auto rounded-full font-bold px-5 bg-success hover:bg-success/90">
            Mark as Cleared
          </Button>
        )}

        {!isPayer && mySplit && isPending && onMarkSplitPaid && (
          <Button onClick={() => onMarkSplitPaid(mySplit.id, expense.id)} size="sm" className="w-full sm:w-auto rounded-full font-bold px-5 bg-primary hover:bg-primary/90 text-primary-foreground">
            Pay ₹{mySplit.amount_owed}
          </Button>
        )}

        {isPayer && isSplitExpense && isPending && onMarkSplitPaid && (
          <div className="flex flex-wrap gap-2 w-full">
            {expense.expense_splits?.filter(s => !s.has_paid).map(split => (
              <Button key={split.id} onClick={() => onMarkSplitPaid(split.id, expense.id)} size="sm" variant="outline" className="border-success text-success hover:bg-success/10 flex-1 sm:flex-none rounded-full font-bold px-5">
                Mark {split.profiles?.full_name}'s Share
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SplitHistoryCard({ expense, currentUserId, onDelete, onEdit }: {
  expense: Expense; currentUserId: string;
  onDelete?: (id: string) => void;
  onEdit?: (e: EditableExpense) => void;
}) {
  const isPayer = expense.paid_by === currentUserId;
  let myShare = 0;

  if (isPayer) {
    if (expense.expense_splits && expense.expense_splits.length > 0) {
      myShare = expense.expense_splits.reduce((acc, s) => acc + s.amount_owed, 0);
    } else {
      myShare = expense.amount;
    }
  } else {
    const mySplit = expense.expense_splits?.find(s => s.user_id === currentUserId);
    if (mySplit) myShare = mySplit.amount_owed;
  }

  if (myShare <= 0) return null;

  const isCreator = expense.user_id === currentUserId;
  const Icon = categoryConfig[expense.category as keyof typeof categoryConfig]?.icon || Receipt;

  return (
    <div className="flex items-center justify-between p-4 bg-secondary/20 hover:bg-secondary/40 transition-colors rounded-2xl cursor-pointer opacity-75 hover:opacity-100 mb-2">
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-10 w-10 rounded-[1rem] bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md ${isPayer ? 'text-success bg-success/10' : 'text-muted-foreground bg-muted'}`}>Settled</span>
            <h4 className="font-bold text-sm text-foreground capitalize truncate">{expense.category}</h4>
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            {isPayer
              ? `From ${expense.expense_splits?.map(s => s.profiles?.full_name).join(', ') || 'someone'}`
              : `To ${expense.payer_profile?.full_name || 'someone'}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-lg font-bold tracking-tighter ${isPayer ? 'text-success' : 'text-muted-foreground'}`}>{isPayer ? '+' : '-'}₹{myShare.toFixed(2)}</span>
        {onEdit && (
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 transition-colors" onClick={() => onEdit(expense as unknown as EditableExpense)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8 transition-colors" onClick={() => onDelete(expense.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Groups Inline (inside Splitwise tab) ─────────────────────
const GRADIENT_COLORS_DASH = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-indigo-500 to-blue-600',
];
function getGroupGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_COLORS_DASH[Math.abs(hash) % GRADIENT_COLORS_DASH.length];
}

function GroupsInline({ groups, loading, onNavigate }: { groups: GroupItem[]; loading: boolean; onNavigate: () => void }) {
  return (
    <div className="space-y-3 mt-2">
      {/* Header with CTA */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Your Groups</p>
        <button
          onClick={onNavigate}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New Group
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-20 rounded-3xl bg-secondary/40 animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div
          onClick={onNavigate}
          className="flex flex-col items-center justify-center py-14 px-6 bg-secondary/20 rounded-3xl border border-dashed border-border/50 cursor-pointer hover:bg-secondary/30 transition-colors group"
        >
          <div className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-3xl shadow-lg">
              👥
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow">
              <Plus className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
          </div>
          <p className="font-bold text-base text-foreground mb-1">No groups yet</p>
          <p className="text-sm text-muted-foreground font-medium text-center">
            Create a group for trips, apartments, or any shared costs
          </p>
        </div>
      ) : (
        <>
          {groups.map(group => {
            const gradient = getGroupGradient(group.id);
            const memberCount = group.group_members?.length || 0;
            return (
              <div
                key={group.id}
                onClick={onNavigate}
                className="flex items-center gap-4 p-4 bg-secondary/20 hover:bg-secondary/40 transition-all rounded-2xl border border-border/40 cursor-pointer group active:scale-[0.98]"
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-xl shrink-0 shadow-md`}>
                  {group.emoji || '🏠'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-sm truncate">{group.name}</p>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    {memberCount} member{memberCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
              </div>
            );
          })}

          {/* View all link */}
          <button
            onClick={onNavigate}
            className="w-full py-3 text-sm font-bold text-primary hover:text-primary/80 transition-colors text-center rounded-2xl hover:bg-primary/5"
          >
            Manage All Groups →
          </button>
        </>
      )}
    </div>
  );
}