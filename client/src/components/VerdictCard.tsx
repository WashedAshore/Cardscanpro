import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, Pause, Lock, Loader2 } from "lucide-react";
import { useUser } from "@/App";

/**
 * VerdictCard — surfaces CardScan Pro's Grade-or-Sell Verdict.
 * Tier gating:
 *   - Free: decision + confidence only, with upsell to Pro for the full math
 *   - Pro+: full payload — probabilities, predicted values, ROI, sell window, reasoning
 */
export function VerdictCard({ analysisId }: { analysisId: number | null }) {
  const { user } = useUser();

  const verdictMutation = useMutation({
    mutationFn: async () => {
      if (!analysisId) throw new Error("No analysis to evaluate");
      const res = await apiRequest("POST", `/api/verdict/${analysisId}`, {
        userId: user?.id,
      });
      return res.json();
    },
  });

  if (!analysisId) return null;

  const result = verdictMutation.data;
  const verdict = result?.verdict;
  const tier = result?.tier as string | undefined;
  const isFree = tier === "free" || !user;

  const decisionStyle = (() => {
    switch (verdict?.decision) {
      case "GRADE":
        return { color: "text-emerald-600 dark:text-emerald-400", icon: TrendingUp, label: "GRADE IT" };
      case "SELL_RAW":
        return { color: "text-amber-600 dark:text-amber-400", icon: TrendingDown, label: "SELL RAW" };
      case "HOLD":
        return { color: "text-blue-600 dark:text-blue-400", icon: Pause, label: "HOLD" };
      default:
        return { color: "", icon: Sparkles, label: "" };
    }
  })();

  const Icon = decisionStyle.icon;

  return (
    <Card className="border-amber-400/40 ring-1 ring-amber-400/20 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Grade-or-Sell Verdict
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-amber-500/60 text-amber-700 dark:text-amber-400">
            CardScan Pro exclusive
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!verdict && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              One-click decision: grade this card, sell it raw, or hold for a better window — backed by hard expected-value math nobody else on the market shows you.
            </p>
            <Button
              onClick={() => verdictMutation.mutate()}
              disabled={verdictMutation.isPending}
              className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold"
              data-testid="button-get-verdict"
            >
              {verdictMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Computing verdict…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Get the Verdict</>
              )}
            </Button>
          </div>
        )}

        {verdict && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`w-7 h-7 ${decisionStyle.color}`} />
                <span className={`text-2xl font-extrabold tracking-tight ${decisionStyle.color}`} data-testid="verdict-decision">
                  {decisionStyle.label}
                </span>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</div>
                <div className="text-xl font-bold">{verdict.confidence}%</div>
              </div>
            </div>

            {/* Free tier: hard paywall on the math */}
            {isFree ? (
              <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
                <Lock className="w-4 h-4 inline-block text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Unlock the math: probabilities by grade, predicted PSA 9/10 values, expected ROI, and sell-timing window.
                </p>
                <Button size="sm" asChild>
                  <a href="/pricing">Upgrade to Pro — $7.99/mo (24h Dealer trial)</a>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Money row */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Raw FMV" value={`$${(verdict.rawFmv / 100).toFixed(2)}`} />
                  <Stat label="Grade cost" value={`$${(verdict.gradeCostCents / 100).toFixed(2)}`} />
                  <Stat
                    label="E[ROI]"
                    value={`${verdict.expectedRoiCents >= 0 ? "+" : ""}$${(verdict.expectedRoiCents / 100).toFixed(2)}`}
                    accent={verdict.expectedRoiCents >= 0 ? "positive" : "negative"}
                  />
                </div>

                {/* Probability matrix */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Probability × Predicted value
                  </div>
                  {(["psa10", "psa9", "psa8", "psa_lower"] as const).map((k) => {
                    const p = verdict.probabilities[k];
                    const v = verdict.predictedGradeValues[k];
                    return (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="w-16 font-mono uppercase text-muted-foreground">{k.replace("_", " ")}</span>
                        <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${Math.round(p * 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono">{Math.round(p * 100)}%</span>
                        <span className="w-20 text-right font-mono font-semibold">${(v / 100).toFixed(0)}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-xs pt-2 border-t font-semibold">
                    <span>Expected post-grade value</span>
                    <span>${(verdict.expectedPostGradeValueCents / 100).toFixed(2)}</span>
                  </div>
                </div>

                {verdict.sellWindow && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 p-3 text-xs">
                    <span className="font-semibold">Sell window:</span> {verdict.sellWindow}
                  </div>
                )}

                {verdict.reasoning && (
                  <p className="text-xs text-muted-foreground leading-relaxed italic border-l-2 border-amber-400 pl-3">
                    {verdict.reasoning}
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => verdictMutation.mutate()}
              disabled={verdictMutation.isPending}
              className="w-full"
            >
              {verdictMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Recomputing…</>
              ) : (
                "Recompute verdict"
              )}
            </Button>
          </div>
        )}

        {verdictMutation.isError && (
          <div className="text-xs text-red-500">
            {(verdictMutation.error as Error)?.message ?? "Failed to compute verdict."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "positive" | "negative" }) {
  const color =
    accent === "positive" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "negative" ? "text-red-600 dark:text-red-400" :
    "";
  return (
    <div className="rounded-lg border bg-background p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
