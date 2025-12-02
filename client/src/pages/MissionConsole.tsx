import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, User, Terminal, Activity, Database, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type Lead } from "@/lib/mockData";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface LogEvent {
  id: number;
  eventType: string;
  toolName?: string;
  payload: { message: string };
  createdAt: string;
}

const STORAGE_KEY = "llfa_mission_state";

interface MissionState {
  missionId: string | null;
  messages: Message[];
  isRunning: boolean;
}

function loadMissionState(): MissionState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load mission state:", e);
  }
  return {
    missionId: null,
    messages: [{ id: "1", role: "assistant", content: "Ready for a new mission. What are we looking for today?\n\nTry something like: \"Find dentists in San Diego\" or \"Search for restaurants near Austin, TX\"" }],
    isRunning: false,
  };
}

function saveMissionState(state: MissionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save mission state:", e);
  }
}

export default function MissionConsole() {
  const initialState = loadMissionState();
  const [messages, setMessages] = useState<Message[]>(initialState.messages);
  const [inputValue, setInputValue] = useState("");
  const [currentMissionId, setCurrentMissionId] = useState<string | null>(initialState.missionId);
  const [isRunning, setIsRunning] = useState(initialState.isRunning);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    saveMissionState({ missionId: currentMissionId, messages, isRunning });
  }, [currentMissionId, messages, isRunning]);

  const { data: leads = [] } = useQuery({
    queryKey: ["/api/leads"],
    queryFn: async () => {
      const response = await fetch("/api/leads");
      if (!response.ok) throw new Error("Failed to fetch leads");
      return response.json() as Promise<Lead[]>;
    },
    refetchInterval: isRunning ? 2000 : false,
  });

  const { data: missionEvents = [] } = useQuery({
    queryKey: ["/api/missions", currentMissionId, "events"],
    queryFn: async () => {
      if (!currentMissionId || currentMissionId.startsWith("chat-")) return [];
      const response = await fetch(`/api/missions/${currentMissionId}/events?limit=100`);
      if (!response.ok) return [];
      const events = await response.json() as LogEvent[];
      return events.reverse();
    },
    enabled: !!currentMissionId && !currentMissionId.startsWith("chat-"),
    refetchInterval: isRunning ? 1000 : false,
  });

  const { data: mission } = useQuery({
    queryKey: ["/api/missions", currentMissionId],
    queryFn: async () => {
      if (!currentMissionId || currentMissionId.startsWith("chat-")) return null;
      const response = await fetch(`/api/missions/${currentMissionId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!currentMissionId && !currentMissionId.startsWith("chat-"),
    refetchInterval: isRunning ? 2000 : false,
  });

  useEffect(() => {
    if (mission && (mission.status === "completed" || mission.status === "failed")) {
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    }
  }, [mission, queryClient]);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mission_id: currentMissionId,
          messages: [...messages, { role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send message");
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.mission_id) {
        setCurrentMissionId(data.mission_id);
      }
      if (data.summary?.status === "running") {
        setIsRunning(true);
      }
      setMessages(prev => [
        ...prev,
        { id: Math.random().toString(), role: "assistant", content: data.assistant_message.content }
      ]);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setMessages(prev => [
        ...prev,
        { id: Math.random().toString(), role: "assistant", content: `I encountered an issue: ${error.message}` }
      ]);
    },
  });

  const scrollToBottom = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom(logsEndRef);
  }, [missionEvents, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(messagesEndRef);
  }, [messages, scrollToBottom]);

  const handleSendMessage = () => {
    if (!inputValue.trim() || chatMutation.isPending) return;

    const userMsg: Message = { id: Math.random().toString(), role: "user", content: inputValue };
    setMessages(prev => [...prev, userMsg]);
    chatMutation.mutate(inputValue);
    setInputValue("");
  };

  const handleClearSession = () => {
    setMessages([{ id: "1", role: "assistant", content: "Session cleared. What are we looking for today?" }]);
    setCurrentMissionId(null);
    setIsRunning(false);
    localStorage.removeItem(STORAGE_KEY);
    toast({ title: "Session Cleared", description: "Ready for a new mission." });
  };

  const recentLeads = leads.slice(0, 10);

  const importantEvents = missionEvents.filter(e => 
    e.eventType === "success" || 
    e.eventType === "error" || 
    e.eventType === "warning" ||
    (e.eventType === "info" && (
      e.payload?.message?.includes("QUALIFIED") ||
      e.payload?.message?.includes("Mission") ||
      e.payload?.message?.includes("Found") ||
      e.payload?.message?.includes("Target") ||
      e.payload?.message?.includes("•")
    )) ||
    e.eventType === "tool"
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header Stats */}
      <div className="border-b border-border bg-card/50 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md border",
              isRunning 
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                : "bg-primary/10 text-primary border-primary/20"
            )}>
              <Activity className={cn("h-4 w-4", isRunning && "animate-pulse")} />
              <span className="text-sm font-medium">Status: {isRunning ? "RUNNING" : "IDLE"}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md border border-border">
              <Database className="h-4 w-4" />
              <span className="text-sm font-medium">Leads Found: {leads.length}</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleClearSession}
            data-testid="button-clear-session"
          >
            <Trash2 className="h-4 w-4" />
            Clear Session
          </Button>
        </div>
      </div>

      {/* Main Content Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="w-1/2 flex flex-col border-r border-border bg-background/50">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6 max-w-2xl mx-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "assistant" ? "flex-row" : "flex-row-reverse"
                  )}
                >
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    msg.role === "assistant" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {msg.role === "assistant" ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
                  </div>
                  <div className={cn(
                    "rounded-lg p-4 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "assistant" 
                      ? "bg-muted/50 border border-border text-foreground" 
                      : "bg-primary text-primary-foreground"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}
              
              {/* Typing indicator when agent is generating response */}
              {chatMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                  data-testid="agent-typing-indicator"
                >
                  <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-primary/20 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="rounded-lg p-4 bg-muted/50 border border-border flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t border-border bg-card">
            <div className="max-w-2xl mx-auto flex gap-2">
              <Input 
                placeholder="e.g., 'Find dentists in San Diego' or ask me a question..." 
                className="bg-background border-input focus-visible:ring-primary"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={chatMutation.isPending}
                data-testid="input-mission"
              />
              <Button 
                onClick={handleSendMessage} 
                disabled={chatMutation.isPending}
                data-testid="button-send-mission"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: System & Data */}
        <div className="w-1/2 flex flex-col bg-muted/10">
          {/* Top: Terminal Logs */}
          <div className="h-1/2 flex flex-col border-b border-border">
            <div className="px-4 py-2 bg-black/90 text-zinc-400 text-xs font-mono flex items-center gap-2 border-b border-zinc-800">
              <Terminal className="h-3 w-3" />
              <span>AGENT_LOGS_STREAM</span>
              {isRunning && (
                <span className="ml-auto flex items-center gap-1 text-amber-400">
                  <span className="h-2 w-2 bg-amber-400 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <ScrollArea className="flex-1 bg-black p-4 font-mono text-xs">
              <div className="space-y-1.5">
                {importantEvents.length === 0 ? (
                  <div className="text-zinc-500 text-center py-8">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Waiting for mission start...</p>
                    <p className="text-zinc-600 mt-2">Send a search request to begin</p>
                  </div>
                ) : (
                  importantEvents.map((log) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={log.id} 
                      className="flex gap-3 items-start"
                    >
                      <span className="text-zinc-500 shrink-0">[{new Date(log.createdAt).toLocaleTimeString()}]</span>
                      <div className="flex-1 break-words">
                        {log.eventType === 'tool' && <span className="text-blue-400 font-bold mr-2">[{log.toolName}]</span>}
                        {log.eventType === 'success' && <span className="text-emerald-500 font-bold mr-2">✓</span>}
                        {log.eventType === 'error' && <span className="text-red-500 font-bold mr-2">✗</span>}
                        {log.eventType === 'warning' && <span className="text-amber-500 font-bold mr-2">⚠</span>}
                        <span className={cn(
                          log.eventType === 'success' ? "text-emerald-400" :
                          log.eventType === 'error' ? "text-red-400" :
                          log.eventType === 'warning' ? "text-amber-400" :
                          log.eventType === 'tool' ? "text-blue-300" :
                          "text-zinc-300"
                        )}>{log.payload?.message}</span>
                      </div>
                    </motion.div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </ScrollArea>
          </div>

          {/* Bottom: Live Findings */}
          <div className="h-1/2 flex flex-col bg-background">
            <div className="px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground flex items-center justify-between bg-muted/20">
              <span>QUALIFIED LEADS</span>
              <Badge variant="outline" className="text-[10px] h-5">{leads.length} TOTAL</Badge>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                <AnimatePresence>
                  {recentLeads.map((lead) => (
                    <motion.div
                      key={lead.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group"
                    >
                      <Card className="border-border/50 shadow-sm hover:border-primary/50 transition-colors cursor-pointer">
                        <CardContent className="p-3 flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-sm group-hover:text-primary transition-colors">{lead.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">{lead.category}</span>
                              {lead.domain && (
                                <>
                                  <span className="text-xs text-muted-foreground">•</span>
                                  <span className="text-xs text-muted-foreground truncate max-w-[150px]">{lead.domain}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <div className={cn(
                              "text-lg font-bold font-mono",
                              lead.score.total >= 80 ? "text-emerald-500" :
                              lead.score.total >= 50 ? "text-amber-500" : "text-red-500"
                            )}>
                              {lead.score.total}
                            </div>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</span>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {recentLeads.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm border-2 border-dashed border-border/50 rounded-lg">
                    <Activity className="h-8 w-8 mb-2 opacity-50" />
                    <span>No leads yet</span>
                    <span className="text-xs mt-1">Start a mission to find leads</span>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
