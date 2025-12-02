import { useState, Fragment } from "react";
import { Link } from "wouter";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  Download, 
  Filter, 
  Search, 
  ExternalLink, 
  ChevronRight, 
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ListPlus,
  Plus
} from "lucide-react";
import { type Lead } from "@/lib/mockData";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDomainForDisplay, getClickableUrl } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type LeadList = {
  id: string;
  name: string;
  listType: "static" | "snapshot" | "dynamic";
  leadCount: number;
};

export default function LeadsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading: settingsLoading, isError: settingsError } = useQuery({
    queryKey: ["/api/settings/agent_config"],
    queryFn: async () => {
      const response = await fetch("/api/settings/agent_config");
      if (response.ok) {
        return response.json();
      }
      throw new Error("Failed to load settings");
    },
    staleTime: 30000,
    retry: 2,
  });

  const includeJunk = settingsLoading || settingsError ? true : (settingsData?.value?.includeJunk ?? false);

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["/api/leads"],
    queryFn: async () => {
      const response = await fetch("/api/leads");
      if (!response.ok) {
        throw new Error("Failed to fetch leads");
      }
      return response.json() as Promise<Lead[]>;
    },
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["/api/lists"],
    queryFn: async () => {
      const response = await fetch("/api/lists");
      if (!response.ok) {
        throw new Error("Failed to fetch lists");
      }
      return response.json() as Promise<LeadList[]>;
    },
  });

  const addToListMutation = useMutation({
    mutationFn: async ({ listId, leadId }: { listId: string; leadId: string }) => {
      const response = await fetch(`/api/lists/${listId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [leadId], reason: "added_from_leads_page" }),
      });
      if (!response.ok) {
        throw new Error("Failed to add lead to list");
      }
      return response.json();
    },
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      const list = lists.find(l => l.id === listId);
      toast({
        title: "Lead Added",
        description: `Added to "${list?.name || 'list'}" successfully.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add lead to list.",
        variant: "destructive",
      });
    },
  });

  const staticLists = lists.filter(list => list.listType === "static");

  const junkLeadsCount = leads.filter(lead => lead.status === "junk").length;
  const hiddenJunkCount = includeJunk ? 0 : junkLeadsCount;
  
  const filteredLeads = leads
    .filter(lead => includeJunk || lead.status !== "junk")
    .filter(lead => 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      lead.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleExport = () => {
    toast({
      title: "Export Started",
      description: `Exporting ${filteredLeads.length} leads to CSV...`,
    });
  };

  const getMissingFeatures = (metrics: Lead['metrics']) => {
    const missing = [];
    if (!metrics.https_ok) missing.push({ label: "HTTPS Security", severity: "high" });
    if (!metrics.mobile_ok) missing.push({ label: "Mobile Optimization", severity: "high" });
    if (!metrics.has_booking) missing.push({ label: "Online Booking System", severity: "medium" });
    return missing;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads Database</h1>
          <p className="text-muted-foreground mt-1">
            Manage and export your qualified business leads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport} data-testid="button-export">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Link href="/lists" data-testid="link-create-list">
            <Button className="gap-2" data-testid="button-create-list">
              <Plus className="h-4 w-4" />
              Create List
            </Button>
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-card/50 p-4 rounded-lg border border-border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, category, or location..." 
            className="pl-10 bg-background"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-leads"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" data-testid="button-filter">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-md border border-border bg-card flex-1 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading leads...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <p className="text-sm">Failed to load leads</p>
            </div>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              {hiddenJunkCount > 0 ? (
                <>
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  <p className="text-sm font-medium">{hiddenJunkCount} low-score lead{hiddenJunkCount !== 1 ? 's' : ''} hidden</p>
                  <p className="text-xs text-center max-w-sm">
                    These leads scored below 75 and are marked as "junk". 
                    Enable "Include Junk Leads" in Settings to view them.
                  </p>
                  <a href="/settings" className="text-xs text-primary hover:underline">
                    Go to Settings
                  </a>
                </>
              ) : (
                <>
                  <p className="text-sm">No leads found</p>
                  <p className="text-xs">Run a mission to discover new leads</p>
                </>
              )}
            </div>
          </div>
        ) : (
        <>
          {hiddenJunkCount > 0 && (
            <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center justify-between text-sm">
              <span className="text-yellow-600 dark:text-yellow-400">
                {hiddenJunkCount} low-score lead{hiddenJunkCount !== 1 ? 's' : ''} hidden
              </span>
              <a href="/settings" className="text-primary hover:underline text-xs">
                Show in Settings
              </a>
            </div>
          )}
          <div className="overflow-auto flex-1">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-[50px]"></TableHead>
                <TableHead className="w-[250px]">Business Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Tech Stack</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => {
                const isExpanded = expandedRows.has(lead.id);
                const missingFeatures = getMissingFeatures(lead.metrics);
                
                return (
                  <Fragment key={lead.id}>
                    <TableRow 
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50", 
                        isExpanded && "bg-muted/50 border-b-0"
                      )}
                      onClick={() => toggleRow(lead.id)}
                    >
                      <TableCell>
                        {isExpanded ? 
                          <ChevronDown className="h-4 w-4 text-muted-foreground" /> : 
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        }
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{lead.name}</span>
                          <a 
                            href={getClickableUrl(lead.domain)} 
                            target="_blank" 
                            rel="noreferrer" 
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5"
                          >
                            {formatDomainForDisplay(lead.domain)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal text-muted-foreground">
                          {lead.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={
                            lead.status === 'qualified' ? "border-emerald-500 text-emerald-500" : 
                            lead.status === 'junk' ? "border-red-500 text-red-500" : 
                            "text-muted-foreground"
                          }
                        >
                          {lead.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary" 
                              style={{ width: `${lead.score.total}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono font-medium">{lead.score.total}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {lead.metrics.cms || "Unknown"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.phone}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-lead-menu-${lead.id}`}>
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(lead.phone);
                              toast({ title: "Copied", description: "Phone number copied to clipboard" });
                            }} data-testid={`button-copy-phone-${lead.id}`}>
                              Copy Phone
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(getClickableUrl(lead.domain));
                              toast({ title: "Copied", description: "Website URL copied to clipboard" });
                            }} data-testid={`button-copy-website-${lead.id}`}>
                              Copy Website
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {staticLists.length > 0 && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()} data-testid={`button-add-to-list-trigger-${lead.id}`}>
                                  <ListPlus className="h-4 w-4 mr-2" />
                                  Add to List
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {staticLists.map((list) => (
                                    <DropdownMenuItem
                                      key={list.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addToListMutation.mutate({ listId: list.id, leadId: lead.id });
                                      }}
                                      data-testid={`button-add-lead-${lead.id}-to-list-${list.id}`}
                                    >
                                      {list.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()} data-testid={`button-view-details-${lead.id}`}>View Details</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()} data-testid={`button-mark-junk-${lead.id}`}>Mark as Junk</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    
                    {isExpanded && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50 border-t-0">
                        <TableCell colSpan={8} className="p-0">
                          <div className="p-4 pl-14 grid grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-200">
                            {/* Audit Findings */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Site Audit Findings</h4>
                              <div className="grid gap-2">
                                {missingFeatures.length > 0 ? (
                                  missingFeatures.map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm text-destructive/90 bg-destructive/10 px-3 py-2 rounded-md border border-destructive/20">
                                      <XCircle className="h-4 w-4 shrink-0" />
                                      <span className="font-medium">Missing {feature.label}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex items-center gap-2 text-sm text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-md border border-emerald-500/20">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span className="font-medium">No critical issues found</span>
                                  </div>
                                )}
                                
                                {/* Show passing checks too for balance */}
                                {lead.metrics.https_ok && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    <span>HTTPS Secured</span>
                                  </div>
                                )}
                                {lead.metrics.mobile_ok && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    <span>Mobile Optimized</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Score Breakdown */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Score Analysis</h4>
                              <div className="grid grid-cols-3 gap-4">
                                <div className="bg-background p-3 rounded-md border border-border">
                                  <span className="text-xs text-muted-foreground block mb-1">Need</span>
                                  <span className="text-xl font-mono font-bold">{lead.score.need}</span>
                                </div>
                                <div className="bg-background p-3 rounded-md border border-border">
                                  <span className="text-xs text-muted-foreground block mb-1">Value</span>
                                  <span className="text-xl font-mono font-bold">{lead.score.value}</span>
                                </div>
                                <div className="bg-background p-3 rounded-md border border-border">
                                  <span className="text-xs text-muted-foreground block mb-1">Reachability</span>
                                  <span className="text-xl font-mono font-bold">{lead.score.reachability}</span>
                                </div>
                              </div>
                              <div className="mt-2">
                                <Button size="sm" className="w-full">Generate Audit Report</Button>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
        )}
      </div>
    </div>
  );
}
