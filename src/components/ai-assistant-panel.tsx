import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { askAssistant } from "@/lib/ai-assistant.functions";

type Task = "lead_to_quote" | "verify_invoice" | "summarize_lead" | "generic";

interface Props {
  title?: string;
  task: Task;
  initialContext?: string;
  suggestions?: Array<{ label: string; context: string; task?: Task }>;
}

export function AIAssistantPanel({
  title = "AI Assistent",
  task,
  initialContext = "",
  suggestions = [],
}: Props) {
  const [input, setInput] = useState(initialContext);
  const [reply, setReply] = useState<string>("");
  const ask = useServerFn(askAssistant);

  const mutation = useMutation({
    mutationFn: async (vars: { context: string; task: Task }) => {
      return ask({ data: { task: vars.task, context: vars.context } });
    },
    onSuccess: (r) => setReply(r.reply),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <Button
                key={i}
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => {
                  setInput(s.context);
                  mutation.mutate({ context: s.context, task: s.task ?? task });
                }}
              >
                {s.label}
              </Button>
            ))}
          </div>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Beschrijf wat je wil dat de AI doet…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={mutation.isPending || !input.trim()}
            onClick={() => mutation.mutate({ context: input, task })}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="ml-2">Vraag AI</span>
          </Button>
        </div>
        {reply && (
          <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
            {reply}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
