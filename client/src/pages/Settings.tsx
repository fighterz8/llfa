import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Edit2, Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const MASKED_KEY = "••••••••••••••••";

export default function SettingsPage() {
  const [provider, setProvider] = useState("openai");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [placesApiKey, setPlacesApiKey] = useState("");
  const [strictScoring, setStrictScoring] = useState(true);
  const [autoVerifyPhones, setAutoVerifyPhones] = useState(false);
  const [includeJunk, setIncludeJunk] = useState(false);
  
  const [hasExistingLlmKey, setHasExistingLlmKey] = useState(false);
  const [hasExistingPlacesKey, setHasExistingPlacesKey] = useState(false);
  const [isEditingLlmKey, setIsEditingLlmKey] = useState(false);
  const [isEditingPlacesKey, setIsEditingPlacesKey] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings/agent_config");
      if (response.ok) {
        return response.json();
      }
      return null;
    },
  });

  useEffect(() => {
    if (settingsData?.value) {
      const config = settingsData.value;
      setProvider(config.provider || "openai");
      setStrictScoring(config.strictScoring ?? true);
      setAutoVerifyPhones(config.autoVerifyPhones ?? false);
      setIncludeJunk(config.includeJunk ?? false);
      
      if (config.llmApiKey) {
        setHasExistingLlmKey(true);
        setLlmApiKey("");
      }
      if (config.placesApiKey) {
        setHasExistingPlacesKey(true);
        setPlacesApiKey("");
      }
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const existingConfig = settingsData?.value || {};
      
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "agent_config",
          value: {
            provider,
            llmApiKey: llmApiKey || existingConfig.llmApiKey || "",
            placesApiKey: placesApiKey || existingConfig.placesApiKey || "",
            strictScoring,
            autoVerifyPhones,
            includeJunk,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Your configuration has been updated successfully.",
      });
      
      if (llmApiKey) {
        setHasExistingLlmKey(true);
        setLlmApiKey("");
      }
      if (placesApiKey) {
        setHasExistingPlacesKey(true);
        setPlacesApiKey("");
      }
      
      setIsEditingLlmKey(false);
      setIsEditingPlacesKey(false);
      
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleEditLlmKey = () => {
    setIsEditingLlmKey(true);
    setLlmApiKey("");
  };

  const handleEditPlacesKey = () => {
    setIsEditingPlacesKey(true);
    setPlacesApiKey("");
  };

  const clearLeadsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/leads", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to clear leads");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Leads Cleared",
        description: `Successfully deleted ${data.deleted} leads from the database.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear leads. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-background p-8 space-y-8 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your agent's behavior and API connections.
        </p>
      </div>

      <Separator />

      <div className="grid gap-6 max-w-4xl">
        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>
              Manage the keys used by your agent to access external tools.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* LLM Provider Selection */}
            <div className="space-y-2">
              <Label>LLM Provider</Label>
              <div className="flex items-center gap-4">
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="w-[200px]" data-testid="select-provider">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
                {provider === "openai" && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    Model: gpt-5-nano
                  </Badge>
                )}
                {provider === "gemini" && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    Model: gemini-2.5-pro-flash
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose the AI model provider for the agent's core logic.
              </p>
            </div>

            {/* Dynamic API Key Input */}
            <div className="space-y-2">
              <Label htmlFor="llm-key">
                {provider === "openai" ? "OpenAI API Key" : "Google AI Studio Key"}
              </Label>
              <div className="flex gap-2">
                {hasExistingLlmKey && !isEditingLlmKey ? (
                  <>
                    <div className="flex-1 relative">
                      <Input 
                        id="llm-key" 
                        type="password" 
                        value={MASKED_KEY}
                        readOnly
                        className="font-mono bg-muted/50 pr-20"
                        data-testid="input-llm-key-masked"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-emerald-500 font-medium">Configured</span>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={handleEditLlmKey}
                      title="Change API key"
                      data-testid="button-edit-llm-key"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <div className="flex-1 flex gap-2">
                    <Input 
                      id="llm-key" 
                      type="password" 
                      placeholder={provider === "openai" ? "sk-..." : "AIza..."}
                      className="font-mono"
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      data-testid="input-llm-key"
                    />
                    {hasExistingLlmKey && isEditingLlmKey && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => { setIsEditingLlmKey(false); setLlmApiKey(""); }}
                        data-testid="button-cancel-llm-key"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {isEditingLlmKey && (
                <p className="text-xs text-muted-foreground">
                  Enter a new key to replace the existing one, or click Cancel to keep the current key.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="places-key">Google Places API Key</Label>
              <div className="flex gap-2">
                {hasExistingPlacesKey && !isEditingPlacesKey ? (
                  <>
                    <div className="flex-1 relative">
                      <Input 
                        id="places-key" 
                        type="password" 
                        value={MASKED_KEY}
                        readOnly
                        className="font-mono bg-muted/50 pr-20"
                        data-testid="input-places-key-masked"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-emerald-500 font-medium">Configured</span>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={handleEditPlacesKey}
                      title="Change API key"
                      data-testid="button-edit-places-key"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <div className="flex-1 flex gap-2">
                    <Input 
                      id="places-key" 
                      type="password" 
                      placeholder="AIza..."
                      className="font-mono"
                      value={placesApiKey}
                      onChange={(e) => setPlacesApiKey(e.target.value)}
                      data-testid="input-places-key"
                    />
                    {hasExistingPlacesKey && isEditingPlacesKey && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => { setIsEditingPlacesKey(false); setPlacesApiKey(""); }}
                        data-testid="button-cancel-places-key"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {isEditingPlacesKey && (
                <p className="text-xs text-muted-foreground">
                  Enter a new key to replace the existing one, or click Cancel to keep the current key.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Agent Behavior */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Behavior</CardTitle>
            <CardDescription>
              Fine-tune how the agent scores and filters leads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between space-x-2">
              <div className="flex flex-col space-y-1">
                <Label>Strict Scoring Mode</Label>
                <span className="text-xs text-muted-foreground">Only show leads with a score above 75</span>
              </div>
              <Switch checked={strictScoring} onCheckedChange={setStrictScoring} data-testid="switch-strict-scoring" />
            </div>
            <div className="flex items-center justify-between space-x-2">
              <div className="flex flex-col space-y-1">
                <Label>Auto-Verify Phones</Label>
                <span className="text-xs text-muted-foreground">Attempt to verify phone numbers are active</span>
              </div>
              <Switch checked={autoVerifyPhones} onCheckedChange={setAutoVerifyPhones} data-testid="switch-auto-verify" />
            </div>
            <div className="flex items-center justify-between space-x-2">
              <div className="flex flex-col space-y-1">
                <Label>Include Junk Leads</Label>
                <span className="text-xs text-muted-foreground">Show low-quality leads in the results for review</span>
              </div>
              <Switch checked={includeJunk} onCheckedChange={setIncludeJunk} data-testid="switch-include-junk" />
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Data Management
            </CardTitle>
            <CardDescription>
              Manage your leads database. These actions cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex flex-col space-y-1">
                <Label>Clear All Leads</Label>
                <span className="text-xs text-muted-foreground">
                  Permanently delete all leads, metrics, and scores from the database
                </span>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    disabled={clearLeadsMutation.isPending}
                    data-testid="button-clear-leads"
                  >
                    {clearLeadsMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear Database
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all leads from your database, including their 
                      metrics and scores. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => clearLeadsMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-clear"
                    >
                      Yes, delete all leads
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 pb-8">
          <Button variant="outline" onClick={() => window.location.reload()} data-testid="button-discard">
            Discard Changes
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending || isLoading} data-testid="button-save">
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
