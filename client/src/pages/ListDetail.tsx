import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  ArrowLeft,
  ListChecks,
  Camera,
  Zap,
  Users,
  RefreshCw,
  Loader2,
  Search,
  Trash2,
  ExternalLink,
  Phone,
  MapPin
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type Lead = {
  id: number;
  name: string;
  phone: string;
  domain: string;
  city: string;
  state: string;
  category: string;
  status: string;
  overallScore: number | null;
};

type LeadList = {
  id: string;
  name: string;
  description?: string;
  listType: "static" | "snapshot" | "dynamic";
  leadCount: number;
  filterJson?: {
    minScore?: number;
    categories?: string[];
    city?: string;
    status?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export default function ListDetail() {
  const params = useParams<{ id: string }>();
  const listId = params.id;
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [leadToRemove, setLeadToRemove] = useState<Lead | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: list, isLoading: listLoading } = useQuery<LeadList>({
    queryKey: ["/api/lists", listId],
    queryFn: async () => {
      const response = await fetch(`/api/lists/${listId}`);
      if (!response.ok) throw new Error("Failed to fetch list");
      return response.json();
    },
  });

  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/lists", listId, "leads"],
    queryFn: async () => {
      const response = await fetch(`/api/lists/${listId}/leads`);
      if (!response.ok) throw new Error("Failed to fetch leads");
      return response.json();
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/lists/${listId}/refresh`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to refresh");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId, "leads"] });
      toast({ title: "List refreshed", description: "Snapshot has been updated with current data." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to refresh snapshot", variant: "destructive" });
    },
  });

  const removeLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const response = await fetch(`/api/lists/${listId}/leads/${leadId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to remove lead");
      return response.status === 204 ? null : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists", listId, "leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      toast({ title: "Lead removed", description: "Lead has been removed from this list." });
      setRemoveDialogOpen(false);
      setLeadToRemove(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove lead", variant: "destructive" });
    },
  });

  const getListTypeIcon = (type: string) => {
    switch (type) {
      case "static": return <ListChecks className="h-4 w-4" />;
      case "snapshot": return <Camera className="h-4 w-4" />;
      case "dynamic": return <Zap className="h-4 w-4" />;
      default: return <ListChecks className="h-4 w-4" />;
    }
  };

  const getListTypeBadge = (type: string) => {
    switch (type) {
      case "static": return <Badge variant="secondary">Static</Badge>;
      case "snapshot": return <Badge variant="outline" className="border-blue-500 text-blue-500">Snapshot</Badge>;
      case "dynamic": return <Badge variant="outline" className="border-amber-500 text-amber-500">Dynamic</Badge>;
      default: return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getScoreBadge = (score: number | null) => {
    if (score === null) return <Badge variant="outline">--</Badge>;
    if (score >= 80) return <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">{score}</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30">{score}</Badge>;
    return <Badge className="bg-red-500/20 text-red-500 hover:bg-red-500/30">{score}</Badge>;
  };

  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLoading = listLoading || leadsLoading;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="list-detail-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8" data-testid="list-not-found">
        <h3 className="text-lg font-medium mb-1">List not found</h3>
        <p className="text-muted-foreground mb-4">This list may have been deleted.</p>
        <Link href="/lists">
          <Button variant="outline" className="gap-2" data-testid="button-back-to-lists">
            <ArrowLeft className="h-4 w-4" />
            Back to Lists
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background p-6 space-y-6" data-testid="list-detail-page">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/lists")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
              {getListTypeIcon(list.listType)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight" data-testid="text-list-name">{list.name}</h1>
                {getListTypeBadge(list.listType)}
              </div>
              {list.description && (
                <p className="text-muted-foreground text-sm" data-testid="text-list-description">{list.description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {list.listType === "snapshot" && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-refresh-snapshot"
            >
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4" />
          <span data-testid="text-lead-count">{list.leadCount} leads</span>
        </div>
        <div>
          Updated {formatDistanceToNow(new Date(list.updatedAt), { addSuffix: true })}
        </div>
        {list.filterJson?.minScore && (
          <div>
            Min Score: {list.filterJson.minScore}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search leads..." 
          className="pl-10 bg-background"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="input-search-leads"
        />
      </div>

      {/* Leads Table */}
      {filteredLeads.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8" data-testid="empty-leads">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No leads in this list</h3>
          <p className="text-muted-foreground mb-4">
            {list.listType === "static" 
              ? "Add leads from the Leads Database using the 'Add to List' action."
              : "No leads match the current filter criteria."}
          </p>
          <Link href="/leads">
            <Button variant="outline" className="gap-2" data-testid="button-go-to-leads">
              Go to Leads Database
            </Button>
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Business</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-center">Score</TableHead>
                {list.listType === "static" && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                  <TableCell>
                    <div className="font-medium" data-testid={`text-lead-name-${lead.id}`}>{lead.name}</div>
                    {lead.domain && (
                      <a 
                        href={lead.domain.startsWith('http') ? lead.domain : `https://${lead.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-website-${lead.id}`}
                      >
                        {lead.domain}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" data-testid={`text-category-${lead.id}`}>{lead.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span data-testid={`text-location-${lead.id}`}>{lead.city}, {lead.state}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {lead.phone && (
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span data-testid={`text-phone-${lead.id}`}>{lead.phone}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {getScoreBadge(lead.overallScore)}
                  </TableCell>
                  {list.listType === "static" && (
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setLeadToRemove(lead);
                          setRemoveDialogOpen(true);
                        }}
                        data-testid={`button-remove-lead-${lead.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Remove Lead Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Lead from List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{leadToRemove?.name}" from this list? 
              The lead will still exist in your database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leadToRemove && removeLeadMutation.mutate(leadToRemove.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              {removeLeadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
