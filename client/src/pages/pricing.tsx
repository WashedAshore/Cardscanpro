import { useState } from "react";
import { Link } from "wouter";
import { useUser } from "@/App";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TIERS, BTC_WALLET } from "@shared/schema";
import type { TierKey, User } from "@shared/schema";
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
} from "lucide-react";



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
  tierKey: TierKey;
  user: User | null;
  onSuccess: (updatedUser: User) => void;
}

function PaymentModal({ isOpen, onClose, tierKey, user, onSuccess }: PaymentModalProps) {
  const tier = TIERS[tierKey];
  const { toast } = useToast();

  const [promoCode, setPromoCode] = useState("");
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [btcTxId, setBtcTxId] = useState("");
  const [btcAmount, setBtcAmount] = useState("");
  const [success, setSuccess] = useState(false);

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
      toast({
        title: "Error validating promo",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions", {
        tier: tierKey,
        btcTxId: btcTxId.trim() || undefined,
        btcAmount: btcAmount.trim() || undefined,
        promoCode: promoResult?.valid ? promoCode.toUpperCase() : undefined,
        usdAmount: String(finalPrice),
      });
      return res.json();
    },
    onSuccess: (data: { subscription: unknown; user: User }) => {
      setSuccess(true);
      if (data.user) onSuccess(data.user);
    },
    onError: (err: Error) => {
      toast({
        title: "Payment submission failed",
        description: err.message,
        variant: "destructive",
      });
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg" data-testid="payment-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Bitcoin className="w-5 h-5 text-amber-500" />
            Subscribe to {tier.name}
          </DialogTitle>
          <DialogDescription>
            Pay with Bitcoin — your subscription activates once payment is confirmed.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div>
              <p className="font-semibold text-base">Payment submitted!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your payment is pending confirmation. Your account will be upgraded shortly.
              </p>
            </div>
            <Button onClick={handleClose} data-testid="button-close-success">
              Close
            </Button>
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

            {/* Promo Code */}
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                Promo Code
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="ENTER CODE"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="uppercase"
                  data-testid="input-promo-code"
                />
                <Button
                  variant="outline"
                  onClick={() => validatePromoMutation.mutate()}
                  disabled={!promoCode.trim() || validatePromoMutation.isPending}
                  data-testid="button-apply-promo"
                >
                  {validatePromoMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Apply"
                  )}
                </Button>
              </div>
              {promoResult?.valid && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {promoResult.message || "Discount applied!"}
                </div>
              )}
            </div>

            {/* Price Summary */}
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

            {/* BTC Payment */}
            <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-4">
              <div className="flex items-center gap-2">
                <Bitcoin className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-semibold">Bitcoin Payment</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Send <span className="font-bold text-foreground">${finalPrice.toFixed(2)}</span> in BTC to the address below:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 font-mono break-all border" data-testid="text-btc-address">
                  {BTC_WALLET}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyAddress}
                  className="shrink-0"
                  data-testid="button-copy-btc"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Transaction Details */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm" htmlFor="btc-tx-id">BTC Transaction ID</Label>
                <Input
                  id="btc-tx-id"
                  placeholder="Paste your transaction hash here"
                  value={btcTxId}
                  onChange={(e) => setBtcTxId(e.target.value)}
                  className="font-mono text-xs"
                  data-testid="input-btc-tx-id"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm" htmlFor="btc-amount">BTC Amount Sent</Label>
                <Input
                  id="btc-amount"
                  placeholder="e.g. 0.00012345"
                  value={btcAmount}
                  onChange={(e) => setBtcAmount(e.target.value)}
                  data-testid="input-btc-amount"
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => confirmPaymentMutation.mutate()}
              disabled={confirmPaymentMutation.isPending}
              data-testid="button-confirm-payment"
            >
              {confirmPaymentMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Submitting…
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Confirm Payment
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Payments are reviewed within 24 hours. You'll be upgraded automatically upon confirmation.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const TIER_ORDER: TierKey[] = ["free", "pro", "elite", "enterprise"];

export default function PricingPage() {
  const { user, setUser } = useUser();
  const onUserUpdate = (u: any) => setUser(u);
  const [selectedTier, setSelectedTier] = useState<TierKey | null>(null);

  const handlePaymentSuccess = (updatedUser: User) => {
    if (onUserUpdate) onUserUpdate(updatedUser);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-10 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold mb-2" data-testid="text-pricing-header">
            Choose Your Plan
          </h1>
          <p className="text-sm opacity-80">
            Unlock more scans, folders, and advanced features with a paid plan.
            <br />
            All payments processed via Bitcoin — fast, private, and secure.
          </p>
          {!user && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-foreground/10 border border-primary-foreground/20 px-4 py-2 text-sm">
              <span>
                <Link href="/" className="underline underline-offset-2 hover:opacity-80">
                  Create an account
                </Link>{" "}
                to subscribe to a paid plan.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tier Cards */}
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIER_ORDER.map((key) => {
            const tier = TIERS[key];
            const isCurrentPlan = user?.tier === key;
            const isPro = key === "pro";
            const isEnterprise = key === "enterprise";
            const isFree = key === "free";

            return (
              <Card
                key={key}
                className={`relative flex flex-col ${
                  isPro
                    ? "border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/50 dark:ring-amber-500/50"
                    : isEnterprise
                    ? "border-primary dark:border-primary/80"
                    : ""
                }`}
                data-testid={`card-tier-${key}`}
              >
                {/* Badges */}
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-amber-950 text-xs px-2.5 py-0.5 shadow-sm">
                      Most Popular
                    </Badge>
                  </div>
                )}
                {isEnterprise && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-2.5 py-0.5 shadow-sm">
                      Best Value
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
                    {tier.monthlyScans === -1
                      ? "Unlimited scans"
                      : `${tier.monthlyScans} scans/month`}
                  </p>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-4 pb-5">
                  {/* Features */}
                  <ul className="space-y-1.5">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Limitations */}
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

                  {/* CTA */}
                  <div className="mt-auto pt-2">
                    {isFree ? (
                      isCurrentPlan ? (
                        <Badge variant="outline" className="w-full justify-center py-1.5 text-xs" data-testid={`badge-current-plan-${key}`}>
                          Current Plan
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="w-full justify-center py-1.5 text-xs text-muted-foreground" data-testid={`badge-free-${key}`}>
                          Free
                        </Badge>
                      )
                    ) : isCurrentPlan ? (
                      <Badge variant="outline" className="w-full justify-center py-1.5 text-xs border-green-500 text-green-600 dark:text-green-400" data-testid={`badge-active-${key}`}>
                        <Check className="w-3 h-3 mr-1" />
                        Active Plan
                      </Badge>
                    ) : user ? (
                      <Button
                        className={`w-full text-xs h-8 ${
                          isPro
                            ? "bg-amber-500 hover:bg-amber-600 text-amber-950"
                            : isEnterprise
                            ? ""
                            : ""
                        }`}
                        variant={isPro || isEnterprise ? "default" : "outline"}
                        onClick={() => setSelectedTier(key)}
                        data-testid={`button-subscribe-${key}`}
                      >
                        Subscribe
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full text-xs h-8"
                        asChild
                        data-testid={`button-login-to-subscribe-${key}`}
                      >
                        <Link href="/">Log in to Subscribe</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="text-center mt-10 text-xs text-muted-foreground space-y-1">
          <p>All plans billed monthly via Bitcoin. No automatic renewals — manual payment each period.</p>
          <p>Questions? Contact support for enterprise pricing and custom arrangements.</p>
        </div>
      </div>

      {/* Payment Modal */}
      {selectedTier && selectedTier !== "free" && (
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
