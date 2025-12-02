import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal, 
  Plus,
  ListChecks,
  Camera,
  Zap,
  Users,
  Trash2,
  Eye,
  Edit2,
  RefreshCw,
  Loader2,
  Search
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type LeadList = {
  id: string;
  name: string;
  description?: string;
  listType: "static" | "snapshot" | "dynamic";
  leadCount: number;
  filterJson?: {
    minScore?: number;
    maxScore?: number;
    status?: string[];
    categories?: string[];
    city?: string;
    state?: string;
    hasWebsite?: boolean;
    hasPhone?: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export default function ListsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<LeadList | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListType, setNewListType] = useState<"static" | "snapshot" | "dynamic">("static");
  const [minScore, setMinScore] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["/api/lists"],
    queryFn: async () => {
      const response = await fetch("/api/lists");
      if (!response.ok) {
        throw new Error("Failed to fetch lists");
      }
      return response.json() as Promise<LeadList[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; listType: string; filterJson?: object }) => {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to create list");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      setCreateDialogOpen(false);
      setNewListName("");
      setNewListDescription("");
      setNewListType("static");
      setMinScore("");
      toast({
        title: "List Created",
        description: "Your new list has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create list. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/lists/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete list");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      setDeleteDialogOpen(false);
      setListToDelete(null);
      toast({
        title: "List Deleted",
        description: "The list has been deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete list. Please try again.",
        variant: "destructive",
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/lists/${id}/refresh`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to refresh list");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
      toast({
        title: "List Refreshed",
        description: "The snapshot has been updated with current matches.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to refresh list. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredLists = lists.filter(list =>
    list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (list.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateList = () => {
    if (!newListName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a list name.",
        variant: "destructive",
      });
      return;
    }

    const filterJson = (newListType === "snapshot" || newListType === "dynamic") && minScore
      ? { minScore: parseInt(minScore) }
      : undefined;

    createMutation.mutate({
      name: newListName,
      description: newListDescription || undefined,
      listType: newListType,
      filterJson,
    });
  };

  const getListTypeIcon = (type: string) => {
    switch (type) {
      case "static":
        return <ListChecks className="h-4 w-4" />;
      case "snapshot":
        return <Camera className="h-4 w-4" />;
      case "dynamic":
        return <Zap className="h-4 w-4" />;
      default:
        return <ListChecks className="h-4 w-4" />;
    }
  };

  const getListTypeBadge = (type: string) => {
    switch (type) {
      case "static":
        return <Badge variant="secondary">Static</Badge>;
      case "snapshot":
        return <Badge variant="outline" className="border-amber-500 text-amber-600">Snapshot</Badge>;
      case "dynamic":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500">Dynamic</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background p-6 space-y-6" data-testid="lists-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Lists</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            Organize and manage your lead collections.
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-list">
              <Plus className="h-4 w-4" />
              Create List
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New List</DialogTitle>
              <DialogDescription>
                Create a list to organize your leads. Choose a type based on how you want to manage it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., High-Priority Leads"
                  data-testid="input-list-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="What is this list for?"
                  data-testid="input-list-description"
                />
              </div>
              <div className="grid gap-2">
                <Label>List Type</Label>
                <Select value={newListType} onValueChange={(v) => setNewListType(v as any)}>
                  <SelectTrigger data-testid="select-list-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="static" data-testid="option-list-type-static">
                      <div className="flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        <span>Static - Manual selection</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="snapshot" data-testid="option-list-type-snapshot">
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        <span>Snapshot - Point-in-time filter</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="dynamic" data-testid="option-list-type-dynamic">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        <span>Dynamic - Auto-updating filter</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newListType === "static" && "Add leads manually from the Leads Database."}
                  {newListType === "snapshot" && "Captures leads matching filters at creation time. Can be refreshed."}
                  {newListType === "dynamic" && "Automatically shows all leads matching filters in real-time."}
                </p>
              </div>
              {(newListType === "snapshot" || newListType === "dynamic") && (
                <div className="grid gap-2">
                  <Label htmlFor="minScore">Minimum Score (optional)</Label>
                  <Input
                    id="minScore"
                    type="number"
                    min="0"
                    max="100"
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    placeholder="e.g., 75"
                    data-testid="input-min-score"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create">
                Cancel
              </Button>
              <Button onClick={handleCreateList} disabled={createMutation.isPending} data-testid="button-confirm-create">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create List
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lists..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-lists"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLists.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <ListChecks className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No lists yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a list to organize your leads into meaningful groups.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2" data-testid="button-create-first-list">
            <Plus className="h-4 w-4" />
            Create Your First List
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Leads</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLists.map((list) => (
                <TableRow 
                  key={list.id} 
                  data-testid={`row-list-${list.id}`}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/lists/${list.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                        {getListTypeIcon(list.listType)}
                      </div>
                      <div>
                        <div className="font-medium" data-testid={`text-list-name-${list.id}`}>{list.name}</div>
                        {list.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {list.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getListTypeBadge(list.listType)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-sm" data-testid={`text-lead-count-${list.id}`}>{list.leadCount}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(list.updatedAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" data-testid={`button-list-menu-${list.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {list.listType === "snapshot" && (
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              refreshMutation.mutate(list.id);
                            }}
                            disabled={refreshMutation.isPending}
                            data-testid={`button-refresh-${list.id}`}
                          >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                            Refresh Snapshot
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setListToDelete(list);
                            setDeleteDialogOpen(true);
                          }}
                          data-testid={`button-delete-list-${list.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete List
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{listToDelete?.name}"? This action cannot be undone.
              The leads in this list will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => listToDelete && deleteMutation.mutate(listToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
