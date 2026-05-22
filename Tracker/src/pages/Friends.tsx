import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, UserPlus, Inbox, Search, Check, X, UserMinus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Profile {
    id: string; // The row UUID (we may not strictly need this anymore)
    user_id: string; // The Auth UUID 
    username: string;
    full_name: string;
}

interface Connection {
    id: string;
    requester_id: string;
    receiver_id: string;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
    profiles: Profile; // The joined profile data
}

export default function Friends() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState('friends');
    const [loading, setLoading] = useState(true);

    // State for connections
    const [friends, setFriends] = useState<Connection[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<Connection[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<Connection[]>([]);

    // State for searching
    const [searchUsername, setSearchUsername] = useState('');
    const [searchResult, setSearchResult] = useState<Profile | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (user) {
            fetchConnections();
        }
    }, [user]);

    if (!authLoading && !user) {
        return <Navigate to="/auth" replace />;
    }

    const fetchConnections = async () => {
        if (!user) return;
        setLoading(true);

        try {
            // 1. Fetch where user is the requester
            const { data: requestedData, error: reqError } = await supabase
                .from('connections')
                .select(`
          id, requester_id, receiver_id, status, created_at,
          profiles!connections_receiver_id_fkey(user_id, username, full_name)
        `)
                .eq('requester_id', user.id);

            if (reqError) throw reqError;

            // 2. Fetch where user is the receiver
            const { data: receivedData, error: recError } = await supabase
                .from('connections')
                .select(`
          id, requester_id, receiver_id, status, created_at,
          profiles!connections_requester_id_fkey(user_id, username, full_name)
        `)
                .eq('receiver_id', user.id);

            if (recError) throw recError;

            // Process and categorize
            const formatConnection = (conn: any): Connection => ({
                id: conn.id,
                requester_id: conn.requester_id,
                receiver_id: conn.receiver_id,
                status: conn.status,
                created_at: conn.created_at,
                profiles: conn.profiles as Profile
            });

            const allRequested = (requestedData || []).map(formatConnection);
            const allReceived = (receivedData || []).map(formatConnection);

            // Friends: Accepted connections (from both arrays)
            const accepted = [
                ...allRequested.filter(c => c.status === 'accepted'),
                ...allReceived.filter(c => c.status === 'accepted')
            ];

            // Pending Outgoing: Requested by me, still pending
            const pendingOut = allRequested.filter(c => c.status === 'pending');

            // Pending Incoming: Received by me, still pending
            const pendingIn = allReceived.filter(c => c.status === 'pending');

            setFriends(accepted);
            setOutgoingRequests(pendingOut);
            setIncomingRequests(pendingIn);

        } catch (error: any) {
            toast({ title: 'Error fetching connections', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchUsername.trim() || !user) return;

        if (searchUsername.toLowerCase() === user.user_metadata?.username?.toLowerCase()) {
            toast({ title: 'Invalid Search', description: "You cannot add yourself.", variant: 'destructive' });
            return;
        }

        setIsSearching(true);
        setSearchResult(null);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, user_id, username, full_name')
                .eq('username', searchUsername.toLowerCase())
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                toast({ title: 'Not Found', description: `No user found with username '${searchUsername}'`, variant: 'destructive' });
            } else {
                setSearchResult(data);
            }
        } catch (error: any) {
            toast({ title: 'Search Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSearching(false);
        }
    };

    const sendRequest = async (receiverId: string) => {
        if (!user) return;

        // Check if a connection already exists
        const existingConnection =
            friends.find(f => f.profiles.user_id === receiverId) ||
            outgoingRequests.find(f => f.profiles.user_id === receiverId) ||
            incomingRequests.find(f => f.profiles.user_id === receiverId);

        if (existingConnection) {
            toast({ title: 'Cannot Send', description: 'A connection with this user already exists or is pending.', variant: 'destructive' });
            return;
        }

        try {
            const { error } = await supabase
                .from('connections')
                .insert({
                    requester_id: user.id,
                    receiver_id: receiverId,
                    status: 'pending'
                });

            if (error) throw error;

            toast({ title: 'Request Sent', description: 'Friend request sent successfully!' });
            setSearchUsername('');
            setSearchResult(null);
            fetchConnections(); // refresh lists
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    const updateConnectionStatus = async (connectionId: string, status: 'accepted' | 'rejected') => {
        try {
            const { error } = await supabase
                .from('connections')
                .update({ status })
                .eq('id', connectionId);

            if (error) throw error;

            toast({ title: 'Success', description: `Friend request ${status}.` });
            fetchConnections();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    const deleteConnection = async (connectionId: string) => {
        try {
            const { error } = await supabase
                .from('connections')
                .delete()
                .eq('id', connectionId);

            if (error) throw error;

            toast({ title: 'Removed', description: 'Connection removed.' });
            fetchConnections();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground pb-24 md:pb-8 relative overflow-x-hidden">
            {/* Background ambient shape */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

            {/* App Header */}
            <header className="px-6 pt-8 pb-6 flex items-center justify-between sticky top-0 bg-secondary/90 backdrop-blur-xl z-50">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 hover:bg-muted -ml-2 shrink-0" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">Network</p>
                        <h2 className="text-xl font-extrabold tracking-tight leading-none">Friends</h2>
                    </div>
                </div>
            </header>

            <main className="px-6 space-y-8 max-w-lg mx-auto md:max-w-3xl relative z-10 pt-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex overflow-x-auto pb-6 hide-scrollbar -mx-6 px-6">
                        <TabsList className="bg-transparent space-x-2 p-0 h-auto">
                            <TabsTrigger value="friends" className="rounded-full px-5 py-2.5 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-xl bg-secondary/50 font-bold border-0 transition-all flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                My Friends {friends.length > 0 && <span className="opacity-70 text-xs ml-1">({friends.length})</span>}
                            </TabsTrigger>
                            <TabsTrigger value="add" className="rounded-full px-5 py-2.5 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-xl bg-secondary/50 font-bold border-0 transition-all flex items-center gap-2">
                                <UserPlus className="h-4 w-4" />
                                Add Friend
                            </TabsTrigger>
                            <TabsTrigger value="requests" className="rounded-full px-5 py-2.5 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-xl bg-secondary/50 font-bold border-0 transition-all flex items-center gap-2">
                                <Inbox className="h-4 w-4" />
                                Requests {incomingRequests.length > 0 && <span className="text-destructive font-black ml-1 text-xs">+{incomingRequests.length}</span>}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="friends" className="mt-0">
                        {friends.length === 0 ? (
                            <div className="text-center py-16 px-6 bg-secondary/20 rounded-[2rem] border border-dashed border-border/50">
                                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Users className="h-8 w-8 text-muted-foreground/50" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground mb-2">No friends yet</h3>
                                <p className="text-sm text-muted-foreground font-medium">Head over to the Add Friend tab to connect with someone!</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {friends.map(friend => (
                                    <div key={friend.id} className="flex items-center justify-between p-4 group hover:bg-muted/30 transition-colors rounded-2xl">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center text-primary-foreground font-bold shadow-md shrink-0">
                                                {friend.profiles.full_name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-base text-foreground leading-tight">{friend.profiles.full_name}</p>
                                                <p className="text-xs font-medium text-muted-foreground lowercase mt-0.5">@{friend.profiles.username}</p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-10 w-10 rounded-full transition-colors shrink-0" onClick={() => deleteConnection(friend.id)}>
                                            <UserMinus className="h-5 w-5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="add" className="mt-0 space-y-8">
                        <div>
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 px-2">Find a User</h3>
                            <form onSubmit={handleSearch} className="flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        placeholder="e.g. john_doe"
                                        className="pl-12 h-14 bg-secondary/50 border-0 rounded-2xl font-bold text-base placeholder:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary shadow-inner"
                                        value={searchUsername}
                                        onChange={(e) => setSearchUsername(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" className="h-14 px-8 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5" disabled={isSearching || !searchUsername.trim()}>
                                    {isSearching ? '...' : 'Search'}
                                </Button>
                            </form>
                        </div>

                        {searchResult && (
                            <div className="p-4 bg-primary/5 border border-primary/20 rounded-[2rem] flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold shadow-md shrink-0">
                                        {searchResult.full_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-lg text-foreground leading-tight">{searchResult.full_name}</p>
                                        <p className="text-sm font-medium text-muted-foreground lowercase mt-0.5">@{searchResult.username}</p>
                                    </div>
                                </div>
                                <Button onClick={() => sendRequest(searchResult.user_id)} className="h-10 rounded-full px-5 font-bold shadow-sm shrink-0">
                                    <UserPlus className="h-4 w-4 mr-2" /> Request
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="requests" className="mt-0 space-y-10">
                        {/* Incoming */}
                        <div>
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 px-2 flex justify-between items-center">
                                Incoming Alerts
                                {incomingRequests.length > 0 && <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">{incomingRequests.length}</span>}
                            </h3>
                            {incomingRequests.length === 0 ? (
                                <p className="text-sm text-center text-muted-foreground font-medium py-6 bg-secondary/20 rounded-3xl">No new incoming requests.</p>
                            ) : (
                                <div className="space-y-1">
                                    {incomingRequests.map(req => (
                                        <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 hover:bg-muted/30 transition-colors rounded-[1.5rem] bg-secondary/30 gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-muted-foreground to-muted-foreground/60 flex items-center justify-center text-background font-bold shadow-sm shrink-0">
                                                    {req.profiles.full_name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-base text-foreground leading-tight">{req.profiles.full_name}</p>
                                                    <p className="text-xs font-medium text-muted-foreground lowercase mt-0.5">@{req.profiles.username}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 pl-16 sm:pl-0">
                                                <Button size="sm" className="h-9 rounded-full px-6 bg-success hover:bg-success/90 text-success-foreground font-bold shadow-sm w-full sm:w-auto" onClick={() => updateConnectionStatus(req.id, 'accepted')}>
                                                    Accept
                                                </Button>
                                                <Button size="icon" variant="outline" className="h-9 w-9 rounded-full border-border text-destructive hover:bg-destructive/10 transition-colors shrink-0" onClick={() => updateConnectionStatus(req.id, 'rejected')}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Outgoing */}
                        <div>
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 px-2 flex justify-between items-center">
                                Sent Requests
                                {outgoingRequests.length > 0 && <span className="bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">{outgoingRequests.length}</span>}
                            </h3>
                            {outgoingRequests.length === 0 ? (
                                <p className="text-sm text-center text-muted-foreground font-medium py-6 bg-secondary/20 rounded-3xl">No tracking outgoing requests.</p>
                            ) : (
                                <div className="space-y-1">
                                    {outgoingRequests.map(req => (
                                        <div key={req.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-2xl opacity-75">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full border border-dashed border-muted-foreground flex items-center justify-center text-muted-foreground font-bold shrink-0">
                                                    {req.profiles.full_name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm text-foreground">{req.profiles.full_name}</p>
                                                    <p className="text-[11px] font-medium text-muted-foreground lowercase mt-0.5">Pending approval</p>
                                                </div>
                                            </div>
                                            <Button size="sm" variant="ghost" className="text-destructive font-bold hover:bg-destructive/10 hover:text-destructive shrink-0 transition-colors rounded-full" onClick={() => deleteConnection(req.id)}>
                                                Cancel
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                </Tabs>
            </main>
        </div>
    );
}
