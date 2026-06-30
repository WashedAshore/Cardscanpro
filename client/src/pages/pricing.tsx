import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useUser } from "@/App";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TIERS, BTC_WALLET, TRIAL_PREVIEW_HOURS } from "@shared/schema";
import type { TierKey } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  X,
  Copy,
  Bitcoin,
  Loader2,
  CheckCircle2,
  Tag,
  CreditCard,
  Sparkles,
  Zap,
} from "lucide-react";

type PaymentMethod = "stripe" | "bitcoin";

interface PromoResult {
  valid: boolean;
  discount?: number;
  discountType?: string;
  discountValue?: number;
  finalPrice?: number;
  message?: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tierKey: Exclude<TierKey, "free">;
  user: any;
  onSuccess: (updatedUser: any) => void;
}

function PaymentModal({ isOpen, onClose, tierKey, user, onSuccess }: PaymentModalProps) {
  const tier = TIERS[tierKey];
  const { toast } = useToast();

  const { data: stripeStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/stripe/status"],
    queryFn: async () => (await apiRequest("GET", "/api/stripe/status")).json(),
    staleTime: 60_000,
  });

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [promoCode, setPromoCode] = useState("");
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [btcTxId, setBtcTxId] = useState("");
  const [btcAmount, setBtcAmount] = useState("");
  const [success, setSuccess] = useState(false);

  // If Stripe disabled, force Bitcoin
  useEffect(() => {
    if (stripeStatus && !stripeStatus.enabled) setPaymentMethod("bitcoin");
  }, [stripeStatus]);

  const finalPrice =
    promoResult?.finalPrice !== undefined ? promoResult.finalPrice : tier.price;

  const validatePromoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/promo/validate", {
        code: promoCode.toUpperCase(),
        tier: tierKey,
      });
      return res.json();
    },
    onSuccess: (data: PromoResult) => {
      setPromoResult(data);
      if (data.valid) {
        toast({ title: "Promo code applied!", description: data.message });
      } else {
        toast({
          title: "Invalid promo code",
          description: data.message || "Code not valid for this tier.",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error validating promo", description: err.message, variant: "destructive" });
    },
  });

  const stripeCheckout = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/checkout", {
        userId: user?.id,
        tier: tierKey,
        promoCode: promoResult?.valid ? promoCode.toUpperCase() : undefined,
      });
      return res.json();
    },
    onSuccess: (data: { url?: string; trial?: { granted: boolean; reason?: string; trialEndsAt?: string } }) => {
      if (data.trial?.granted) {
        toast({
          title: `${TRIAL_PREVIEW_HOURS}h Dealer trial activated`,
          description: "Full access starts now — you'll be billed only after checkout completes.",
        });
      }
      if (data.url) window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ title: "Stripe checkout failed", description: err.message, variant: "destructive" });
    },
  });

  const btcSubmit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions", {
        userId: user?.id,
        tier: tierKey,
        btcTxId: btcTxId.trim() || undefined,
        btcAmount: btcAmount.trim() || undefined,
        promoCode: promoResult?.valid ? promoCode.toUpperCase() : undefined,
      });
      return res.json();
    },
    onSuccess: (data: { subscription: unknown; user: any }) => {
      setSuccess(true);
      if (data.user) onSuccess(data.user);
    },
    onError: (err: Error) => {
      toast({ title: "Payment submission failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(BTC_WALLET);
    toast({ title: "Copied!", description: "BTC address copied to clipboard." });
  };

  const handleClose = () => {
    setPromoCode("");
    setPromoResult(null);
    setBtcTxId("");
    setBtcAmount("");
    setSuccess(false);
    onClose();
  };

  const stripeAvailable = stripeStatus?.enabled !== false;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg" data-testid="payment-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Subscribe to {tier.name}
          </DialogTitle>
          <DialogDescription>
            Choose how you'd like to pay. {stripeAvailable && (
              <span className="text-amber-500 font-semibold">
                {" "}24-hour Dealer-tier preview unlocks instantly with checkout.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div>
              <p className="font-semibold text-base">Payment submitted</p>
              <p className="text-sm text-muted-foreground mt-1">
                BTC payment recorded — your account upgrades once confirmed (usually within 24 hours).
              </p>
            </div>
            <Button onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Tier Summary */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div>
                <p className="text-sm font-semibold">{tier.name} Plan</p>
                <p className="text-xs text-muted-foreground">Monthly subscription</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-base">${tier.price.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              </div>
            </div>

            {/* Payment method toggle */}
            {stripeAvailable && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("stripe")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${
                    paymentMethod === "stripe"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  data-testid="button-pay-stripe"
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="font-semibold">Card (Stripe)</span>
                  <span className="text-[10px] text-muted-foreground">Instant + 24h trial</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bitcoin")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${
                    paymentMethod === "bitcoin"
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-500"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  data-testid="button-pay-bitcoin"
                >
                  <Bitcoin className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold">Bitcoin</span>
                  <span className="text-[10px] text-muted-foreground">Manual confirm</span>
                </button>
              </div>
            )}

            {/* Promo Code */}
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                Promo Code (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="ENTER CODE"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="uppercase"
                />
                <Button
                  variant="outline"
                  onClick={() => validatePromoMutation.mutate()}
                  disabled={!promoCode.trim() || validatePromoMutation.isPending}
                >
                  {validatePromoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {promoResult?.valid && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {promoResult.message || "Discount applied!"}
                </div>
              )}
            </div>

            {/* Price Summary (when promo) */}
            {promoResult?.valid && (
              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Original price</span>
                  <span>${tier.price.toFixed(2)}/mo</span>
                </div>
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Discount</span>
                  <span>-${(tier.price - finalPrice).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1.5">
                  <span>Total</span>
                  <span>${finalPrice.toFixed(2)}/mo</span>
                </div>
              </div>
            )}

            {/* Stripe path */}
            {paymentMethod === "stripe" && stripeAvailable && (
              <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold">{TRIAL_PREVIEW_HOURS}-hour Dealer-tier trial included</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click below to start a Stripe Checkout. Your card is held but not charged until the trial ends.
                  Cancel anytime in the next {TRIAL_PREVIEW_HOURS}h and you won't be billed.
                </p>
                <Button
                  className="w-full"
                  onClick={() => stripeCheckout.mutate()}
                  disabled={stripeCheckout.isPending}
                  data-testid="button-stripe-checkout"
                >
                  {stripeCheckout.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Redirecting…</>
                  ) : (
                    <><CreditCard className="w-4 h-4 mr-2" />Continue with Stripe</>
                  )}
                </Button>
              </div>
            )}

            {/* Bitcoin path */}
            {paymentMethod === "bitcoin" && (
              <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-4">
                <div className="flex items-center gap-2">
                  <Bitcoin className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-semibold">Bitcoin Payment</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Send <span className="font-bold text-foreground">${finalPrice.toFixed(2)}</span> in BTC to:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 font-mono break-all border">
                    {BTC_WALLET}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopyAddress} className="shrink-0">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">BTC Transaction ID</Label>
                    <Input value={btcTxId} onChange={(e) => setBtcTxId(e.target.value)} className="font-mono text-xs" placeholder="Paste hash"/>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">BTC Amount Sent</Label>
                    <Input value={btcAmount} onChange={(e) => setBtcAmount(e.target.value)} placeholder="0.00012345"/>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => btcSubmit.mutate()}
                  disabled={btcSubmit.isPending}
                  data-testid="button-confirm-btc"
                >
                  {btcSubmit.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting…</>
                  ) : (
                    <><Bitcoin className="w-4 h-4 mr-2" />Confirm BTC Payment</>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Reviewed within 24 hours. No 24h trial preview on Bitcoin path.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const TIER_ORDER: TierKey[] = ["free", "pro", "elite", "dealer"];

export default function PricingPage() {
  const { user, setUser } = useUser();
  const [selectedTier, setSelectedTier] = useState<Exclude<TierKey, "free"> | null>(null);

  const handlePaymentSuccess = (updatedUser: any) => {
    if (setUser) setUser(updatedUser);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-10 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold mb-2">Choose Your Plan</h1>
          <p className="text-sm opacity-80">
            All paid plans include a {TRIAL_PREVIEW_HOURS}-hour Dealer-tier trial when you check out via Stripe.<br />
            Pay with card (Stripe) for instant access, or Bitcoin for full privacy.
          </p>
          {!user && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-foreground/10 border border-primary-foreground/20 px-4 py-2 text-sm">
              <span>
                <Link href="/" className="underline underline-offset-2 hover:opacity-80">
                  Create an account
                </Link>{" "}
                to subscribe.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIER_ORDER.map((key) => {
            const tier = TIERS[key];
            const isCurrentPlan = user?.tier === key;
            const isPro = key === "pro";
            const isElite = key === "elite";
            const isDealer = key === "dealer";
            const isFree = key === "free";

            return (
              <Card
                key={key}
                className={`relative flex flex-col ${
                  isPro
                    ? "border-amber-400 ring-1 ring-amber-400/50"
                    : isDealer
                    ? "border-primary"
                    : ""
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-amber-950 text-xs px-2.5 py-0.5">
                      Most Popular
                    </Badge>
                  </div>
                )}
                {isDealer && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-2.5 py-0.5">
                      For Dealers
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-3 pt-5">
                  <CardTitle className="text-base font-bold">{tier.name}</CardTitle>
                  <div className="flex items-baseline gap-1 mt-1">
                    {tier.price === 0 ? (
                      <span className="text-xl font-bold">Free</span>
                    ) : (
                      <>
                        <span className="text-xl font-bold">${tier.price}</span>
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tier.monthlyScans === -1 ? "Unlimited scans" : `${tier.monthlyScans} scans/month`}
                  </p>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-4 pb-5">
                  <ul className="space-y-1.5">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {tier.limitations.length > 0 && (
                    <ul className="space-y-1.5">
                      {tier.limitations.map((l, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto pt-2">
                    {isFree ? (
                      isCurrentPlan ? (
                        <Badge variant="outline" className="w-full justify-center py-1.5 text-xs">
                          Current Plan
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="w-full justify-center py-1.5 text-xs text-muted-foreground">
                          Free
                        </Badge>
                      )
                    ) : isCurrentPlan ? (
                      <Badge variant="outline" className="w-full justify-center py-1.5 text-xs border-green-500 text-green-600">
                        <Check className="w-3 h-3 mr-1" />
                        Active Plan
                      </Badge>
                    ) : user ? (
                      <Button
                        className={`w-full text-xs h-8 ${
                          isPro ? "bg-amber-500 hover:bg-amber-600 text-amber-950" : ""
                        }`}
                        variant={isPro || isDealer ? "default" : "outline"}
                        onClick={() => setSelectedTier(key as Exclude<TierKey, "free">)}
                      >
                        Subscribe
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full text-xs h-8" asChild>
                        <Link href="/">Log in to Subscribe</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-10 text-xs text-muted-foreground space-y-1">
          <p>All paid plans billed monthly. Stripe (card) or Bitcoin. No automatic renewals on Bitcoin path.</p>
          <p>Questions? Contact support for Dealer pricing and custom arrangements.</p>
        </div>
      </div>

      {selectedTier && (
        <PaymentModal
          isOpen={!!selectedTier}
          onClose={() => setSelectedTier(null)}
          tierKey={selectedTier}
          user={user}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
